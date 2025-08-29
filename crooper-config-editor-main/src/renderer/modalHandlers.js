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

    // populate datalists
    populateKnownFieldsDatalist();

    // populate catalog product selects if any in modals
    // any select elements with class 'catalog-product-select' will be filled
    const catalogSelects = document.querySelectorAll('select.catalog-product-select');
    catalogSelects.forEach(s => populateProductListForCatalog(s));

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

    if (elements.addCustomFieldBtn) elements.addCustomFieldBtn.addEventListener('click', () => {
        addCustomFieldInput();
        isFormDirty = true; // Marquer le formulaire comme modifié lors de l'ajout d'un champ
    });

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

    // NOUVEAU: si la modale contient une liste de produits pour le catalogue, la remplir
    setTimeout(() => {
        populateProductListForCatalog('productAliasSelect');
    }, 50);

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
    populateKnownFieldsDatalist();

    // update catalog selects
    const catalogSelects = document.querySelectorAll('select.catalog-product-select');
    catalogSelects.forEach(s => populateProductListForCatalog(s));

    // Refill catalog product list controls if present
    populateProductListForCatalog('productAliasSelect');
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

// nouveau: populate product list for catalog product selection. Exclude 'catalog' key and aliases.
function populateProductListForCatalog(selectElementOrId) {
    let selectEl = selectElementOrId;
    if (typeof selectElementOrId === 'string') selectEl = document.getElementById(selectElementOrId);
    if (!selectEl) return;
    // clear
    selectEl.innerHTML = '';
    const emptyOpt = document.createElement('option'); emptyOpt.value = ''; emptyOpt.textContent = '-- Aucun --'; selectEl.appendChild(emptyOpt);
    for (const k in currentConfig) {
        if (!Object.hasOwnProperty.call(currentConfig, k)) continue;
        if (k === 'catalog') continue;
        const item = currentConfig[k];
        if (!item || item.type === 'alias') continue;
        const opt = document.createElement('option'); opt.value = k; opt.textContent = item.name || k;
        selectEl.appendChild(opt);
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

// Déclaration unique de la fonction toggleProductTypeFields
function toggleProductTypeFields(selectedType) {
    console.log("[ModalHandlers] toggleProductTypeFields called. Selected type:", selectedType);
    // --- Refonte UX : gestion claire des sections selon le type de produit ---
    // 1. Infos principales toujours visibles
    // 2. Alias : visible pour tous, mais options masquées si type alias
    // 3. Mockups : visible pour simple/parent, résumé pour alias
    // 4. Variants : visible uniquement pour parent
    // 5. Champs personnalisés : toujours visible

    // --- MODERN UI WRAPPERS & TITLES ---
    // Ajout de classes pour chaque section pour faciliter le style CSS
    if (elements.parentFields) {
        elements.parentFields.classList.add('modal-section', 'modal-section-variants', 'collapsible-section', 'modal-section-delimited');
        let title = elements.parentFields.querySelector('.section-title');
        let content = elements.parentFields.querySelector('.section-content');
        // Always move all children except .section-title into .section-content (robust)
        if (!content) {
            content = document.createElement('div');
            content.className = 'section-content';
            elements.parentFields.appendChild(content);
        }
        // Move all children except .section-title and .section-content into .section-content
        let moved = false;
        Array.from(elements.parentFields.children).forEach(child => {
            if (!child.classList.contains('section-title') && !child.classList.contains('section-content')) {
                content.appendChild(child);
                moved = true;
            }
        });
        // Always set display according to collapsed state
        if (content.classList.contains('collapsed')) {
            content.style.display = 'none';
        } else {
            content.style.display = '';
        }
        if (!title) {
            title = document.createElement('button');
            title.className = 'section-title collapsible-toggle';
            title.type = 'button';
            title.innerHTML = '<span class="collapsible-arrow">▼</span> Variantes';
            title.addEventListener('click', function() {
                content.classList.toggle('collapsed');
                if (content.classList.contains('collapsed')) {
                    content.style.display = 'none';
                } else {
                    content.style.display = '';
                }
                const arrow = title.querySelector('.collapsible-arrow');
                if (arrow) arrow.style.transform = content.classList.contains('collapsed') ? 'rotate(-90deg)' : 'rotate(0deg)';
            });
            elements.parentFields.prepend(title);
        }
        if (selectedType === 'parent') {
            elements.parentFields.style.display = '';
        } else {
            elements.parentFields.style.display = 'none';
        }
    }

    if (elements.aliasSelectionGroup) {
        elements.aliasSelectionGroup.classList.add('modal-section', 'modal-section-alias', 'collapsible-section', 'modal-section-delimited');
        let title = elements.aliasSelectionGroup.querySelector('.section-title');
        let content = elements.aliasSelectionGroup.querySelector('.section-content');
        if (!content) {
            content = document.createElement('div');
            content.className = 'section-content';
            elements.aliasSelectionGroup.appendChild(content);
        }
        Array.from(elements.aliasSelectionGroup.children).forEach(child => {
            if (!child.classList.contains('section-title') && !child.classList.contains('section-content')) {
                content.appendChild(child);
            }
        });
        if (content.classList.contains('collapsed')) {
            content.style.display = 'none';
        } else {
            content.style.display = '';
        }
        if (!title) {
            title = document.createElement('button');
            title.className = 'section-title collapsible-toggle';
            title.type = 'button';
            title.innerHTML = '<span class="collapsible-arrow">▼</span> Alias';
            title.addEventListener('click', function() {
                content.classList.toggle('collapsed');
                if (content.classList.contains('collapsed')) {
                    content.style.display = 'none';
                } else {
                    content.style.display = '';
                }
                const arrow = title.querySelector('.collapsible-arrow');
                if (arrow) arrow.style.transform = content.classList.contains('collapsed') ? 'rotate(-90deg)' : 'rotate(0deg)';
            });
            elements.aliasSelectionGroup.prepend(title);
        }
        if (selectedType === 'alias') {
            elements.aliasSelectionGroup.classList.add('hidden');
        } else {
            elements.aliasSelectionGroup.classList.remove('hidden');
        }
    }

    if (elements.mockupsSectionInModal) {
        elements.mockupsSectionInModal.classList.add('modal-section', 'modal-section-mockups', 'collapsible-section', 'modal-section-delimited');
        let title = elements.mockupsSectionInModal.querySelector('.section-title');
        let content = elements.mockupsSectionInModal.querySelector('.section-content');
        if (!content) {
            content = document.createElement('div');
            content.className = 'section-content';
            elements.mockupsSectionInModal.appendChild(content);
        }
        Array.from(elements.mockupsSectionInModal.children).forEach(child => {
            if (!child.classList.contains('section-title') && !child.classList.contains('section-content')) {
                content.appendChild(child);
            }
        });
        if (content.classList.contains('collapsed')) {
            content.style.display = 'none';
        } else {
            content.style.display = '';
        }
        if (!title) {
            title = document.createElement('button');
            title.className = 'section-title collapsible-toggle';
            title.type = 'button';
            title.innerHTML = '<span class="collapsible-arrow">▼</span> Mockups';
            title.addEventListener('click', function() {
                content.classList.toggle('collapsed');
                if (content.classList.contains('collapsed')) {
                    content.style.display = 'none';
                } else {
                    content.style.display = '';
                }
                const arrow = title.querySelector('.collapsible-arrow');
                if (arrow) arrow.style.transform = content.classList.contains('collapsed') ? 'rotate(-90deg)' : 'rotate(0deg)';
            });
            elements.mockupsSectionInModal.prepend(title);
        }
        elements.mockupsSectionInModal.classList.remove('hidden');
    }

    // Section Variants (génération, champs, affichage)
    const variantSection = document.getElementById('variantGenerationContainer');
    const variantDefaultFieldsSection = document.getElementById('variantDefaultFieldsSection');
    const generateVariantsBtn = document.getElementById('generateVariantsBtn');
    const currentVariantsDisplay = document.getElementById('currentVariantsDisplay');
    if (variantSection) {
        variantSection.classList.add('modal-section', 'modal-section-variantgen', 'collapsible-section', 'modal-section-delimited');
        let title = variantSection.querySelector('.section-title');
        let content = variantSection.querySelector('.section-content');
        if (!content) {
            content = document.createElement('div');
            content.className = 'section-content';
            variantSection.appendChild(content);
        }
        Array.from(variantSection.children).forEach(child => {
            if (!child.classList.contains('section-title') && !child.classList.contains('section-content')) {
                content.appendChild(child);
            }
        });
        if (content.classList.contains('collapsed')) {
            content.style.display = 'none';
        } else {
            content.style.display = '';
        }
        if (!title) {
            title = document.createElement('button');
            title.className = 'section-title collapsible-toggle';
            title.type = 'button';
            title.innerHTML = '<span class="collapsible-arrow">▼</span> Génération des variantes';
            title.addEventListener('click', function() {
                content.classList.toggle('collapsed');
                if (content.classList.contains('collapsed')) {
                    content.style.display = 'none';
                } else {
                    content.style.display = '';
                }
                const arrow = title.querySelector('.collapsible-arrow');
                if (arrow) arrow.style.transform = content.classList.contains('collapsed') ? 'rotate(-90deg)' : 'rotate(0deg)';
            });
            variantSection.prepend(title);
        }
        if (selectedType === 'parent') {
            variantSection.style.display = '';
        } else {
            variantSection.style.display = 'none';
        }
    }
    if (variantDefaultFieldsSection) {
        variantDefaultFieldsSection.classList.add('modal-section', 'modal-section-variantdefaults', 'collapsible-section', 'modal-section-delimited');
        let title = variantDefaultFieldsSection.querySelector('.section-title');
        let content = variantDefaultFieldsSection.querySelector('.section-content');
        if (!content) {
            content = document.createElement('div');
            content.className = 'section-content';
            variantDefaultFieldsSection.appendChild(content);
        }
        Array.from(variantDefaultFieldsSection.children).forEach(child => {
            if (!child.classList.contains('section-title') && !child.classList.contains('section-content')) {
                content.appendChild(child);
            }
        });
        if (content.classList.contains('collapsed')) {
            content.style.display = 'none';
        } else {
            content.style.display = '';
        }
        if (!title) {
            title = document.createElement('button');
            title.className = 'section-title collapsible-toggle';
            title.type = 'button';
            title.innerHTML = '<span class="collapsible-arrow">▼</span> Champs par défaut des variantes';
            title.addEventListener('click', function() {
                content.classList.toggle('collapsed');
                if (content.classList.contains('collapsed')) {
                    content.style.display = 'none';
                } else {
                    content.style.display = '';
                }
                const arrow = title.querySelector('.collapsible-arrow');
                if (arrow) arrow.style.transform = content.classList.contains('collapsed') ? 'rotate(-90deg)' : 'rotate(0deg)';
            });
            variantDefaultFieldsSection.prepend(title);
        }
        if (selectedType === 'parent') {
            variantDefaultFieldsSection.style.display = '';
            variantDefaultFieldsSection.classList.remove('hidden');
        } else {
            variantDefaultFieldsSection.style.display = 'none';
            variantDefaultFieldsSection.classList.add('hidden');
        }
    }
    if (generateVariantsBtn) {
        generateVariantsBtn.classList.add('modal-section-btn');
        if (selectedType === 'parent') {
            generateVariantsBtn.style.display = '';
        } else {
            generateVariantsBtn.style.display = 'none';
        }
    }
    if (currentVariantsDisplay) {
        currentVariantsDisplay.classList.add('modal-section', 'modal-section-variantlist', 'collapsible-section', 'modal-section-delimited');
        let title = currentVariantsDisplay.querySelector('.section-title');
        let content = currentVariantsDisplay.querySelector('.section-content');
        if (!content) {
            content = document.createElement('div');
            content.className = 'section-content';
            currentVariantsDisplay.appendChild(content);
        }
        Array.from(currentVariantsDisplay.children).forEach(child => {
            if (!child.classList.contains('section-title') && !child.classList.contains('section-content')) {
                content.appendChild(child);
            }
        });
        if (content.classList.contains('collapsed')) {
            content.style.display = 'none';
        } else {
            content.style.display = '';
        }
        if (!title) {
            title = document.createElement('button');
            title.className = 'section-title collapsible-toggle';
            title.type = 'button';
            title.innerHTML = '<span class="collapsible-arrow">▼</span> Liste des variantes';
            title.addEventListener('click', function() {
                content.classList.toggle('collapsed');
                if (content.classList.contains('collapsed')) {
                    content.style.display = 'none';
                } else {
                    content.style.display = '';
                }
                const arrow = title.querySelector('.collapsible-arrow');
                if (arrow) arrow.style.transform = content.classList.contains('collapsed') ? 'rotate(-90deg)' : 'rotate(0deg)';
            });
            currentVariantsDisplay.prepend(title);
        }
        if (selectedType === 'parent') {
            currentVariantsDisplay.style.display = '';
        } else {
            currentVariantsDisplay.style.display = 'none';
        }
    }

    // Alias : reset si alias
    if (!isEditMode || selectedType === 'alias') {
        if (elements.hasAliasCheckbox) elements.hasAliasCheckbox.checked = false;
        if (elements.aliasDropdownContainer) elements.aliasDropdownContainer.classList.add('hidden');
        if (elements.productAliasSelect) elements.productAliasSelect.value = '';
    }
    populateAliasDropdown();
}

// SUPPRESSION DES DOUBLES DÉCLARATIONS DE toggleProductTypeFields
// (Aucune déclaration multiple trouvée, mais si le code est injecté plusieurs fois, il faut s'assurer qu'il n'est défini qu'une seule fois)
// Pour éviter tout conflit, on protège la déclaration :
if (typeof window.toggleProductTypeFields !== 'function') {
    window.toggleProductTypeFields = function toggleProductTypeFields(selectedType) {
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
    };
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
        if (productBeingEdited && productBeingEdited.mockups && productBeingEdited.mockups.length > 0) {
            mockupsToDisplay = productBeingEdited.mockups;
            if (elements.mockupPathsContainer) elements.mockupPathsContainer.dataset.mockupSource = 'self';
            if (elements.mockupsSourceInfo) {
                if (hasAliasChecked && selectedAliasKey) {
                    elements.mockupsSourceInfo.textContent = `Mockups définis ici pour ce produit (lié à l'alias "${selectedAliasKey}").`;
                } else {
                    elements.mockupsSourceInfo.textContent = `Définis ici pour ce produit (ils ne seront pas liés à un profil d'aliasing).`;
                }
            }
        } else {
            if (elements.mockupsSourceInfo) {
                if (hasAliasChecked && selectedAliasKey) {
                    elements.mockupsSourceInfo.textContent = `Définir les mockups pour ce produit (lié à l'alias "${selectedAliasKey}").`;
                } else {
                    elements.mockupsSourceInfo.textContent = `Définir les mockups pour ce produit (ils seront stockés dans un profil d'aliasing si vous en sélectionnez un).`;
                }
            }
            if (elements.mockupPathsContainer) elements.mockupPathsContainer.dataset.mockupSource = 'none';
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

// --- MODERNISATION DE LA PRÉSENTATION DES VARIANTS DANS LA MODALE PRODUIT AVEC SUPPRESSION EN MODE TEMPORAIRE ---
function displayCurrentVariants(variantsData, tempState = null) {
    if (!elements.currentVariantsDisplay) return;
    elements.currentVariantsDisplay.innerHTML = '';
    // Utiliser l'état temporaire si fourni (pour édition non destructive)
    const workingVariants = tempState || JSON.parse(JSON.stringify(variantsData));
    if (!workingVariants || Object.keys(workingVariants).length === 0) {
        elements.currentVariantsDisplay.innerHTML = '<p>Aucun variant généré.</p>';
        elements.currentVariantsDisplay.currentVariantsData = {};
        return;
    }
    const table = document.createElement('table');
    table.className = 'variants-table';
    const thead = document.createElement('thead');
    thead.innerHTML = `<tr><th>Clé</th><th>Label</th><th>Type</th><th>Sub-variants</th><th>Action</th></tr>`;
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    Object.entries(workingVariants).forEach(([key, variant]) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${key}</td>
            <td>${variant[Object.keys(variant)[1]] || ''}</td>
            <td>${variant.type || ''}</td>
            <td class="subvariants-cell"></td>
            <td></td>
        `;
        // Sub-variants (si présents)
        const subCell = tr.querySelector('.subvariants-cell');
        if (variant.variant && typeof variant.variant === 'object') {
            Object.entries(variant.variant).forEach(([subKey, subObj]) => {
                const subDiv = document.createElement('div');
                subDiv.className = 'subvariant-row';
                subDiv.textContent = subKey;
                // Bouton suppression sub-variant
                const delSubBtn = document.createElement('button');
                delSubBtn.textContent = '🗑️';
                delSubBtn.className = 'delete-variant-btn';
                delSubBtn.title = 'Supprimer ce sub-variant';
                delSubBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    delete workingVariants[key].variant[subKey];
                    displayCurrentVariants(variantsData, workingVariants);
                });
                subDiv.appendChild(delSubBtn);
                subCell.appendChild(subDiv);
            });
        } else {
            subCell.textContent = '-';
        }
        // Bouton suppression du groupe variant
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '🗑️';
        deleteBtn.className = 'delete-variant-btn';
        deleteBtn.title = 'Supprimer ce variant';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            delete workingVariants[key];
            displayCurrentVariants(variantsData, workingVariants);
        });
        tr.lastElementChild.appendChild(deleteBtn);
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    elements.currentVariantsDisplay.appendChild(table);
    // Stocker l'état temporaire sur l'élément pour sauvegarde correcte
    elements.currentVariantsDisplay.currentVariantsData = workingVariants;
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
    
    // Forcer l'activation des champs et assurer la fonctionnalité d'édition
    setTimeout(() => {
        // Activer explicitement tous les champs de saisie
        const allInputs = elements.productModal.querySelectorAll('input, select, textarea');
        allInputs.forEach(input => {
            input.disabled = false;
            input.readOnly = false;
            // Déclencher un focus/blur pour activer les champs
            input.focus();
            input.blur();
        });
        
        // Focus sur le premier champ après activation
        const firstInput = elements.dynamicFormFields.querySelector('input, select, textarea');
        if (firstInput) {
            firstInput.focus();
        }
    }, 150); // Augmenter le délai pour laisser plus de temps
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

    // Forcer l'activation des champs et assurer la fonctionnalité d'édition
    setTimeout(() => {
        // Activer explicitement tous les champs de saisie
        const allInputs = elements.productModal.querySelectorAll('input, select, textarea');
        allInputs.forEach(input => {
            input.disabled = false;
            input.readOnly = false;
            // Déclencher un focus/blur pour activer les champs
            input.focus();
            input.blur();
        });
        
        // Focus sur le premier champ après activation
        const firstInput = elements.dynamicFormFields.querySelector('input, select, textarea');
        if (firstInput) {
            firstInput.focus();
        }
    }, 150); // Augmenter le délai pour laisser plus de temps
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

        const propagateLabel = document.createElement('label');
        propagateLabel.classList.add('propagate-field-label');
        const propagateCheckbox = document.createElement('input');
        propagateCheckbox.type = 'checkbox';
        propagateCheckbox.classList.add('propagate-checkbox');
        propagateCheckbox.dataset.key = fieldKey;
        propagateLabel.appendChild(propagateCheckbox);
        propagateLabel.appendChild(document.createTextNode(' Copy')); 

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
        formGroup.appendChild(propagateLabel);

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
    console.log("[ModalHandlers] Rendering custom fields for product:", productData);
    console.log("[DEBUG] Product variant structure:", productData.variant);
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

    // Champs structurels des variantes qui ne doivent pas apparaître comme champs personnalisés
    const variantStructuralKeys = new Set([
        'type', 'color', 'color_FR', 'taille', 'taille_FR', 'size', 'size_FR',
        'label', 'sku', 'parentSku', 'CompositeItem', 'tree',
        'name', 'prefix', 'category', 'genre', 'variant'
    ]);

    // Analyser la structure des variants pour identifier les champs structurels vs données
    function analyzeVariantStructure(productData) {
        const structuralFields = new Set(['type', 'variant']); // Champs système des variants
        const variantKeys = new Set(); // Clés des variants (ex: color, taille)
        
        if (productData.variant && typeof productData.variant === 'object') {
            // Analyser chaque variant pour identifier les champs de structure
            for (const variantKey in productData.variant) {
                const variant = productData.variant[variantKey];
                if (typeof variant === 'object' && variant !== null) {
                    for (const fieldKey in variant) {
                        // Si la valeur du champ correspond à la clé du variant, c'est un champ de structure
                        // Ex: variant["pink"].color = "pink" -> color est un champ de structure
                        if (variantKey === variant[fieldKey]) {
                            variantKeys.add(fieldKey);
                            structuralFields.add(fieldKey);
                        }
                        // Les champs _FR sont aussi structurels
                        if (fieldKey.endsWith('_FR')) {
                            structuralFields.add(fieldKey);
                        }
                    }
                    
                    // Analyser les sous-variants pour identifier d'autres champs de structure
                    if (variant.variant && typeof variant.variant === 'object') {
                        for (const subVariantKey in variant.variant) {
                            const subVariant = variant.variant[subVariantKey];
                            if (typeof subVariant === 'object' && subVariant !== null) {
                                for (const subFieldKey in subVariant) {
                                    // Si la valeur du sous-champ correspond à la clé du sous-variant
                                    if (subVariantKey === subVariant[subFieldKey]) {
                                        variantKeys.add(subFieldKey);
                                        structuralFields.add(subFieldKey);
                                    }
                                    if (subFieldKey.endsWith('_FR')) {
                                        structuralFields.add(subFieldKey);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        
        console.log("[DEBUG] Structural fields detected:", structuralFields);
        console.log("[DEBUG] Variant keys detected:", variantKeys);
        
        return { structuralFields, variantKeys };
    }

    function extractUnknownFields(obj, prefix = '') {
        const unknownFields = {};
        
        // Analyser la structure des variants pour identifier les champs structurels
        const variantAnalysis = analyzeVariantStructure(productData);
        
        for (const key in obj) {
            if (Object.hasOwnProperty.call(obj, key)) {
                const fullKey = prefix ? `${prefix}.${key}` : key;
                if (!fullKey) continue;

                const isObjectOrArray = typeof obj[key] === 'object' && obj[key] !== null;
                const isEmptyObject = isObjectOrArray && !Array.isArray(obj[key]) && Object.keys(obj[key]).length === 0;
                const isEmptyArray = isObjectOrArray && Array.isArray(obj[key]) && obj[key].length === 0;

                if (isObjectOrArray && !Array.isArray(obj[key]) && !isEmptyObject) {
                    // Cas spécial pour les variantes : toujours explorer la structure variant
                    const shouldExploreVariants = key === 'variant' || prefix.includes('variant');
                    
                    if (shouldExploreVariants || !systemOrStructuralKeys.has(key)) {
                        const nestedUnknowns = extractUnknownFields(obj[key], fullKey);
                        if (Object.keys(nestedUnknowns).length > 0) {
                            Object.assign(unknownFields, nestedUnknowns);
                        }
                    }
                } else {
                    let isKnownDirectly = allKnownFieldKeys.has(fullKey);
                    let isSystemOrStructural = systemOrStructuralKeys.has(fullKey) || systemOrStructuralKeys.has(key);
                    let isKnownNested = false;

                    // Logique spéciale pour les champs dans les variants
                    if (prefix.includes('variant')) {
                        isSystemOrStructural = false;
                        
                        // Utiliser l'analyse dynamique de la structure des variants
                        const isVariantStructural = variantAnalysis.structuralFields.has(key);
                        
                        if (isVariantStructural) {
                            // Ignorer les champs structurels des variantes (identifiés dynamiquement)
                            console.log("[DEBUG] Skipping structural field:", fullKey);
                            continue;
                        }
                        
                        // IMPORTANT: Ne pas ignorer les champs connus comme price dans les variants
                        // Ils doivent apparaître comme champs personnalisés pour être éditables
                        console.log("[DEBUG] Processing variant field:", fullKey, "value:", obj[key]);
                    }

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
                        console.log("[DEBUG] Added unknown field:", fullKey, "=", obj[key]);
                    }
                }
            }
        }
        return unknownFields;
    }

    const customFields = extractUnknownFields(productData);
    console.log("[DEBUG] Extracted custom fields:", customFields);

    for (const fieldKey in customFields) {
        console.log("[DEBUG] Adding custom field input for:", fieldKey, "=", customFields[fieldKey]);
        addCustomFieldInput(fieldKey, customFields[fieldKey]);
    }
}

function addCustomFieldInput(fieldKey = '', fieldValue = '') {
    if (!elements.customFieldsContainer) {
        console.warn("[ModalHandlers] Missing customFieldsContainer for addCustomFieldInput.");
        return;
    }
    
    // Analyser les variants existants pour fournir des suggestions
    const variantSuggestions = getVariantPathSuggestions();
    
    const customFieldRow = document.createElement('div');
    customFieldRow.classList.add('custom-field-row');

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.classList.add('custom-field-key');
    keyInput.placeholder = 'Key (e.g., custom.property or variant.pink.price)';
    keyInput.value = fieldKey;
    keyInput.setAttribute('list', 'variantPathSuggestions');
    keyInput.autocomplete = 'off';

    // Créer une datalist pour les suggestions de variants si elle n'existe pas
    let variantDatalist = document.getElementById('variantPathSuggestions');
    if (!variantDatalist) {
        variantDatalist = document.createElement('datalist');
        variantDatalist.id = 'variantPathSuggestions';
        document.body.appendChild(variantDatalist);
    }
    
    // Mettre à jour les suggestions de variants
    populateDatalist(variantDatalist, variantSuggestions);

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
    
    // Debounce pour éviter les pertes de focus lors des suggestions
    let suggestionTimeout;
    keyInput.addEventListener('input', () => { 
        isFormDirty = true;
        // Annuler le timeout précédent
        if (suggestionTimeout) {
            clearTimeout(suggestionTimeout);
        }
        // Attendre 300ms avant de mettre à jour les suggestions
        suggestionTimeout = setTimeout(() => {
            const updatedSuggestions = getVariantPathSuggestions();
            populateDatalist(variantDatalist, updatedSuggestions);
        }, 300);
    });
    valueInput.addEventListener('change', () => { isFormDirty = true; });
    valueInput.addEventListener('input', () => { isFormDirty = true; });


    const propagateLabel = document.createElement('label');
    propagateLabel.classList.add('propagate-field-label');
    const propagateCheckbox = document.createElement('input');
    propagateCheckbox.type = 'checkbox';
    propagateCheckbox.classList.add('propagate-checkbox');
    propagateLabel.appendChild(propagateCheckbox);
    propagateLabel.appendChild(document.createTextNode(' Copy'));

    customFieldRow.appendChild(keyInput);
    customFieldRow.appendChild(valueInput);
    customFieldRow.appendChild(promoteButton);
    customFieldRow.appendChild(propagateLabel);
    customFieldRow.appendChild(removeButton);

    elements.customFieldsContainer.appendChild(customFieldRow);
    
    // Marquer le formulaire comme modifié lors de l'ajout d'un champ personnalisé
    isFormDirty = true;
}

// Nouvelle fonction pour générer les suggestions de chemins vers les variants
function getVariantPathSuggestions() {
    const generalSuggestions = [];
    const variantSuggestions = [];
    
    // Ajouter des suggestions génériques EN PREMIER
    generalSuggestions.push(
        'custom.property',
        'amazon.title',
        'amazon.description',
        'amazon.keywords',
        'category',
        'price',
        'weight',
        'description',
        'sku',
        'label',
        'picture_1',
        'picture_2'
    );
    
    // Essayer d'obtenir les données du produit actuel depuis différentes sources
    let currentProductData = null;
    
    // 1. Essayer modalProductState
    if (modalProductState && modalProductState.productKey) {
        const productKey = modalProductState.productKey;
        if (currentConfig && currentConfig[productKey]) {
            currentProductData = currentConfig[productKey];
        }
    }
    // 2. Essayer de récupérer depuis le formulaire dynamique
    else if (elements.originalProductNameInput && elements.originalProductNameInput.value) {
        const productKey = elements.originalProductNameInput.value;
        if (currentConfig && currentConfig[productKey]) {
            currentProductData = currentConfig[productKey];
        }
    }
    
    // Analyser les variants existants et les ajouter À LA FIN
    if (currentProductData && currentProductData.variant) {
        console.log("[DEBUG] Found variants for suggestions:", Object.keys(currentProductData.variant));
        
        for (const variantKey in currentProductData.variant) {
            const variant = currentProductData.variant[variantKey];
            
            // Suggestions pour les variants de premier niveau
            variantSuggestions.push(`variant.${variantKey}.price`);
            variantSuggestions.push(`variant.${variantKey}.weight`);
            variantSuggestions.push(`variant.${variantKey}.description`);
            variantSuggestions.push(`variant.${variantKey}.sku`);
            
            // Si le variant a des sous-variants
            if (variant && variant.variant) {
                for (const subVariantKey in variant.variant) {
                    variantSuggestions.push(`variant.${variantKey}.variant.${subVariantKey}.price`);
                    variantSuggestions.push(`variant.${variantKey}.variant.${subVariantKey}.weight`);
                    variantSuggestions.push(`variant.${variantKey}.variant.${subVariantKey}.description`);
                    variantSuggestions.push(`variant.${variantKey}.variant.${subVariantKey}.sku`);
                }
            }
        }
    } else {
        console.log("[DEBUG] No variants found for suggestions");
    }
    
    // Combiner : suggestions générales D'ABORD, puis variants À LA FIN
    const allSuggestions = [...generalSuggestions, ...variantSuggestions];
    
    console.log("[DEBUG] Generated suggestions (general first, variants last):", allSuggestions);
    
    // Retourner les suggestions uniques mais en préservant l'ordre
    return allSuggestions.filter((item, index) => allSuggestions.indexOf(item) === index);
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

        // Always copy to the primary variant level
        Object.keys(fieldValues).forEach(k => {
            pv[k] = fieldValues[k];
        });

        // Additionally copy to sub-variants when requested
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
    const fieldKeys = getSelectedFieldsForPropagation();
    if (fieldKeys.length === 0) {
        alert('Select fields to copy using the checkboxes.');
        return;
    }

    let level = 'variant';
    if (elements.propagationLevelSelect) {
        level = elements.propagationLevelSelect.value || 'variant';
    }

    const variantsData = getVariantsFromDisplay();
    const parentValues = getParentFieldValues(fieldKeys);
    propagateFieldsToVariants(variantsData, parentValues, level);
    displayCurrentVariants(variantsData);

    // Reset copy checkboxes after propagation for clarity
    if (elements.dynamicFormFields) {
        elements.dynamicFormFields.querySelectorAll('.propagate-checkbox').forEach(cb => {
            cb.checked = false;
        });
    }
    if (elements.customFieldsContainer) {
        elements.customFieldsContainer.querySelectorAll('.propagate-checkbox').forEach(cb => {
            cb.checked = false;
        });
 }
}

function getSelectedFieldsForPropagation() {
    const selected = [];
    if (elements.dynamicFormFields) {
        elements.dynamicFormFields.querySelectorAll('.propagate-checkbox').forEach(cb => {
            if (cb.checked && cb.dataset.key) {
                selected.push(cb.dataset.key);
            }
        });
    }
    if (elements.customFieldsContainer) {
        elements.customFieldsContainer.querySelectorAll('.custom-field-row').forEach(row => {
            const cb = row.querySelector('.propagate-checkbox');
            if (cb && cb.checked) {
                const key = row.querySelector('.custom-field-key').value.trim();
                if (key) selected.push(key);
            }
        });
    }
    return selected;
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
    console.log("[DEBUG] Collecting custom fields...");
    elements.customFieldsContainer.querySelectorAll('.custom-field-row').forEach(row => {
        const keyInput = row.querySelector('.custom-field-key');
        const valueInput = row.querySelector('.custom-field-value');
        const key = keyInput ? keyInput.value.trim() : '';
        const value = valueInput ? valueInput.value : '';
        
        console.log("[DEBUG] Custom field found:", { key, value });

        if (key) {
            // Vérifier si c'est un champ de variante
            if (key.startsWith('variant.')) {
                // Champ de variante : appliquer à la structure variant existante
                const pathParts = key.split('.');
                // pathParts[0] = 'variant'
                // pathParts[1] = nom de la variante (ex: 'pink')
                // pathParts[2] = 'variant' (pour les sous-variantes) ou nom du champ
                // pathParts[3] = nom de la sous-variante (ex: 'XL') ou undefined
                // pathParts[4] = nom du champ (ex: 'price') ou undefined

                if (!productData.variant) {
                    productData.variant = {};
                }

                let currentLevel = productData.variant;
                // Ignorer le premier 'variant' et naviguer dans la structure
                for (let i = 1; i < pathParts.length; i++) {
                    const part = pathParts[i];
                    if (i === pathParts.length - 1) {
                        // Dernière partie : assigner la valeur
                        currentLevel[part] = value;
                        console.log("[DEBUG] Added variant field:", key, "=", value);
                    } else {
                        // Partie intermédiaire : créer l'objet si nécessaire
                        if (!currentLevel[part] || typeof currentLevel[part] !== 'object' || Array.isArray(currentLevel[part])) {
                            currentLevel[part] = {};
                        }
                        currentLevel = currentLevel[part];
                    }
                }
            } else {
                // Champ personnalisé normal : appliquer à la racine du produit
                const pathParts = key.split('.');
                let currentLevel = productData;
                for (let i = 0; i < pathParts.length; i++) {
                    const part = pathParts[i];
                    if (i === pathParts.length - 1) {
                        // Dernière partie : assigner la valeur
                        currentLevel[part] = value;
                        console.log("[DEBUG] Added custom field to productData:", key, "=", value);
                    } else {
                        // Partie intermédiaire : créer l'objet si nécessaire
                        if (!currentLevel[part] || typeof currentLevel[part] !== 'object' || Array.isArray(currentLevel[part])) {
                            currentLevel[part] = {};
                        }
                        currentLevel = currentLevel[part];
                    }
                }
            }
        } else {
            console.log("[DEBUG] Skipping custom field with empty key");
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

            // Keep mockups on the product even when an alias is selected
            productData.mockups = getMockupPathsFromForm(elements.mockupPathsContainer);
        } else {
            // If alias checkbox is not checked, or no alias is selected, product handles its own mockups
            delete productData.alias; // Ensure alias property is removed if not linked
            productData.mockups = getMockupPathsFromForm(elements.mockupPathsContainer); // Save product's own mockups
            console.log(`[ModalHandlers] Product ${newKey} has no alias. Mockups saved directly to product:`, productData.mockups);
        }
    }

    if (type === 'parent') {
        const variantsFromDisplay = getVariantsFromDisplay();
        
        // Fonction pour fusionner récursivement deux objets
        function deepMerge(target, source) {
            const result = { ...target };
            for (const key in source) {
                if (source.hasOwnProperty(key)) {
                    if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key]) &&
                        typeof result[key] === 'object' && result[key] !== null && !Array.isArray(result[key])) {
                        result[key] = deepMerge(result[key], source[key]);
                    } else {
                        result[key] = source[key];
                    }
                }
            }
            return result;
        }
        
        // Fusionner les variantes générées avec les champs personnalisés déjà appliqués
        if (productData.variant && Object.keys(productData.variant).length > 0) {
            console.log("[DEBUG] Merging variants. Custom fields variant:", productData.variant);
            console.log("[DEBUG] Merging variants. Display variant:", variantsFromDisplay);
            productData.variant = deepMerge(productData.variant, variantsFromDisplay);
            console.log("[DEBUG] Final merged variants:", productData.variant);
        } else {
            productData.variant = variantsFromDisplay;
        }
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