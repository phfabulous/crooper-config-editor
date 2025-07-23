// src/renderer/modalHandlers.js
import { cleanObject, showError, hideError } from './utils.js';
import { PREDEFINED_VALUES, KNOWN_FIELDS_CONFIG, FIELD_CONDITIONS, CROOPER_VARIABLES } from './constants.js';
import { openUnsavedDialog } from './unsavedDialog.js';

// DOM elements (passed during initialization)
let elements;
let currentConfig;
let currentSelectedProductKey;
let currentKnownFieldsConfig;

let isEditMode = false;
let productBeingEdited = null;

// Nouvelle variable d'état pour la modale produit
let modalProductState = { isOpen: false, mode: 'none', productKey: null };

// Variable pour suivre si le formulaire a été modifié
let isFormDirty = false;


// Fonction pour générer la structure de variantes à partir de données
// Rendue exportable pour être utilisée par l'import CSV dans mainRenderer
export function generateVariantsStructure(variant1Type, variant1ValuesArray, variant2Type, variant2ValuesArray) {
    const generatedVariants = {};

    variant1ValuesArray.forEach(val1 => {
        const primaryKey = val1;
        let primaryLabel = val1;
        if (variant1Type === 'color') {
            const colorObj = PREDEFINED_VALUES.colors.find(c => c.value === val1);
            if (colorObj) {
                primaryLabel = colorObj.label;
            }
        }

        const primaryVariant = {
            type: 'child',
            [variant1Type]: primaryKey,
            [`${variant1Type}_FR`]: primaryLabel,
        };

        if (variant2Type && variant2ValuesArray.length > 0) {
            primaryVariant.variant = {};
            variant2ValuesArray.forEach(val2 => {
                primaryVariant.variant[val2] = { [variant2Type]: val2 };
            });
        }

        generatedVariants[primaryKey] = primaryVariant;
    });
    return generatedVariants;
}


export const initializeModalElements = (domElements, config, selectedKey, knownFieldsConfig) => {
    elements = domElements;
    currentConfig = config;
    currentSelectedProductKey = selectedKey;
    currentKnownFieldsConfig = knownFieldsConfig;

    // Gestionnaires d'événements pour les boutons de fermeture
    if (elements.closeButton) elements.closeButton.addEventListener('click', handleCloseModalRequest);

    // Écouteur générique pour détecter les changements dans le formulaire
    if (elements.productForm) {
        elements.productForm.addEventListener('input', () => {
            isFormDirty = true;
        });
        elements.productForm.addEventListener('change', () => {
            isFormDirty = true;
        });
    }

    if (elements.saveProductAsTemplateBtn) elements.saveProductAsTemplateBtn.addEventListener('click', () => {
        const newKeyInput = elements.dynamicFormFields.querySelector('[data-key="name"]');
        const productKeyToSave = newKeyInput ? newKeyInput.value.trim() : '';

        if (!productKeyToSave) {
            alert('Cannot save as template: product name is empty.');
            return;
        }
        document.dispatchEvent(new CustomEvent('open-save-template-naming-modal', { detail: { productKeyToSave: productKeyToSave } }));
    });
    if (elements.addMockupPathBtn) elements.addMockupPathBtn.addEventListener('click', () => addMockupPathInput(elements.mockupPathsContainer, elements.addMockupPathBtn));
    if (elements.generateVariantsBtn) elements.generateVariantsBtn.addEventListener('click', generateVariants);
    if (elements.hasAliasCheckbox) elements.hasAliasCheckbox.addEventListener('change', () => {
        if (elements.hasAliasCheckbox.checked) {
            if (elements.aliasDropdownContainer) elements.aliasDropdownContainer.classList.remove('hidden');
            populateAliasDropdown();
        } else {
            if (elements.aliasDropdownContainer) elements.aliasDropdownContainer.classList.add('hidden');
            if (elements.productAliasSelect) elements.productAliasSelect.value = '';
            if (elements.productAliasError) hideError(elements.productAliasError);
        }
        updateMockupPathVisibilityAndContent();
    });
    if (elements.productAliasSelect) elements.productAliasSelect.addEventListener('change', updateMockupPathVisibilityAndContent);

    document.querySelectorAll('.predefined-values').forEach(span => {
        span.addEventListener('click', (event) => {
            const targetId = event.target.dataset.target;
            const targetInput = document.getElementById(targetId);
            const type = event.target.textContent.trim();
            if (PREDEFINED_VALUES[type]) {
                targetInput.value = PREDEFINED_VALUES[type].map(item => typeof item === 'object' ? item.value : item).join(', ');
            }
        });
    });

    if (elements.addCustomFieldBtn) elements.addCustomFieldBtn.addEventListener('click', () => addCustomFieldInput());

    if (elements.addVariantDefaultFieldBtn) elements.addVariantDefaultFieldBtn.addEventListener('click', () => addVariantDefaultFieldRow());
    if (elements.applyVariantDefaultFieldsBtn) elements.applyVariantDefaultFieldsBtn.addEventListener('click', () => {
        const currentData = getVariantsFromDisplay();
        const defaultFields = getVariantDefaultFields();
        applyDefaultFieldsToVariants(currentData, defaultFields);
        displayCurrentVariants(currentData);
    });
    if (elements.propagateFieldsFromParentBtn) elements.propagateFieldsFromParentBtn.addEventListener('click', propagateFieldsFromParentPrompt);

    if (elements.variantDefaultFieldsContainer && elements.variantDefaultFieldsContainer.childElementCount === 0) {
        addVariantDefaultFieldRow();
    }

    if (elements.productForm) elements.productForm.addEventListener('submit', handleProductFormSubmit);

    // Initialiser les datalists des suggestions (appelées après que elements soit prêt)
    populateCrooperVariablesDatalist();
    populateKnownFieldsDatalist();

    // NOUVEAU: Gérer l'événement d'importation CSV pour les variantes
    document.addEventListener('populate-variants-from-csv', (event) => { // Changed from window.addEventListener to document.addEventListener
        handleCsvImportForVariants(event.detail.data);
    });
};

export const updateModalData = (config, selectedKey, knownFieldsConfig) => {
    currentConfig = config;
    currentSelectedProductKey = selectedKey;
    currentKnownFieldsConfig = knownFieldsConfig;
    populateAliasDropdown();
    populateKnownFieldsDatalist(); // Re-populate datalists if config changes
};

function populateCrooperVariablesDatalist() {
    const datalist = document.getElementById('crooperVariableSuggestions');
    if (datalist) {
        datalist.innerHTML = '';
        CROOPER_VARIABLES.forEach(variable => {
            const option = document.createElement('option');
            option.value = variable;
            datalist.appendChild(option);
        });
        console.log("[ModalHandlers] Crooper Variables Datalist populated.");
    } else {
        console.warn("[ModalHandlers] Crooper Variables Datalist element not found.");
    }
}

function populateKnownFieldsDatalist() {
    const datalist = document.getElementById('knownFieldSuggestions');
    if (datalist) {
        datalist.innerHTML = '';

        const allKnownFieldKeys = new Set();
        for (const typeKey in currentKnownFieldsConfig) {
            if (currentKnownFieldsConfig[typeKey] && currentKnownFieldsConfig[typeKey].fields) {
                for (const fieldKey in currentKnownFieldsConfig[typeKey].fields) {
                    allKnownFieldKeys.add(fieldKey);
                }
            }
        }
        for (const typeKey in KNOWN_FIELDS_CONFIG) {
            if (KNOWN_FIELDS_CONFIG[typeKey] && KNOWN_FIELDS_CONFIG[typeKey].fields) {
                for (const fieldKey in KNOWN_FIELDS_CONFIG[typeKey].fields) {
                    allKnownFieldKeys.add(fieldKey);
                }
            }
        }

        allKnownFieldKeys.forEach(knownKey => {
            const option = document.createElement('option');
            option.value = knownKey;
            datalist.appendChild(option);
        });
        console.log("[ModalHandlers] Known Fields Datalist populated. Count:", allKnownFieldKeys.size);
    } else {
        console.warn("[ModalHandlers] Known Fields Datalist element not found.");
    }
}


function clearModalErrors() {
    // These specific error elements are no longer directly used for dynamic fields.
    // Errors are now placed next to their respective dynamic input fields.
    // if (elements.productNameError) hideError(elements.productNameError);
    // if (elements.productTypeError) hideError(elements.productTypeError);
    // if (elements.productPrefixError) hideError(elements.productPrefixError);
    if (elements.productAliasError) hideError(elements.productAliasError);

    if (elements.dynamicFormFields) {
        elements.dynamicFormFields.querySelectorAll('.error-message').forEach(el => hideError(el));
    }
    if (elements.customFieldsContainer) {
        elements.customFieldsContainer.querySelectorAll('.error-message').forEach(el => hideError(el));
    }
}

function toggleProductTypeFields(selectedType) {
    console.log("[ModalHandlers] toggleProductTypeFields called. Selected type:", selectedType);

    // Dynamic fields determined by currentKnownFieldsConfig, so these are not directly needed anymore
    // if (elements.aliasFields) elements.aliasFields.classList.add('hidden');
    // if (elements.simpleParentFields) elements.simpleParentFields.classList.add('hidden');
    
    if (elements.parentFields) elements.parentFields.classList.add('hidden');
    if (elements.aliasSelectionGroup) elements.aliasSelectionGroup.classList.add('hidden');

    // Only hide alias/dropdown if *not* in edit mode OR if explicitly changing to alias type
    // This allows existing products to keep their alias selection visible if already set
    if (!isEditMode || selectedType === 'alias') {
        if (elements.hasAliasCheckbox) elements.hasAliasCheckbox.checked = false;
        if (elements.aliasDropdownContainer) elements.aliasDropdownContainer.classList.add('hidden');
        if (elements.productAliasSelect) elements.productAliasSelect.value = '';
    }

    if (selectedType === 'alias') {
        // dynamicFormFields will handle alias fields based on known_fields_config
        // if (elements.aliasFields) elements.aliasFields.classList.remove('hidden');
        if (elements.aliasSelectionGroup) elements.aliasSelectionGroup.classList.add('hidden');
    } else if (selectedType === 'simple' || selectedType === 'parent') {
        // dynamicFormFields will handle simple/parent fields based on known_fields_config
        // if (elements.simpleParentFields) elements.simpleParentFields.classList.remove('hidden');
        if (elements.aliasSelectionGroup) elements.aliasSelectionGroup.classList.remove('hidden');
        if (elements.parentFields) {
            if (selectedType === 'parent') {
                elements.parentFields.classList.remove('hidden');
            } else {
                elements.parentFields.classList.add('hidden');
            }
        }
    }
    populateAliasDropdown();
}

function populateAliasDropdown() {
    if (!elements.productAliasSelect) {
        console.warn("[ModalHandlers] Alias select element not found during populateAliasDropdown.");
        return;
    }
    elements.productAliasSelect.innerHTML = '<option value="">-- Sélectionner un Alias --</option>';
    if (currentConfig) {
        for (const key in currentConfig) {
            if (Object.hasOwnProperty.call(currentConfig, key) && currentConfig[key].type === 'alias') {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = key;
                elements.productAliasSelect.appendChild(option);
            }
        }
    }
    console.log("[ModalHandlers] Alias dropdown populated. Options count:", elements.productAliasSelect.options.length - 1);
}

function updateMockupPathVisibilityAndContent() {
    console.log("[ModalHandlers] updateMockupPathVisibilityAndContent called.");
    const selectedTypeInput = elements.dynamicFormFields ? elements.dynamicFormFields.querySelector('[data-key="type"]') : null;
    const selectedType = selectedTypeInput ? selectedTypeInput.value : '';

    const hasAliasChecked = elements.hasAliasCheckbox ? elements.hasAliasCheckbox.checked : false;
    const selectedAliasKey = elements.productAliasSelect ? elements.productAliasSelect.value : '';

    if (elements.mockupsSectionInModal) elements.mockupsSectionInModal.classList.add('hidden');
    if (elements.mockupsSourceInfo) elements.mockupsSourceInfo.textContent = '';

    if (elements.mockupPathsContainer && elements.addMockupPathBtn) {
        populateMockupPaths(elements.mockupPathsContainer, elements.addMockupPathBtn, []);
    }


    if (selectedType === 'alias') {
        if (productBeingEdited && productBeingEdited.type === 'alias') {
            if (elements.mockupPathsContainer && elements.addMockupPathBtn) populateMockupPaths(elements.mockupPathsContainer, elements.addMockupPathBtn, productBeingEdited.mockups);
            if (elements.mockupsSourceInfo) elements.mockupsSourceInfo.textContent = `Définis ici pour ce profil d'aliasing.`;
            if (elements.mockupPathsContainer) elements.mockupPathsContainer.dataset.mockupSource = 'self';
        }
        if (elements.mockupsSectionInModal) elements.mockupsSectionInModal.classList.remove('hidden');
    } else if ((selectedType === 'simple' || selectedType === 'parent')) {
        if (elements.mockupsSectionInModal) elements.mockupsSectionInModal.classList.remove('hidden');

        let mockupsToDisplay = [];
        if (hasAliasChecked && selectedAliasKey) {
            const aliasObject = currentConfig[selectedAliasKey];
            if (aliasObject && aliasObject.type === 'alias') {
                mockupsToDisplay = aliasObject.mockups;
                if (elements.mockupsSourceInfo) elements.mockupsSourceInfo.textContent = `Les mockups sont définis ici et sauvegardés dans le profil d'aliasing "${selectedAliasKey}".`;
                if (elements.mockupPathsContainer) elements.mockupPathsContainer.dataset.mockupSource = selectedAliasKey;
            } else {
                if (elements.mockupsSourceInfo) elements.mockupsSourceInfo.textContent = `Profil d'aliasing sélectionné invalide.`;
            }
        } else {
            // If no alias is selected, and it's a simple/parent product, use its own mockups if they exist
            if (productBeingEdited && productBeingEdited.mockups && productBeingEdited.mockups.length > 0) {
                mockupsToDisplay = productBeingEdited.mockups;
                if (elements.mockupsSourceInfo) elements.mockupsSourceInfo.textContent = `Définis ici pour ce produit (ils ne seront pas liés à un profil d'aliasing).`;
                if (elements.mockupPathsContainer) elements.mockupPathsContainer.dataset.mockupSource = 'self';
            } else {
                if (elements.mockupsSourceInfo) elements.mockupsSourceInfo.textContent = `Définir les mockups pour ce produit (ils seront stockés dans un profil d'aliasing si vous en sélectionnez un).`;
                if (elements.mockupPathsContainer) elements.mockupPathsContainer.dataset.mockupSource = 'none';
            }
        }
        if (elements.mockupPathsContainer && elements.addMockupPathBtn) populateMockupPaths(elements.mockupPathsContainer, elements.addMockupPathBtn, mockupsToDisplay);
    } else {
        if (elements.mockupsSectionInModal) elements.mockupsSectionInModal.classList.add('hidden');
    }
    console.log("[ModalHandlers] Mockup section updated. Visibility:", elements.mockupsSectionInModal ? !elements.mockupsSectionInModal.classList.contains('hidden') : 'N/A');
}

function populateMockupPaths(containerElement, addButtonElement, mockups) {
    if (!containerElement) {
        console.warn("[ModalHandlers] Missing containerElement for populateMockupPaths.");
        return;
    }
    const existingEntries = containerElement.querySelectorAll('.mockup-path-entry');
    existingEntries.forEach(entry => entry.remove());

    if (mockups && Array.isArray(mockups)) {
        mockups.forEach(mockup => {
            addMockupPathInput(containerElement, addButtonElement, mockup.path, mockup.name);
        });
    }
    console.log("[ModalHandlers] Mockup inputs populated. Count:", mockups ? mockups.length : 0);
}

function addMockupPathInput(containerElement, addButtonElement, path = '', name = '') {
    if (!containerElement || !addButtonElement) {
        console.warn("[ModalHandlers] Missing containerElement or addButtonElement for addMockupPathInput.");
        return;
    }
    const div = document.createElement('div');
    div.classList.add('mockup-path-entry');

    const pathInput = document.createElement('input');
    pathInput.type = 'text';
    pathInput.placeholder = 'Path (e.g., C:/...)';
    pathInput.classList.add('mockup-path');
    pathInput.value = path;

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Name (e.g., {label}.jpg)';
    nameInput.classList.add('mockup-name');
    nameInput.value = name;

    const removeButton = document.createElement('button');
    removeButton.textContent = 'Remove';
    removeButton.type = 'button';
    removeButton.addEventListener('click', () => {
        div.remove();
    });

    div.appendChild(pathInput);
    div.appendChild(nameInput);
    div.appendChild(removeButton);
    containerElement.insertBefore(div, addButtonElement);
}

function getMockupPathsFromForm(containerElement) {
    if (!containerElement) {
        console.warn("[ModalHandlers] Missing containerElement for getMockupPathsFromForm.");
        return [];
    }
    const mockups = [];
    const entries = containerElement.querySelectorAll('.mockup-path-entry');
    entries.forEach(entry => {
        const path = entry.querySelector('.mockup-path').value.trim();
        const name = entry.querySelector('.mockup-name').value.trim();
        if (path || name) {
            mockups.push({ path, name });
        }
    });
    return mockups;
}

function handleProductConfigChange() {
    const newProductKey = elements.productProductInput ? elements.productProductInput.value : '';
    const newType = elements.productTypeSelect ? elements.productTypeSelect.value : 'simple';
    renderDynamicFormFields({ product: newProductKey, type: newType });
    renderCustomFields({});
}

function generateVariants() {
    if (!elements.variant1TypeInput || !elements.variant1ValuesInput || !elements.variant2TypeInput || !elements.variant2ValuesInput) {
        console.warn("[ModalHandlers] Missing variant generation input elements.");
        alert('Missing variant generation input elements in the form.');
        return;
    }
    const variant1Type = elements.variant1TypeInput.value.trim().toLowerCase();
    const variant1Values = elements.variant1ValuesInput.value.split(',').map(v => v.trim()).filter(v => v);
    const variant2Type = elements.variant2TypeInput.value.trim().toLowerCase();
    const variant2Values = elements.variant2ValuesInput.value.split(',').map(v => v.trim()).filter(v => v);

    if (!variant1Type || variant1Values.length === 0) {
        alert('Please specify at least Primary Variant Type and Values.');
        return;
    }

    const generatedVariants = generateVariantsStructure(variant1Type, variant1Values, variant2Type, variant2Values);
    const defaultFields = getVariantDefaultFields();
    applyDefaultFieldsToVariants(generatedVariants, defaultFields);
    displayCurrentVariants(generatedVariants);
}

function displayCurrentVariants(variantsData) {
    if (!elements.currentVariantsDisplay) {
        console.warn("[ModalHandlers] Missing currentVariantsDisplay element.");
        return;
    }
    elements.currentVariantsDisplay.innerHTML = '';

    if (Object.keys(variantsData).length === 0) {
        elements.currentVariantsDisplay.innerHTML = '<p>No variants generated yet.</p>';
        return;
    }

    const reservedKeys = new Set(['type', 'variant', 'color', 'color_FR']);
    const fieldsToDisplaySet = new Set();
    for (const pk in variantsData) {
        const pv = variantsData[pk];
        Object.keys(pv).forEach(k => {
            if (!reservedKeys.has(k)) fieldsToDisplaySet.add(k);
        });
    }
    const fieldsToDisplay = Array.from(fieldsToDisplaySet);

    for (const primaryKey in variantsData) {
        const primaryVariant = variantsData[primaryKey];
        const colorVariantEntry = document.createElement('div');
        colorVariantEntry.classList.add('color-variant-entry');
        colorVariantEntry.dataset.variantKey = primaryKey;

        const header = document.createElement('h5');
        header.innerHTML = `
            ${primaryVariant.color || primaryKey} (${primaryVariant.color_FR || ''})
            <button type="button" class="delete-variant-btn">X</button>
        `;
        colorVariantEntry.appendChild(header);

        fieldsToDisplay.forEach(field => {
            const formGroup = document.createElement('div');
            formGroup.classList.add('form-group');
            const label = document.createElement('label');
            label.textContent = `${field.replace('_', ' ')}:`;
            const input = document.createElement('input');
            input.type = (field.includes('price') || field.includes('sale')) ? 'number' : 'text';
            if (input.type === 'number') input.step = '0.01';
            input.value = primaryVariant[field] || '';
            input.dataset.field = field;
            formGroup.appendChild(label);
            formGroup.appendChild(input);
            colorVariantEntry.appendChild(formGroup);
        });

        if (primaryVariant.variant && Object.keys(primaryVariant.variant).length > 0) {
            const sizeChipsContainer = document.createElement('div');
            sizeChipsContainer.classList.add('size-variant-chips');
            sizeChipsContainer.innerHTML = '<h6>Sizes:</h6>';

            for (const sizeKey in primaryVariant.variant) {
                const sizeChip = document.createElement('span');
                sizeChip.classList.add('size-variant-chip');
                sizeChip.textContent = sizeKey;
                const removeSizeBtn = document.createElement('button');
                removeSizeBtn.textContent = 'x';
                removeSizeBtn.classList.add('remove-size-btn');
                removeSizeBtn.type = 'button';
                removeSizeBtn.addEventListener('click', () => {
                    delete primaryVariant.variant[sizeKey];
                    displayCurrentVariants(variantsData);
                });
                sizeChip.appendChild(removeSizeBtn);
                sizeChipsContainer.appendChild(sizeChip);
            }
            colorVariantEntry.appendChild(sizeChipsContainer);
        }

        header.querySelector('.delete-variant-btn').addEventListener('click', () => {
            delete variantsData[primaryKey];
            displayCurrentVariants(variantsData);
        });

        colorVariantEntry.querySelectorAll('input').forEach(input => {
            input.addEventListener('change', (e) => {
                primaryVariant[e.target.dataset.field] = e.target.value;
            });
        });

        elements.currentVariantsDisplay.appendChild(colorVariantEntry);
    }
    elements.currentVariantsDisplay.currentVariantsData = variantsData;
}

function getVariantsFromDisplay() {
    if (!elements.currentVariantsDisplay) {
        console.warn("[ModalHandlers] Missing currentVariantsDisplay element when getting variants.");
        return {};
    }
    return elements.currentVariantsDisplay.currentVariantsData || {};
}

// Fonction pour gérer la demande de fermeture de la modale
export async function handleCloseModalRequest() {
    if (!elements.productModal) {
        console.warn("[ModalHandlers] Product modal element not found for closing request.");
        return;
    }
    if (isFormDirty) {
        const choice = await openUnsavedDialog();
        if (choice === 'save') {
            handleProductFormSubmit(new Event('submit'));
        } else if (choice === 'discard') {
            closeProductModal();
        }
    } else {
        closeProductModal();
    }
}


export function openAddProductModal() {
    console.log("[ModalHandlers] Opening Add Product Modal.");
    if (!elements.productModal || !elements.productForm || !elements.modalTitle || !elements.originalProductNameInput || !elements.dynamicFormFields || !elements.customFieldsContainer) {
        console.error("[ModalHandlers] Missing essential DOM elements to open Add Product Modal.");
        alert("Erreur interne : Impossible d'ouvrir la modale d'ajout de produit. Des éléments HTML sont manquants.");
        return;
    }

    isEditMode = false;
    modalProductState = { isOpen: true, mode: 'add', productKey: null };
    elements.modalTitle.textContent = 'Add New Product';
    elements.productForm.reset();
    elements.originalProductNameInput.value = '';
    clearModalErrors();
    if (elements.mockupPathsContainer && elements.addMockupPathBtn) populateMockupPaths(elements.mockupPathsContainer, elements.addMockupPathBtn, []);
    displayCurrentVariants({});
    if (elements.hasAliasCheckbox) elements.hasAliasCheckbox.checked = false;
    if (elements.aliasDropdownContainer) elements.aliasDropdownContainer.classList.add('hidden');
    if (elements.productAliasSelect) elements.productAliasSelect.value = '';

    if (elements.saveProductAsTemplateBtn) elements.saveProductAsTemplateBtn.style.display = 'inline-block';

    productBeingEdited = {};
    renderDynamicFormFields({});
    renderCustomFields({});

    const productTypeSelectDynamic = elements.dynamicFormFields.querySelector('[data-key="type"]');
    if (productTypeSelectDynamic) {
        toggleProductTypeFields(productTypeSelectDynamic.value);
    } else {
        toggleProductTypeFields('simple');
    }
    const productInputDynamic = elements.dynamicFormFields.querySelector('[data-key="product"]');
    if (productInputDynamic) {
        productInputDynamic.addEventListener('change', (e) => {
            const currentType = productTypeSelectDynamic ? productTypeSelectDynamic.value : 'simple';
            renderDynamicFormFields({ product: e.target.value, type: currentType });
            renderCustomFields({});
            const newTypeSelect = elements.dynamicFormFields.querySelector('[data-key="type"]');
            if (newTypeSelect) {
                toggleProductTypeFields(newTypeSelect.value);
                newTypeSelect.addEventListener('change', (ev) => toggleProductTypeFields(ev.target.value));
            }
        });
    }
    elements.productModal.style.display = 'block';
    isFormDirty = false;
    
    setTimeout(() => {
        const firstInput = elements.dynamicFormFields.querySelector('input, select, textarea');
        if (firstInput) {
            firstInput.focus();
        }
    }, 100);
}

export function openEditProductModal(productKey) {
    console.log(`[ModalHandlers] Opening edit modal for product: ${productKey}`);
    if (!elements.productModal || !elements.productForm || !elements.modalTitle || !elements.originalProductNameInput || !elements.dynamicFormFields || !elements.customFieldsContainer) {
        console.error("[ModalHandlers] Missing essential DOM elements to open Edit Product Modal.");
        alert("Erreur interne : Impossible d'ouvrir la modale d'édition de produit. Des éléments HTML sont manquants.");
        return;
    }

    isEditMode = true;
    modalProductState = { isOpen: true, mode: 'edit', productKey: productKey };
    elements.modalTitle.textContent = `Edit Product: ${productKey}`;
    elements.productForm.reset();
    clearModalErrors();

    const product = currentConfig[productKey];
    if (!product) {
        console.error(`[ModalHandlers] Product "${productKey}" not found in currentConfig for editing. This should not happen.`);
        alert('Product not found for editing.');
        return;
    }
    productBeingEdited = product;

    elements.originalProductNameInput.value = productKey;

    renderDynamicFormFields(product);
    renderCustomFields(product);

    const productTypeSelectDynamic = elements.dynamicFormFields.querySelector('[data-key="type"]');
    if (productTypeSelectDynamic) {
        toggleProductTypeFields(productTypeSelectDynamic.value);
    }
    const productInputDynamic = elements.dynamicFormFields.querySelector('[data-key="product"]');
    if (productInputDynamic) {
        productInputDynamic.addEventListener('change', (e) => {
            const currentType = productTypeSelectDynamic ? productTypeSelectDynamic.value : 'simple';
            renderDynamicFormFields({ product: e.target.value, type: currentType });
            renderCustomFields({});
            const newTypeSelect = elements.dynamicFormFields.querySelector('[data-key="type"]');
            if (newTypeSelect) {
                toggleProductTypeFields(newTypeSelect.value);
                newTypeSelect.addEventListener('change', (ev) => toggleProductTypeFields(ev.target.value));
            }
        });
    }

    populateAliasDropdown();
    console.log(`[ModalHandlers] Product ${productKey} alias property in config:`, product.alias);

    if (product.type !== 'alias' && product.hasOwnProperty('alias') && typeof product.alias === 'string' && product.alias.trim() !== '') {
        console.log(`[ModalHandlers] Attempting to set alias UI for product ${productKey}. Alias value: "${product.alias}"`);
        if (elements.productAliasSelect) elements.productAliasSelect.value = product.alias;

        if (elements.productAliasSelect && elements.productAliasSelect.value === product.alias) {
            console.log(`[ModalHandlers] Alias "${product.alias}" successfully selected in UI.`);
            if (elements.hasAliasCheckbox) elements.hasAliasCheckbox.checked = true;
            if (elements.aliasDropdownContainer) elements.aliasDropdownContainer.classList.remove('hidden');
        } else {
            console.warn(`[ModalHandlers] Alias "${product.alias}" referenced by product "${productKey}" not found in current dropdown options. Clearing alias link in UI.`);
            if (elements.hasAliasCheckbox) elements.hasAliasCheckbox.checked = false;
            if (elements.productAliasSelect) elements.productAliasSelect.value = '';
        }
    } else {
        console.log(`[ModalHandlers] Product ${productKey} does NOT have a valid alias or is an alias itself. Resetting alias UI.`);
        if (elements.hasAliasCheckbox) elements.hasAliasCheckbox.checked = false;
        if (elements.aliasDropdownContainer) elements.aliasDropdownContainer.classList.add('hidden');
        if (elements.productAliasSelect) elements.productAliasSelect.value = '';
    }

    updateMockupPathVisibilityAndContent();

    if (product.type === 'parent') {
        displayCurrentVariants(product.variant || {});
    } else {
        displayCurrentVariants({});
    }

    if (elements.saveProductAsTemplateBtn) elements.saveProductAsTemplateBtn.style.display = 'inline-block';
    elements.productModal.style.display = 'block';
    isFormDirty = false;
    console.log(`[ModalHandlers] Edit modal for ${productKey} opened. Final Alias UI state: checkbox=${elements.hasAliasCheckbox ? elements.hasAliasCheckbox.checked : 'N/A'}, select value="${elements.productAliasSelect ? elements.productAliasSelect.value : 'N/A'}"`);

    setTimeout(() => {
        const firstInput = elements.dynamicFormFields.querySelector('input, select, textarea');
        if (firstInput) {
            firstInput.focus();
        }
    }, 100);
}

export function closeProductModal() {
    console.log("[ModalHandlers] Closing product modal.");
    if (!elements.productModal || !elements.productForm) {
        console.warn("[ModalHandlers] Product modal or form element not found for closing.");
        return;
    }
    modalProductState = { isOpen: false, mode: 'none', productKey: null };
    elements.productModal.style.display = 'none';
    elements.productForm.reset();
    clearModalErrors();
    if (elements.mockupPathsContainer && elements.addMockupPathBtn) populateMockupPaths(elements.mockupPathsContainer, elements.addMockupPathBtn, []);
    displayCurrentVariants({});
    if (elements.hasAliasCheckbox) elements.hasAliasCheckbox.checked = false;
    if (elements.aliasDropdownContainer) elements.aliasDropdownContainer.classList.add('hidden');
    if (elements.productAliasSelect) elements.productAliasSelect.value = '';
    if (elements.saveProductAsTemplateBtn) elements.saveProductAsTemplateBtn.style.display = 'none';
    productBeingEdited = null;
    if (elements.dynamicFormFields) elements.dynamicFormFields.innerHTML = '';
    if (elements.customFieldsContainer) elements.customFieldsContainer.innerHTML = '';
    isFormDirty = false;
}

function renderDynamicFormFields(productData = {}) {
    console.log("[ModalHandlers] Rendering dynamic form fields for product type:", productData.type || 'new product');
    if (!elements.dynamicFormFields || !currentKnownFieldsConfig) {
        console.error("[ModalHandlers] Missing dynamicFormFields or currentKnownFieldsConfig for rendering dynamic fields.");
        return;
    }
    elements.dynamicFormFields.innerHTML = '';

    let productTypeKey = productData.product;
    if (!productTypeKey && productData.type) {
        productTypeKey = productData.type;
    } else if (!productTypeKey) {
        productTypeKey = Object.keys(currentKnownFieldsConfig)[0] || 'simple';
    }

    let fieldsConfig = currentKnownFieldsConfig[productTypeKey];

    if (!fieldsConfig) {
        console.warn(`[ModalHandlers] No specific field config found for product type/product: "${productTypeKey}". Attempting generic type based on productData.type.`);
        fieldsConfig = currentKnownFieldsConfig[productData.type] || {
            displayOrder: [],
            fields: {}
        };
        if (Object.keys(fieldsConfig.fields).length === 0) {
             console.warn("[ModalHandlers] No generic field config found, using minimal default fields.");
             fieldsConfig = {
                displayOrder: ["name", "type", "prefix"],
                fields: {
                    "name": { "type": "text", "label": "Product Key / Name", "required": true },
                    "type": { "type": "select", "label": "Type de Produit", "options": ["alias", "simple", "parent"], "required": true },
                    "prefix": { "type": "text", "label": "Prefix SKU", "required": true }
                }
            };
        }
    }


    fieldsConfig.displayOrder.forEach(fieldKey => {
        const fieldInfo = fieldsConfig.fields[fieldKey];
        if (!fieldInfo) {
            console.warn(`[ModalHandlers] Field config not found for key: ${fieldKey}`);
            return;
        }

        const formGroup = document.createElement('div');
        formGroup.classList.add('form-group');

        const label = document.createElement('label');
        label.textContent = fieldInfo.label + (fieldInfo.required ? '*' : '') + ':';
        formGroup.appendChild(label);

        let inputElement;
        let fieldValue = productData;
        const pathParts = fieldKey.split('.');
        for (let i = 0; i < pathParts.length; i++) {
            if (fieldValue && typeof fieldValue === 'object' && fieldValue.hasOwnProperty(pathParts[i])) {
                fieldValue = fieldValue[pathParts[i]];
            } else {
                fieldValue = undefined;
                break;
            }
        }
        let displayValue = (fieldValue === undefined || fieldValue === null) ? '' : fieldValue;


        switch (fieldInfo.type) {
            case 'text':
            case 'number':
                inputElement = document.createElement('input');
                inputElement.type = fieldInfo.type;
                inputElement.value = displayValue;
                if (fieldInfo.type === 'number') inputElement.step = '0.01';

                if (fieldInfo.type === 'text' || fieldInfo.type === 'imageUrl') {
                    inputElement.setAttribute('list', 'crooperVariableSuggestions');
                }
                break;
            case 'textarea':
                inputElement = document.createElement('textarea');
                inputElement.value = displayValue;
                inputElement.setAttribute('list', 'crooperVariableSuggestions');
                break;
            case 'select':
                inputElement = document.createElement('select');
                fieldInfo.options.forEach(optionValue => {
                    const option = document.createElement('option');
                    option.value = optionValue;
                    option.textContent = optionValue;
                    inputElement.appendChild(option);
                });
                inputElement.value = displayValue;
                break;
            case 'checkbox':
                inputElement = document.createElement('input');
                inputElement.type = 'checkbox';
                inputElement.checked = !!displayValue;
                break;
            case 'imageUrl':
                inputElement = document.createElement('input');
                inputElement.type = 'text';
                inputElement.value = displayValue;
                inputElement.setAttribute('list', 'crooperVariableSuggestions');
                break;
            default:
                console.warn(`[ModalHandlers] Unknown field type: ${fieldInfo.type}`);
                return;
        }

        inputElement.classList.add('dynamic-field');
        inputElement.dataset.key = fieldKey;
        inputElement.disabled = fieldInfo.disabled || false;

        inputElement.addEventListener('change', (e) => {
            isFormDirty = true;
            if (fieldKey === 'type') {
                toggleProductTypeFields(e.target.value);
                updateMockupPathVisibilityAndContent();
            }
        });
        inputElement.addEventListener('input', () => {
            isFormDirty = true;
        });


        formGroup.appendChild(inputElement);

        const orderWrapper = document.createElement('div');
        orderWrapper.classList.add('field-order-buttons');
        const upBtn = document.createElement('button');
        upBtn.type = 'button';
        upBtn.textContent = '↑';
        upBtn.classList.add('move-field-up-btn');
        upBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const prev = formGroup.previousElementSibling;
            if (prev) {
                elements.dynamicFormFields.insertBefore(formGroup, prev);
            }
        });
        const downBtn = document.createElement('button');
        downBtn.type = 'button';
        downBtn.textContent = '↓';
        downBtn.classList.add('move-field-down-btn');
        downBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const next = formGroup.nextElementSibling;
            if (next) {
                elements.dynamicFormFields.insertBefore(next, formGroup);
            }
        });
        orderWrapper.appendChild(upBtn);
        orderWrapper.appendChild(downBtn);
        formGroup.appendChild(orderWrapper);

        const errorMessage = document.createElement('span');
        errorMessage.classList.add('error-message');
        errorMessage.dataset.key = `${fieldKey}Error`;
        formGroup.appendChild(errorMessage);

        elements.dynamicFormFields.appendChild(formGroup);
    });


    // Mettre à jour les références des éléments DOM après leur (re)création dynamique.
    // C'est crucial pour que les gestionnaires d'événements et le reste du code y accèdent correctement.
    // NOTE: Ces sélecteurs sont corrects si les data-key correspondent aux IDs ou noms de champ.
    elements.productNameInput = elements.dynamicFormFields.querySelector('[data-key="name"]');
    elements.productTypeSelect = elements.dynamicFormFields.querySelector('[data-key="type"]');
    elements.productPrefixInput = elements.dynamicFormFields.querySelector('[data-key="prefix"]');
    elements.productCategoryInput = elements.dynamicFormFields.querySelector('[data-key="category"]');
    elements.productGenreInput = elements.dynamicFormFields.querySelector('[data-key="genre"]');
    elements.productProductInput = elements.dynamicFormFields.querySelector('[data-key="product"]');
    elements.erpCategoryInput = elements.dynamicFormFields.querySelector('[data-key="ERPCategory"]');
    elements.priceInput = elements.dynamicFormFields.querySelector('[data-key="price"]');
    elements.weightInput = elements.dynamicFormFields.querySelector('[data-key="weight"]');
    elements.amazonTitleFrInput = elements.dynamicFormFields.querySelector('[data-key="amazon.Title_FR"]');
    elements.amazonDesCourtesTextarea = elements.dynamicFormFields.querySelector('[data-key="amazon.DesCourtes"]');
    elements.aliasAspectInput = elements.dynamicFormFields.querySelector('[data-key="aspect"]');
    elements.aliasDensiteInput = elements.dynamicFormFields.querySelector('[data-key="densite"]');
    elements.aliasDimentionsInput = elements.dynamicFormFields.querySelector('[data-key="dimentions"]');
    elements.aliasSizeImpressionInput = elements.dynamicFormFields.querySelector('[data-key="sizeImpression"]');

    
    if (elements.productTypeSelect) {
        toggleProductTypeFields(elements.productTypeSelect.value);
        elements.productTypeSelect.addEventListener('change', () => handleProductConfigChange());
    }
    if (elements.productProductInput) {
        elements.productProductInput.addEventListener('change', () => handleProductConfigChange());
    }

    console.log("[ModalHandlers] Dynamic form fields rendered.");
}

function renderCustomFields(productData = {}) {
    console.log("[ModalHandlers] Rendering custom fields.");
    if (!elements.customFieldsContainer || !currentKnownFieldsConfig) {
        console.error("[ModalHandlers] Missing customFieldsContainer or currentKnownFieldsConfig for rendering custom fields.");
        return;
    }
    elements.customFieldsContainer.innerHTML = '';

    const allKnownFieldKeys = new Set();
    for (const typeKey in currentKnownFieldsConfig) {
        if (currentKnownFieldsConfig[typeKey] && currentKnownFieldsConfig[typeKey].fields) {
            for (const fieldKey in currentKnownFieldsConfig[typeKey].fields) {
                allKnownFieldKeys.add(fieldKey); 
            }
        }
    }
    for (const typeKey in KNOWN_FIELDS_CONFIG) {
        if (KNOWN_FIELDS_CONFIG[typeKey] && KNOWN_FIELDS_CONFIG[typeKey].fields) {
            for (const fieldKey in KNOWN_FIELDS_CONFIG[typeKey].fields) { 
                allKnownFieldKeys.add(fieldKey);
            }
        }
    }


    const systemOrStructuralKeys = new Set([
        'type', 'name', 'prefix', 'mockups', 'variant', 'alias',
        'CompositeItem', 'tree', 'sku', 'parentSku',
        'marque', 'stock', 'tax_status', 'dossier',
        'friendlyName'
    ]);

    function extractUnknownFields(obj, prefix = '') {
        const unknownFields = {};
        for (const key in obj) {
            if (Object.hasOwnProperty.call(obj, key)) {
                const fullKey = prefix ? `${prefix}.${key}` : key;
                if (!fullKey) continue;

                const isObjectOrArray = typeof obj[key] === 'object' && obj[key] !== null;
                const isEmptyObject = isObjectOrArray && !Array.isArray(obj[key]) && Object.keys(obj[key]).length === 0;
                const isEmptyArray = isObjectOrArray && Array.isArray(obj[key]) && obj[key].length === 0;

                if (isObjectOrArray && !Array.isArray(obj[key]) && !isEmptyObject) {
                    const nestedUnknowns = extractUnknownFields(obj[key], fullKey);
                    if (Object.keys(nestedUnknowns).length > 0 || isEmptyObject || isEmptyArray) {
                        Object.assign(unknownFields, nestedUnknowns);
                    }
                } else {
                    let isKnownDirectly = allKnownFieldKeys.has(fullKey);
                    let isSystemOrStructural = systemOrStructuralKeys.has(fullKey) || systemOrStructuralKeys.has(key);
                    let isKnownNested = false;

                    if (!isKnownDirectly && !isSystemOrStructural) {
                        for (const knownKey of allKnownFieldKeys) {
                            if (fullKey.startsWith(`${knownKey}.`) || knownKey.startsWith(fullKey) || fullKey === knownKey) {
                                isKnownNested = true;
                                break;
                            }
                        }
                    }
                    
                    if (!isKnownDirectly && !isSystemOrStructural && !isKnownNested) {
                        unknownFields[fullKey] = obj[key];
                    }
                }
            }
        }
        return unknownFields;
    }

    const customFields = extractUnknownFields(productData);

    for (const fieldKey in customFields) {
        addCustomFieldInput(fieldKey, customFields[fieldKey]);
    }
}

function addCustomFieldInput(fieldKey = '', fieldValue = '') {
    if (!elements.customFieldsContainer) {
        console.warn("[ModalHandlers] Missing customFieldsContainer for addCustomFieldInput.");
        return;
    }
    const customFieldRow = document.createElement('div');
    customFieldRow.classList.add('custom-field-row');

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.classList.add('custom-field-key');
    keyInput.placeholder = 'Key (e.g., custom.property)';
    keyInput.value = fieldKey;
    keyInput.setAttribute('list', 'knownFieldSuggestions');
    keyInput.autocomplete = 'off';

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.classList.add('custom-field-value');
    valueInput.placeholder = 'Value';
    valueInput.value = fieldValue;
    valueInput.setAttribute('list', 'crooperVariableSuggestions');


    const removeButton = document.createElement('button');
    removeButton.textContent = 'X';
    removeButton.classList.add('remove-custom-field-btn');
    removeButton.type = 'button';
    removeButton.addEventListener('click', () => {
        customFieldRow.remove();
        isFormDirty = true;
    });

    const promoteButton = document.createElement('button');
    promoteButton.textContent = 'Promote to Known';
    promoteButton.classList.add('promote-field-btn');
    promoteButton.type = 'button';
    promoteButton.addEventListener('click', () => {
        const key = keyInput.value.trim();
        const value = valueInput.value.trim();
        if (key) {
            document.dispatchEvent(new CustomEvent('promote-field-to-known', {
                detail: { fieldKey: key, fieldValue: value, modalState: modalProductState }
            }));
        } else {
            alert('Cannot promote an empty key.');
        }
    });

    keyInput.addEventListener('change', () => { isFormDirty = true; });
    keyInput.addEventListener('input', () => { isFormDirty = true; });
    valueInput.addEventListener('change', () => { isFormDirty = true; });
    valueInput.addEventListener('input', () => { isFormDirty = true; });


    customFieldRow.appendChild(keyInput);
    customFieldRow.appendChild(valueInput);
    customFieldRow.appendChild(promoteButton);
    customFieldRow.appendChild(removeButton);

    elements.customFieldsContainer.appendChild(customFieldRow);
}

function getKnownFieldOptions(fieldKey) {
    if (currentKnownFieldsConfig) {
        for (const typeKey in currentKnownFieldsConfig) {
            const fieldInfo = currentKnownFieldsConfig[typeKey]?.fields?.[fieldKey];
            if (fieldInfo && Array.isArray(fieldInfo.options)) {
                return fieldInfo.options;
            }
        }
    }
    for (const typeKey in KNOWN_FIELDS_CONFIG) {
        const fieldInfo = KNOWN_FIELDS_CONFIG[typeKey]?.fields?.[fieldKey];
        if (fieldInfo && Array.isArray(fieldInfo.options)) {
            return fieldInfo.options;
        }
    }
    return [];
}

function populateDatalist(datalist, values) {
    datalist.innerHTML = '';
    values.forEach(val => {
        const option = document.createElement('option');
        option.value = val;
        datalist.appendChild(option);
    });
}

function addVariantDefaultFieldRow(key = '', value = '', level = 'variant') {
    if (!elements.variantDefaultFieldsContainer) return;
    const row = document.createElement('div');
    row.classList.add('variant-default-field-row');

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.placeholder = 'Key';
    keyInput.value = key;
    keyInput.setAttribute('list', 'knownFieldSuggestions');
    keyInput.autocomplete = 'off';
    
    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.placeholder = 'Value';
    valueInput.value = value;

    
    const valueDatalist = document.createElement('datalist');
    const datalistId = `variant-value-${Date.now()}-${Math.floor(Math.random()*1000)}`;
    valueDatalist.id = datalistId;
    valueInput.setAttribute('list', datalistId);

    const updateValueSuggestions = () => {
        const options = getKnownFieldOptions(keyInput.value);
        const combined = [...CROOPER_VARIABLES, ...options];
        populateDatalist(valueDatalist, combined);
    };
    updateValueSuggestions();
    keyInput.addEventListener('input', updateValueSuggestions);

    const levelSelect = document.createElement('select');
    const optVariant = document.createElement('option');
    optVariant.value = 'variant';
    optVariant.textContent = 'Variant';
    const optSub = document.createElement('option');
    optSub.value = 'subvariant';
    optSub.textContent = 'Sub-variant';
    levelSelect.appendChild(optVariant);
    levelSelect.appendChild(optSub);
    levelSelect.value = level;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'X';
    removeBtn.addEventListener('click', () => row.remove());

    row.appendChild(keyInput);
    row.appendChild(valueInput);
    row.appendChild(valueDatalist);
    row.appendChild(levelSelect);
    row.appendChild(removeBtn);
    elements.variantDefaultFieldsContainer.appendChild(row);
}

function getVariantDefaultFields() {
    const defaults = [];
    if (!elements.variantDefaultFieldsContainer) return defaults;
    elements.variantDefaultFieldsContainer.querySelectorAll('.variant-default-field-row').forEach(row => {
        const key = row.querySelector('input[type="text"]')?.value.trim();
        const inputs = row.querySelectorAll('input[type="text"]');
        const value = inputs[1]?.value ?? '';
        const level = row.querySelector('select')?.value || 'variant';
        if (key) {
            defaults.push({ key, value, level });
        }
    });
    return defaults;
}

function applyDefaultFieldsToVariants(variantsData, fields) {
    fields.forEach(f => {
        for (const primaryKey in variantsData) {
            const primaryVar = variantsData[primaryKey];
            if (f.level === 'variant') {
                if (primaryVar[f.key] === undefined) primaryVar[f.key] = f.value;
            }
            if (f.level === 'subvariant' && primaryVar.variant) {
                for (const subKey in primaryVar.variant) {
                    if (primaryVar.variant[subKey][f.key] === undefined) {
                        primaryVar.variant[subKey][f.key] = f.value;
                    }
                }
            }
        }
    });
}

function getParentFieldValues(fieldKeys) {
    const values = {};
    fieldKeys.forEach(key => {
        let val;
        const input = elements.dynamicFormFields.querySelector(`[data-key="${key}"]`);
        if (input) {
            val = input.type === 'checkbox' ? input.checked : input.value;
        } else if (elements.customFieldsContainer) {
            elements.customFieldsContainer.querySelectorAll('.custom-field-row').forEach(row => {
                const k = row.querySelector('.custom-field-key').value.trim();
                if (k === key) {
                    val = row.querySelector('.custom-field-value').value;
                }
            });
        }
        if (val !== undefined) {
            values[key] = val;
        }
    });
    return values;
}

function propagateFieldsToVariants(variantsData, fieldValues, level) {
    for (const pk in variantsData) {
        const pv = variantsData[pk];
        if (level === 'variant') {
            Object.keys(fieldValues).forEach(k => {
                pv[k] = fieldValues[k];
            });
        }
        if (level === 'subvariant' && pv.variant) {
            for (const sk in pv.variant) {
                Object.keys(fieldValues).forEach(k => {
                    pv.variant[sk][k] = fieldValues[k];
                });
            }
        }
    }
}

function propagateFieldsFromParentPrompt() {
    const fieldStr = prompt('Field keys to copy (comma-separated):');
    if (!fieldStr) return;
    const levelStr = prompt('Copy to level 1 (variant) or 2 (subvariant)? Enter 1 or 2:');
    const level = (levelStr && levelStr.trim() === '2') ? 'subvariant' : 'variant';
    const fieldKeys = fieldStr.split(',').map(f => f.trim()).filter(f => f);
    if (fieldKeys.length === 0) return;
    const variantsData = getVariantsFromDisplay();
    const parentValues = getParentFieldValues(fieldKeys);
    propagateFieldsToVariants(variantsData, parentValues, level);
    displayCurrentVariants(variantsData);
}

// Fonction pour gérer les données CSV importées et pré-remplir les champs de variantes
function handleCsvImportForVariants(csvData) {
    console.log("[ModalHandlers] Processing CSV data for variants:", csvData);
    if (!csvData || csvData.length === 0) {
        alert("No valid data found in the CSV file for variants.");
        return;
    }

    const firstRow = csvData[0];
    let variant1Type = '';
    let variant1Values = [];
    let variant2Type = '';
    let variant2Values = [];

    const headers = Object.keys(firstRow).map(h => h.toLowerCase());

    if (headers.includes('variant1type') && headers.includes('variant1values')) {
        variant1Type = firstRow['variant1type'] || '';
        variant1Values = firstRow['variant1values'] ? firstRow['variant1values'].split(',').map(v => v.trim()).filter(v => v) : [];
    } else if (headers.includes('color')) {
        variant1Type = 'color';
        variant1Values = csvData.map(row => row['color']).filter(v => v);
    }

    if (headers.includes('variant2type') && headers.includes('variant2values')) {
        variant2Type = firstRow['variant2type'] || '';
        variant2Values = firstRow['variant2values'] ? firstRow['variant2values'].split(',').map(v => v.trim()).filter(v => v) : [];
    } else if (headers.includes('size')) {
        variant2Type = 'size';
        variant2Values = csvData.map(row => row['size']).filter(v => v);
    }

    variant1Values = [...new Set(variant1Values)];
    variant2Values = [...new Set(variant2Values)];

    // Pré-remplir les champs dans la modale
    if (elements.variant1TypeInput) elements.variant1TypeInput.value = variant1Type;
    if (elements.variant1ValuesInput) elements.variant1ValuesInput.value = variant1Values.join(', ');
    if (elements.variant2TypeInput) elements.variant2TypeInput.value = variant2Type;
    if (elements.variant2ValuesInput) elements.variant2ValuesInput.value = variant2Values.join(', ');

    // Déclencher la génération des variantes si nous avons des données pour le premier groupe
    if (variant1Type && variant1Values.length > 0) {
        const generatedVariantObject = generateVariantsStructure(variant1Type, variant1Values, variant2Type, variant2Values);
        const defaultFields = getVariantDefaultFields();
        applyDefaultFieldsToVariants(generatedVariantObject, defaultFields);
        displayCurrentVariants(generatedVariantObject);
    }

    // S'assurer que le type de produit est "parent" si des variantes sont importées
    const productTypeSelectDynamic = elements.dynamicFormFields.querySelector('[data-key="type"]');
    if (productTypeSelectDynamic && productTypeSelectDynamic.value !== 'parent') {
        productTypeSelectDynamic.value = 'parent';
        const changeEvent = new Event('change');
        productTypeSelectDynamic.dispatchEvent(changeEvent);
    }
    
    isFormDirty = true;
    alert("Variant data imported successfully from CSV!");
}


async function handleProductFormSubmit(event) {
    event.preventDefault();

    clearModalErrors();

    const originalKey = elements.originalProductNameInput.value;
    const newKeyInput = elements.dynamicFormFields.querySelector('[data-key="name"]');
    const typeInput = elements.dynamicFormFields.querySelector('[data-key="type"]');
    const prefixInput = elements.dynamicFormFields.querySelector('[data-key="prefix"]');

    const newKey = newKeyInput ? newKeyInput.value.trim() : '';
    const type = typeInput ? typeInput.value : '';
    const prefix = prefixInput ? prefixInput.value.trim() : '';

    let isValid = true;
    let productData = {};

    elements.dynamicFormFields.querySelectorAll('.dynamic-field').forEach(inputElement => {
        const fieldKey = inputElement.dataset.key;
        let value;
        if (inputElement.type === 'checkbox') {
            value = inputElement.checked;
        } else {
            value = inputElement.value;
        }

        let productTypeForFieldConfig = productData.product;
        if (!productTypeForFieldConfig && productData.type) {
            productTypeForFieldConfig = productData.type;
        } else if (!productTypeForFieldConfig) {
            productTypeForFieldConfig = type;
        }

        const fieldsConfigToCheck = currentKnownFieldsConfig[productTypeForFieldConfig] || KNOWN_FIELDS_CONFIG["tshirt"];
        const fieldInfo = fieldsConfigToCheck?.fields[fieldKey];

        if (fieldInfo && fieldInfo.type === 'number') {
            value = parseFloat(value);
            if (isNaN(value)) value = '';
        }

        const pathParts = fieldKey.split('.');
        let currentLevel = productData;
        for (let i = 0; i < pathParts.length; i++) {
            const part = pathParts[i];
            if (i === pathParts.length - 1) {
                currentLevel[part] = value;
            } else {
                if (!currentLevel[part] || typeof currentLevel[part] !== 'object' || Array.isArray(currentLevel[part])) {
                    currentLevel[part] = {};
                }
                currentLevel = currentLevel[part];
            }
        }
    });

    // Collecter les champs personnalisés
    elements.customFieldsContainer.querySelectorAll('.custom-field-row').forEach(row => {
        const key = row.querySelector('.custom-field-key').value.trim();
        const value = row.querySelector('.custom-field-value').value;

        if (key) {
            const pathParts = key.split('.');
            let currentLevel = productData;
            for (let i = 0; i < pathParts.length; i++) {
                const part = pathParts[i];
                if (i === pathParts.length - 1) {
                    currentLevel[part] = value;
                } else {
                    if (!currentLevel[part] || typeof currentLevel[part] !== 'object' || Array.isArray(currentLevel[part])) {
                        currentLevel[part] = {};
                    }
                    currentLevel = currentLevel[part];
                }
            }
        }
    });


    // Validation des champs requis
    const productTypeForValidation = productData.product || (productData.type === 'alias' ? 'alias' : (productData.type === 'simple' ? 'simple' : 'parent'));
    const fieldsConfigForValidation = currentKnownFieldsConfig[productTypeForValidation] || KNOWN_FIELDS_CONFIG["tshirt"];


    if (fieldsConfigForValidation && fieldsConfigForValidation.fields) {
        for (const fieldKey in fieldsConfigForValidation.fields) {
            const fieldInfo = fieldsConfigForValidation.fields[fieldKey];
            if (fieldInfo.required) {
                let fieldValue = productData;
                const pathParts = fieldKey.split('.');
                for (let i = 0; i < pathParts.length; i++) {
                    if (fieldValue && typeof fieldValue === 'object' && fieldValue.hasOwnProperty(pathParts[i])) {
                        fieldValue = fieldValue[pathParts[i]];
                    } else {
                        fieldValue = undefined;
                        break;
                    }
                }

                const errorMessageElement = elements.dynamicFormFields.querySelector(`[data-key="${fieldKey}Error"]`);
                if (fieldValue === undefined || (typeof fieldValue === 'string' && fieldValue.trim() === '') || (Array.isArray(fieldValue) && fieldValue.length === 0)) {
                    if (errorMessageElement) showError(errorMessageElement, `${fieldInfo.label} is required.`);
                    isValid = false;
                } else {
                    if (errorMessageElement) hideError(errorMessageElement);
                }
            }
        }
    }


    const productNameErrorMessage = elements.dynamicFormFields.querySelector('[data-key="nameError"]'); // Use dynamic error element
    if (!newKey) {
        if (productNameErrorMessage) showError(productNameErrorMessage, 'Product Key / Name is required.');
        isValid = false;
    } else if (!isEditMode || (isEditMode && newKey !== originalKey)) {
        if (currentConfig.hasOwnProperty(newKey)) {
            if (productNameErrorMessage) showError(productNameErrorMessage, 'A product with this name already exists.');
            isValid = false;
        }
    } else {
        if (productNameErrorMessage) hideError(productNameErrorMessage);
    }

    const productAliasErrorMessage = elements.productAliasError;
    if ((type === 'simple' || type === 'parent') && elements.hasAliasCheckbox.checked && !elements.productAliasSelect.value) {
        if (productAliasErrorMessage) showError(productAliasErrorMessage, 'Please select an alias or uncheck the box.');
        isValid = false;
    } else {
        if (productAliasErrorMessage) hideError(productAliasErrorMessage);
    }


    if (!isValid) {
        console.log("[ModalHandlers] Form validation failed.");
        return;
    }

    if (type === 'alias') {
        productData.mockups = getMockupPathsFromForm(elements.mockupPathsContainer);
    } else if (type === 'simple' || type === 'parent') {
        // Only set/update alias if hasAliasCheckbox is checked AND a value is selected
        if (elements.hasAliasCheckbox.checked && elements.productAliasSelect.value) {
            const selectedAliasKey = elements.productAliasSelect.value;
            productData.alias = selectedAliasKey;
            console.log(`[ModalHandlers] Product ${newKey} alias set to: "${selectedAliasKey}"`);

            const aliasObject = currentConfig[selectedAliasKey];
            if (aliasObject && aliasObject.type === 'alias') {
                // Mockups for a product with an alias should be saved directly ON THE ALIAS, not on the product itself.
                // The current logic of getMockupPathsFromForm() gets the mockups displayed in the modal.
                // The source of truth for these mockups when an alias is selected is the alias itself.
                // So, update the alias object's mockups.
                aliasObject.mockups = getMockupPathsFromForm(elements.mockupPathsContainer);
                currentConfig[selectedAliasKey] = cleanObject(aliasObject);
                console.log(`[ModalHandlers] Mockups saved to alias "${selectedAliasKey}":`, aliasObject.mockups);
            } else {
                 console.warn(`[ModalHandlers] Selected alias "${selectedAliasKey}" not found or not an alias type. Mockups not saved to alias.`);
            }
            // Ensure product's own mockups are removed if an alias is selected
            delete productData.mockups;
        } else {
            // If alias checkbox is not checked, or no alias is selected, product handles its own mockups
            delete productData.alias; // Ensure alias property is removed if not linked
            productData.mockups = getMockupPathsFromForm(elements.mockupPathsContainer); // Save product's own mockups
            console.log(`[ModalHandlers] Product ${newKey} has no alias. Mockups saved directly to product:`, productData.mockups);
        }
    }

    if (type === 'parent') {
        productData.variant = getVariantsFromDisplay();
    }

    if (!productData.product) {
        productData.product = type;
    }

    console.log("[ModalHandlers] Product data BEFORE cleanObject:", JSON.parse(JSON.stringify(productData)));
    productData = cleanObject(productData);
    console.log("[ModalHandlers] Final productData AFTER cleanObject:", JSON.parse(JSON.stringify(productData)));

    if (isEditMode && originalKey !== newKey) {
        delete currentConfig[originalKey];
        currentConfig[newKey] = productData;
    } else if (isEditMode) {
        currentConfig[newKey] = productData;
    } else {
        currentConfig[newKey] = productData;
    }
    console.log("[ModalHandlers] currentConfig after update:", JSON.parse(JSON.stringify(currentConfig)));


    document.dispatchEvent(new CustomEvent('product-data-updated', { detail: { config: currentConfig, updatedKey: newKey || originalKey } }));

    isFormDirty = false;
    closeProductModal();
    alert(`Product "${newKey}" ${isEditMode ? 'updated' : 'added'} successfully!`);
}