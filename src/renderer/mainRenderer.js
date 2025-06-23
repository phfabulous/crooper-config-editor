// src/renderer/mainRenderer.js

// Import all necessary modules and constants
import { TEMPLATES_FILE_NAME, PREDEFINED_VALUES, KNOWN_FIELDS_CONFIG, FIELDS_CONFIG_FILE_NAME } from './constants.js';
import { openAddProductModal, openEditProductModal, closeProductModal, updateModalData, initializeModalElements, handleCloseModalRequest, generateVariantsStructure } from './modalHandlers.js';
import { renderProducts, initializeProductElements, updateProductData } from './productManagement.js';
import { loadProductTemplates, openSaveTemplateModal, closeSaveTemplateModal, addProductFromTemplate, deleteProductTemplate, renderSavedProductTemplates, saveProductTemplatesToDisk, updateTemplateData, initializeTemplateElements } from './templateManagement.js';
import { initializeFieldManagementElements, loadKnownFieldsConfig, updateFieldManagementData, openManageFieldsModal, openManageFieldsModalForPromotion } from './fieldManagement.js';
import { cleanObject } from './utils.js';
import { initializeUnsavedDialogElements, openUnsavedDialog } from './unsavedDialog.js';

// Global state variables
let currentConfig = {};
let currentConfigFilePath = null;
let currentSelectedProductKey = null;
let savedProductTemplates = {};
let currentKnownFieldsConfig = {};

// Helper function: generates variant structure (extracted from modalHandlers for reuse)
function generateVariantsStructureInternal(variant1Type, variant1ValuesArray, variant2Type, variant2ValuesArray) {
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

// Helper function: Reconstructs a full product object from a flat CSV record.
function reconstructProductFromFlatCsvRecord(flatRecord, knownFieldsConfig) {
    const product = {};
    const mockupsTemp = {};
    let variant1Type = '';
    let variant1Values = '';
    let variant2Type = '';
    let variant2Values = '';
    const variantProps = {};

    for (const flatKey in flatRecord) {
        if (Object.hasOwnProperty.call(flatRecord, flatKey)) {
            let value = flatRecord[flatKey];

            if (value === '') {
                value = '';
            } else {
                if (value === 'true') value = true;
                else if (value === 'false') value = false;
                else if (!isNaN(value)) value = parseFloat(value);
            }
            
            if (flatKey.startsWith('mockups_path_')) {
                const index = flatKey.replace('mockups_path_', '');
                if (!mockupsTemp[index]) mockupsTemp[index] = {};
                mockupsTemp[index].path = value;
                continue;
            } else if (flatKey.startsWith('mockups_name_')) {
                const index = flatKey.replace('mockups_name_', '');
                if (!mockupsTemp[index]) mockupsTemp[index] = {};
                mockupsTemp[index].name = value;
                continue;
            }
            
            if (flatKey === 'variant1Type') { variant1Type = value; continue; }
            if (flatKey === 'variant1Values') { variant1Values = value; continue; }
            if (flatKey === 'variant2Type') { variant2Type = value; continue; }
            if (flatKey === 'variant2Values') { variant2Values = value; continue; }

            if (flatKey.startsWith('variant_') && !flatKey.startsWith('variant1') && !flatKey.startsWith('variant2')) {
                const propName = flatKey.substring('variant_'.length);
                variantProps[propName] = value;
                continue;
            }

            const pathParts = flatKey.split('.');
            let currentLevel = product;
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
    }

    const reconstructedMockups = [];
    for (const index in mockupsTemp) {
        if (mockupsTemp[index].path || mockupsTemp[index].name) {
            reconstructedMockups.push({
                path: mockupsTemp[index].path || '',
                name: mockupsTemp[index].name || ''
            });
        }
    }
    product.mockups = reconstructedMockups;

    if (product.type === 'parent' && variant1Type && variant1Values) {
        const parsedVariant1Values = variant1Values.split(',').map(v => v.trim()).filter(v => v);
        const parsedVariant2Values = variant2Values.split(',').map(v => v.trim()).filter(v => v);
        
        const generatedVariants = generateVariantsStructureInternal(variant1Type, parsedVariant1Values, variant2Type, parsedVariant2Values);
        
        for (const primaryKey in generatedVariants) {
            if (Object.hasOwnProperty.call(generatedVariants, primaryKey)) {
                const primaryVariant = generatedVariants[primaryKey];
                for (const propName in variantProps) {
                    if (Object.hasOwnProperty.call(variantProps, propName)) {
                        if (primaryVariant[propName] === undefined || primaryVariant[propName] === null || primaryVariant[propName] === '') {
                            primaryVariant[propName] = variantProps[propName];
                        }
                    }
                }
            }
        }
        product.variant = generatedVariants;
    } else if (product.type === 'parent') {
        product.variant = {};
    }

    return cleanObject(product);
}


// Déclaration de la variable elements pour qu'elle soit accessible globalement
let elements = {}; 

// Centralized render function for all main content
function renderAllContent() {
    console.log("[MainRenderer] renderAllContent called. currentConfig keys:", Object.keys(currentConfig).length, "savedTemplates keys:", Object.keys(savedProductTemplates).length); // LOG IMPORTANT
    renderProducts(currentConfig, elements.productContainer, false); // Rerender products list
    renderAliasQuickAccess(); // Rerender alias quick access
    renderSavedProductTemplates(savedProductTemplates); // Rerender templates
    updateAllModuleData(currentConfig, currentSelectedProductKey, savedProductTemplates, currentKnownFieldsConfig); // Update data in other modules
}


// --- Core Application Logic (Centralized in mainRenderer) ---

// File Management Functions
async function newConfiguration() {
    console.log("[MainRenderer] Initiating new configuration.");
    if (currentConfigFilePath && Object.keys(currentConfig).length > 0) {
        const confirmNew = confirm('You have unsaved changes. Do you want to start a new configuration without saving?');
        if (!confirmNew) return;
    }
    currentConfig = {};
    currentConfigFilePath = null;
    currentSelectedProductKey = null;
    renderAllContent(); // Refreshes the display
    if (elements.currentConfigFileName) elements.currentConfigFileName.textContent = "No Configuration Loaded";
    alert('New configuration started.');
    console.log("[MainRenderer] New config started. currentConfig:", currentConfig);
}

async function loadConfiguration() {
    console.log("[MainRenderer] Initiating load configuration.");
    const result = await window.electronAPI.loadConfig();
    if (result && result.data) {
        currentConfig = result.data;
        currentConfigFilePath = result.filePath;
        currentSelectedProductKey = null;
        renderAllContent(); // Refreshes the display
        if (elements.currentConfigFileName) elements.currentConfigFileName.textContent = `Config: ${currentConfigFilePath.split(/[\\/]/).pop()}`;
        console.log("[MainRenderer] Config loaded from file. currentConfig:", currentConfig);
    } else {
        console.log("[MainRenderer] Load config canceled or failed.");
    }
}

async function saveConfiguration(saveAs = false) {
    console.log("[MainRenderer] Initiating save configuration. saveAs:", saveAs);
    if (Object.keys(currentConfig).length === 0 && !currentConfigFilePath) {
        alert('No configuration to save. Please add products first or load an existing configuration.');
        return;
    }

    let filePath = currentConfigFilePath;
    if (saveAs || !filePath) {
        const result = await window.electronAPI.showSaveDialog();
        if (result.canceled) {
            console.log("[MainRenderer] Save dialog canceled by user.");
            return;
        }
        filePath = result.filePath;
        if (!filePath.endsWith('.json')) {
            filePath += '.json';
        }
    }
    console.log(`[MainRenderer] Saving to filePath: ${filePath}`);

    // Ensure aliases are at the top before saving
    const orderedConfig = {};
    const aliasKeys = Object.keys(currentConfig).filter(key => currentConfig[key].type === 'alias').sort((a, b) => a.localeCompare(b));
    const productKeys = Object.keys(currentConfig).filter(key => currentConfig[key].type !== 'alias').sort((a, b) => a.localeCompare(b));

    aliasKeys.forEach(key => orderedConfig[key] = currentConfig[key]);
    productKeys.forEach(key => orderedConfig[key] = currentConfig[key]);

    const success = await window.electronAPI.saveConfig(orderedConfig, filePath);
    if (success) {
        currentConfigFilePath = filePath;
        if (elements.currentConfigFileName) elements.currentConfigFileName.textContent = `Config: ${currentConfigFilePath.split(/[\\/]/).pop()}`;
        alert('Configuration saved successfully!');
        console.log("[MainRenderer] Config saved successfully to file.");
    } else {
        alert('Failed to save configuration.');
        console.error("[MainRenderer] Failed to save config to file.");
    }
}

// IPC handler to import CSV data
async function importCsvData() {
    console.log("[MainRenderer] Initiating CSV data import.");
    try {
        const result = await window.electronAPI.importCsvData();
        if (result && result.data) {
            console.log("[MainRenderer] CSV data received:", result.data);
            document.dispatchEvent(new CustomEvent('process-full-csv-import', { detail: { data: result.data } }));
        } else {
            console.log("[MainRenderer] CSV import canceled or failed.");
        }
    } catch (error) {
        console.error("[MainRenderer] Error during CSV import:", error);
        alert('An error occurred during CSV import: ' + error.message);
    }
}

// Fonction pour exporter la configuration actuelle en CSV
async function exportConfigToCsv() {
    console.log("[MainRenderer] Initiating CSV config export.");
    if (Object.keys(currentConfig).length === 0) {
        alert('No configuration to export. Please add products first or load an existing configuration.');
        return;
    }
    try {
        const success = await window.electronAPI.exportConfigToCsv(currentConfig, currentKnownFieldsConfig);
        if (success) {
            alert('Configuration exported to CSV successfully!');
            console.log("[MainRenderer] Config exported to CSV.");
        } else {
            alert('Failed to export configuration to CSV.');
            console.error("[MainRenderer] Failed to export config to CSV.");
        }
    } catch (error) {
        console.error("[MainRenderer] Error during CSV config export:", error);
        alert('An error occurred during CSV config export: ' + error.message);
    }
}


// Fonction pour générer le template CSV (sera modifiée pour être plus complète)
async function generateCsvTemplate() {
    console.log("[MainRenderer] Initiating CSV template generation.");
    try {
        const success = await window.electronAPI.generateCsvTemplate(currentKnownFieldsConfig);
        if (success) {
            alert('CSV template generated successfully!');
            console.log("[MainRenderer] CSV template generated.");
        } else {
            alert('Failed to generate CSV template.');
            console.error("[MainRenderer] Failed to generate CSV template.");
        }
    } catch (error) {
        console.error("[MainRenderer] Error during CSV template generation:", error);
        alert('An error occurred during CSV template generation: ' + error.message);
    }
}


// Function to update data references in all child modules
function updateAllModuleData(config, selectedKey, templates, fieldsConfig) {
    console.log("[MainRenderer] updateAllModuleData called. Config size:", Object.keys(config).length, "Templates size:", Object.keys(templates).length);
    // Ces fonctions sont exportées par leurs modules respectifs et manipulent les éléments DOM qu'elles ont reçus à l'initialisation
    updateProductData(config, selectedKey, fieldsConfig); // Passe les éléments et données à productManagement
    updateModalData(config, selectedKey, fieldsConfig); // Passe les éléments et données à modalHandlers
    updateTemplateData(config, templates); // Passe les éléments et données à templateManagement
    updateFieldManagementData(fieldsConfig); // Passe les éléments et données à fieldManagement
    renderAliasQuickAccess(); // Rerender alias quick access
}

// Function to render the Alias Quick Access bar
function renderAliasQuickAccess() {
    console.log("[MainRenderer] Rendering Alias Quick Access bar. CurrentConfig:", Object.keys(currentConfig).length);
    if (!elements.aliasBlocksContainer || !elements.noAliasesMessage) {
        console.error("[MainRenderer] ERREUR DOM: Les éléments du conteneur d'alias sont introuvables lors du rendu.");
        return;
    }

    elements.aliasBlocksContainer.innerHTML = '';
    const aliases = Object.keys(currentConfig).filter(key => currentConfig[key].type === 'alias');

    if (aliases.length === 0) {
        elements.noAliasesMessage.style.display = 'block';
    } else {
        elements.noAliasesMessage.style.display = 'none';
        aliases.sort().forEach(aliasKey => {
            const aliasBlock = document.createElement('div');
            aliasBlock.classList.add('alias-block');
            aliasBlock.textContent = aliasKey;
            aliasBlock.dataset.aliasKey = aliasKey;

            const editIcon = document.createElement('span');
            editIcon.classList.add('edit-alias-icon');
            editIcon.textContent = ' ⚙️';
            aliasBlock.appendChild(editIcon);

            aliasBlock.addEventListener('click', () => openAliasEditModal(aliasKey));
            elements.aliasBlocksContainer.appendChild(aliasBlock);
        });
    }
}

// Open Alias Editing Modal
function openAliasEditModal(aliasKey) {
    console.log(`[MainRenderer] Opening Alias Edit Modal for: ${aliasKey}`);
    const alias = currentConfig[aliasKey];
    if (!alias || alias.type !== 'alias') {
        console.error(`[MainRenderer] Alias "${aliasKey}" not found or not of type alias.`);
        alert('Profil d\'aliasing non trouvé ou non valide.');
        return;
    }

    // AJOUT DE VÉRIFICATIONS NULL POUR TOUS LES ÉLÉMENTS DE LA MODALE ALIAS
    const requiredAliasElements = [
        elements.aliasEditName, elements.aliasEditOriginalName, elements.aliasEditAspect,
        elements.aliasEditDensite, elements.aliasEditDimentions, elements.aliasEditSizeImpression, 
        elements.aliasEditDirectMockupsContainer, elements.aliasEditInheritedMockupsContainer,
        elements.inheritedMockupsList, elements.aliasEditModal, elements.addAliasEditMockupPathBtn,
        elements.aliasEditForm, elements.closeAliasEditModalBtn 
    ];
    // Pour déboguer l'erreur "N/A", vérifions l'ID réel ici si l'élément est null
    const missingElements = requiredAliasElements.filter(el => el === null);

    if (missingElements.length > 0) {
        const missingElementKeys = missingElements.map(el => {
            for (const key in elements) {
                if (elements[key] === el) return key;
            }
            return 'UNKNOWN_ELEMENT'; 
        });
        console.error(`[MainRenderer] ERREUR DOM: ${missingElements.length} élément(s) de la modale d'édition d'alias sont introuvables. Clés manquantes:`, missingElementKeys);
        alert("Erreur interne : La modale d'édition d'alias ne peut pas s'ouvrir correctement. Des éléments HTML sont manquants. Vérifiez les IDs dans index.html et mainRenderer.js.");
        return;
    }


    elements.aliasEditName.textContent = aliasKey;
    elements.aliasEditOriginalName.value = aliasKey;

    elements.aliasEditAspect.value = alias.aspect || '';
    elements.aliasEditDensite.value = alias.densite || '';
    elements.aliasEditDimentions.value = alias.dimentions || '';
    elements.aliasEditSizeImpression.value = alias.sizeImpression || '';

    // Logic to display direct or inherited mockups
    elements.aliasEditDirectMockupsContainer.classList.add('hidden');
    elements.aliasEditInheritedMockupsContainer.classList.add('hidden');
    elements.inheritedMockupsList.innerHTML = '';

    // Find all products that reference this alias and have mockups
    const productsUsingThisAliasWithMockups = Object.keys(currentConfig).filter(key =>
        currentConfig[key].type !== 'alias' && currentConfig[key].hasOwnProperty('alias') && currentConfig[key].alias === aliasKey && currentConfig[key].mockups && currentConfig[key].mockups.length > 0
    );
    console.log(`[MainRenderer] Products using alias "${aliasKey}" with mockups:`, productsUsingThisAliasWithMockups);

    if (productsUsingThisAliasWithMockups.length > 0) {
        elements.aliasEditInheritedMockupsContainer.classList.remove('hidden');
        elements.aliasEditDirectMockupsContainer.classList.add('hidden');

        const combinedMockups = {};
        productsUsingThisAliasWithMockups.forEach(prodKey => {
            const prod = currentConfig[prodKey];
            if (prod.mockups && Array.isArray(prod.mockups)) {
                prod.mockups.forEach(mockup => {
                    const id = `${mockup.path}|${mockup.name}`;
                    if (!combinedMockups[id]) {
                        combinedMockups[id] = { path: mockup.path, name: mockup.name, sources: [] };
                    }
                    if (!combinedMockups[id].sources.includes(prodKey)) {
                         combinedMockups[id].sources.push(prodKey);
                    }
                });
            }
        });

        Object.values(combinedMockups).forEach(mockupEntry => {
            const div = document.createElement('div');
            div.classList.add('mockup-path-entry');
            div.innerHTML = `
                <input type="text" value="${mockupEntry.path}" readonly>
                <input type="text" value="${mockupEntry.name}" readonly>
                <span class="mockup-source-tag">(depuis: ${mockupEntry.sources.join(', ')})</span>
            `;
            elements.inheritedMockupsList.appendChild(div);
        });
        elements.inheritedMockupsList.innerHTML += `<p class="mockups-source-label">Pour modifier ces mockups, éditez le(s) produit(s) associé(s).</p>`;

    } else {
        elements.aliasEditDirectMockupsContainer.classList.remove('hidden');
        populateMockupPathsForAliasEdit(elements.aliasEditMockupPathsContainer, elements.addAliasEditMockupPathBtn, alias.mockups || []);
        elements.addAliasEditMockupPathBtn.style.display = 'inline-block';
    }

    elements.aliasEditModal.style.display = 'block';
    console.log(`[MainRenderer] Alias Edit Modal for ${aliasKey} opened. Initial mockups:`, alias.mockups);
}

// Close Alias Editing Modal
function closeAliasEditModal() {
    console.log("[MainRenderer] Closing Alias Edit Modal.");
    if (!elements.aliasEditModal || !elements.aliasEditForm || !elements.aliasEditMockupPathsContainer || !elements.addAliasEditMockupPathBtn || !elements.inheritedMockupsList) {
        console.error("[MainRenderer] ERREUR DOM: Impossible de fermer la modale d'alias, des éléments sont manquants.");
        return;
    }
    elements.aliasEditModal.style.display = 'none';
    elements.aliasEditForm.reset();
    populateMockupPathsForAliasEdit(elements.aliasEditMockupPathsContainer, elements.addAliasEditMockupPathBtn, []);
    elements.inheritedMockupsList.innerHTML = '';
    setAliasEditFormDirty(false); // Reset dirty state on close
    renderAllContent();
}

// Helper for populating mockups in Alias Edit Modal
function populateMockupPathsForAliasEdit(containerElement, addButtonElement, mockups) {
    console.log("[MainRenderer] Populating mockups for alias edit modal. Mockups:", mockups);
    const existingEntries = containerElement.querySelectorAll('.mockup-path-entry');
    existingEntries.forEach(entry => entry.remove());

    if (mockups && Array.isArray(mockups)) {
        mockups.forEach(mockup => {
            addMockupPathInputForAliasEdit(containerElement, addButtonElement, mockup.path, mockup.name);
        });
    }
}

// Helper for adding mockup input in Alias Edit Modal
function addMockupPathInputForAliasEdit(containerElement, addButtonElement, path = '', name = '') {
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

// Helper for getting mockups from Alias Edit Modal form
function getMockupPathsFromAliasEditForm(containerElement) {
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


// Functions that need to interact with global state directly (or dispatch events)
function duplicateProduct(productKey) {
    console.log(`[MainRenderer] Duplicating product: ${productKey}`);
    const originalProduct = currentConfig[productKey];
    if (!originalProduct) {
        console.error(`[MainRenderer] Product "${productKey}" not found for duplication.`);
        alert('Product not found for duplication.');
        return;
    }

    let newProductKey = `${productKey}_copy`;
    let counter = 1;
    while (currentConfig.hasOwnProperty(newProductKey)) {
        newProductKey = `${productKey}_copy${counter++}`;
    }

    const duplicatedProduct = JSON.parse(JSON.stringify(originalProduct));
    duplicatedProduct.name = newProductKey;

    currentConfig[newProductKey] = duplicatedProduct;
    console.log(`[MainRenderer] Current config after duplication:`, JSON.parse(JSON.stringify(currentConfig)));
    document.dispatchEvent(new CustomEvent('product-data-updated', { detail: { config: currentConfig, updatedKey: newProductKey } }));
    alert(`Product "${productKey}" duplicated as "${newProductKey}". Please edit the duplicated product.`);
    console.log(`[MainRenderer] Product duplicated. New key: ${newProductKey}`);
}

function deleteProduct(productKey) {
    console.log(`[MainRenderer] Deleting product: ${productKey}`);
    if (confirm(`Are you sure you want to delete product "${productKey}"?`)) {
        delete currentConfig[productKey];
        if (currentSelectedProductKey === productKey) {
            currentSelectedProductKey = null;
        }
        console.log(`[MainRenderer] Current config after deletion:`, JSON.parse(JSON.stringify(currentConfig)));
        document.dispatchEvent(new CustomEvent('product-data-updated', { detail: { config: currentConfig, updatedKey: null } }));
        alert(`Product "${productKey}" deleted.`);
        console.log(`[MainRenderer] Product ${productKey} deleted.`);
    }
}

// --- Event Listeners Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    // Initialiser TOUTES les références DOM après DOMContentLoaded
    // Cela garantit que tous les éléments sont chargés.
    elements = {
        mainWrapper: document.getElementById('main-wrapper'),
        sidebar: document.getElementById('sidebar'),
        toggleSidebarBtn: document.getElementById('toggleSidebarBtn'),
        contentArea: document.getElementById('content-area'),

        appHeader: document.getElementById('app-header'),
        mainMenuBtn: document.getElementById('mainMenuBtn'),
        currentConfigFileName: document.getElementById('currentConfigFileName'),
        mainMenuDropdown: document.getElementById('mainMenuDropdown'),

        newConfigBtn: document.getElementById('newConfigBtn'),
        loadConfigBtn: document.getElementById('loadConfigBtn'),
        saveConfigBtn: document.getElementById('saveConfigBtn'),
        saveAsConfigBtn: document.getElementById('saveAsConfigBtn'),
        importCsvBtn: document.getElementById('importCsvBtn'),
        exportCsvBtn: document.getElementById('exportCsvBtn'),
        generateCsvTemplateBtn: document.getElementById('generateCsvTemplateBtn'),

        addProductBtn: document.getElementById('addProductBtn'),
        productContainer: document.getElementById('productContainer'),
        noProductMessage: document.getElementById('noProductMessage'),
        manageFieldsBtn: document.getElementById('manageFieldsBtn'),

        aliasQuickAccess: document.getElementById('aliasQuickAccess'),
        aliasBlocksContainer: document.getElementById('aliasBlocksContainer'),
        noAliasesMessage: document.getElementById('noAliasesMessage'),

        productModal: document.getElementById('productModal'),
        closeButton: document.getElementById('closeButton'), 
        productForm: document.getElementById('productForm'),
        modalTitle: document.getElementById('modalTitle'),
        originalProductNameInput: document.getElementById('originalProductName'),
        dynamicFormFields: document.getElementById('dynamicFormFields'),

        aliasSelectionGroup: document.getElementById('aliasSelectionGroup'),
        hasAliasCheckbox: document.getElementById('hasAliasCheckbox'),
        aliasDropdownContainer: document.getElementById('aliasDropdownContainer'),
        productAliasSelect: document.getElementById('productAliasSelect'),
        productAliasError: document.getElementById('productAliasError'),

        mockupsSectionInModal: document.getElementById('mockupsSectionInModal'),
        mockupsSourceInfo: document.getElementById('mockupsSourceInfo'),
        mockupPathsContainer: document.getElementById('mockupPathsContainer'),
        addMockupPathBtn: document.getElementById('addMockupPathBtn'),

        // Removed as per analysis (these are not direct IDs in index.html, they are handled by dynamicFormFields)
        // aliasFields: document.getElementById('aliasFields'), 
        // simpleParentFields: document.getElementById('simpleParentFields'),

        customFieldsSection: document.getElementById('customFieldsSection'),
        customFieldsContainer: document.getElementById('customFieldsContainer'),
        addCustomFieldBtn: document.getElementById('addCustomFieldBtn'),

        parentFields: document.getElementById('parentFields'),
        variant1TypeInput: document.getElementById('variant1Type'),
        variant1ValuesInput: document.getElementById('variant1Values'),
        variant2TypeInput: document.getElementById('variant2Type'),
        variant2ValuesInput: document.getElementById('variant2Values'),
        generateVariantsBtn: document.getElementById('generateVariantsBtn'),
        currentVariantsDisplay: document.getElementById('currentVariantsDisplay'),

        // Error message spans for dynamic fields are now handled by querySelector within dynamicFormFields
        // productNameError: document.getElementById('productNameError'),
        // productTypeError: document.getElementById('productTypeError'),
        // productPrefixError: document.getElementById('productPrefixError'),

        saveProductAsTemplateBtn: document.getElementById('saveProductAsTemplateBtn'),
        savedTemplatesContainer: document.getElementById('savedTemplatesContainer'),
        noSavedTemplatesMessage: document.getElementById('noSavedTemplatesMessage'),

        saveTemplateModal: document.getElementById('saveTemplateModal'),
        closeSaveTemplateModalBtn: document.getElementById('closeSaveTemplateModalBtn'),
        saveTemplateForm: document.getElementById('saveTemplateForm'),
        templateFriendlyNameInput: document.getElementById('templateFriendlyName'),
        templateTechnicalNameInput: document.getElementById('templateTechnicalName'),

        // Alias Editing Modal - Ensure IDs match index.html exactly
        aliasEditModal: document.getElementById('aliasEditModal'),
        closeAliasEditModalBtn: document.getElementById('closeAliasEditModalBtn'),
        aliasEditName: document.getElementById('aliasEditName'),
        aliasEditForm: document.getElementById('aliasEditForm'),
        aliasEditOriginalName: document.getElementById('aliasEditOriginalName'),
        aliasEditAspect: document.getElementById('aliasEditAspect'),
        aliasEditDensite: document.getElementById('aliasEditDensite'), // Corrected ID
        aliasEditDimentions: document.getElementById('aliasEditDimentions'), // Corrected ID
        aliasEditSizeImpression: document.getElementById('aliasEditSizeImpression'),
        aliasEditMockupPathsContainer: document.getElementById('aliasEditMockupPathsContainer'),
        addAliasEditMockupPathBtn: document.getElementById('addAliasEditMockupPathBtn'),
        saveAliasAsTemplateBtn: document.getElementById('saveAliasAsTemplateBtn'),
        aliasEditDirectMockupsContainer: document.getElementById('aliasEditDirectMockupsContainer'),
        aliasEditInheritedMockupsContainer: document.getElementById('aliasEditInheritedMockupsContainer'), // Corrected ID
        inheritedMockupsList: document.getElementById('inheritedMockupsList'),

        manageFieldsModal: document.getElementById('manageFieldsModal'),
        closeManageFieldsModalBtn: document.getElementById('closeManageFieldsModalBtn'),
        productTypeForFields: document.getElementById('productTypeForFields'),
        addNewFieldBtn: document.getElementById('addNewFieldBtn'),
        fieldsListContainer: document.getElementById('fieldsListContainer'),
        saveFieldsConfigBtn: document.getElementById('saveFieldsConfigBtn'),

        // Unsaved changes confirmation modal
        unsavedChangesModal: document.getElementById('unsavedChangesModal'),
        unsavedSaveBtn: document.getElementById('unsavedSaveBtn'),
        unsavedDiscardBtn: document.getElementById('unsavedDiscardBtn'),
        unsavedCancelBtn: document.getElementById('unsavedCancelBtn')
    };

    // VERIFICATION POST-INITIALISATION: Remove the fatal error check for now,
    // as it stops execution and we want to see other issues.
    // However, keeping the console.error for visibility.
    for (const key in elements) {
        if (elements[key] === null) {
            console.error(`[MainRenderer] CRITICAL: DOM element for key '${key}' is NULL after DOMContentLoaded. Check ID in index.html.`);
        }
    }


    currentKnownFieldsConfig = await loadKnownFieldsConfig();

    // Initialise modules with their respective DOM elements
    initializeProductElements(elements, currentConfig, currentSelectedProductKey, currentKnownFieldsConfig);
    initializeModalElements(elements, currentConfig, currentSelectedProductKey, currentKnownFieldsConfig);
    initializeTemplateElements(elements, currentConfig, savedProductTemplates);
    initializeFieldManagementElements(elements, currentKnownFieldsConfig);
    initializeUnsavedDialogElements(elements);

    // --- Gestionnaire pour le clic sur le bouton menu principal ---
    if (elements.mainMenuBtn && elements.mainMenuDropdown && elements.appHeader) {
        elements.mainMenuBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            const isVisible = elements.mainMenuDropdown.classList.toggle('visible');
            console.log(`[MainRenderer] mainMenuBtn cliqué. Menu visible: ${isVisible}`);

            if (isVisible) {
                const headerRect = elements.appHeader.getBoundingClientRect();
                elements.mainMenuDropdown.style.top = `${headerRect.bottom + 5}px`;
                elements.mainMenuDropdown.style.left = `${headerRect.left + 20}px`;
                console.log(`[MainRenderer] Menu Dropdown position: top=${elements.mainMenuDropdown.style.top}, left=${elements.mainMenuDropdown.style.left}`);
            }
        });
        console.log("[MainRenderer] mainMenuBtn click listener attached.");
    } else {
        console.error("[MainRenderer] ERREUR DOM: Un ou plusieurs éléments du menu (mainMenuBtn, mainMenuDropdown, appHeader) n'ont pas été trouvés pour attacher l'écouteur du menu !");
    }

    // Cacher le menu déroulant si on clique en dehors
    window.addEventListener('click', (event) => {
        if (elements.mainMenuDropdown && elements.mainMenuDropdown.classList.contains('visible')) {
            if (!elements.mainMenuBtn.contains(event.target) && !elements.mainMenuDropdown.contains(event.target)) {
                elements.mainMenuDropdown.classList.remove('visible');
                console.log("[MainRenderer] Cliqué en dehors du menu. Menu fermé.");
            }
        }
    });

    // --- Délégation d'événements pour les éléments du dropdown menu ---
    if (elements.mainMenuDropdown) {
        elements.mainMenuDropdown.addEventListener('click', (event) => {
            const target = event.target;
            elements.mainMenuDropdown.classList.remove('visible');
            console.log(`[MainRenderer] Clic à l'intérieur du menu déroulant. Cible ID: ${target.id}`);

            if (target.id === 'newConfigBtn') {
                newConfiguration();
            } else if (target.id === 'loadConfigBtn') {
                loadConfiguration();
            } else if (target.id === 'saveConfigBtn') {
                saveConfiguration(false);
            } else if (target.id === 'saveAsConfigBtn') {
                saveConfiguration(true);
            } else if (target.id === 'importCsvBtn') {
                importCsvData();
            } else if (target.id === 'exportCsvBtn') {
                exportConfigToCsv();
            } else if (target.id === 'generateCsvTemplateBtn') {
                generateCsvTemplate();
            } else if (target.id === 'manageFieldsBtn') {
                openManageFieldsModal();
            }
        });
        console.log("[MainRenderer] mainMenuDropdown click listener for delegation attached.");
    }


    // Product Management (Ajouté ici car déplacé dans le header)
    if (elements.addProductBtn) elements.addProductBtn.addEventListener('click', openAddProductModal);


    // Sidebar toggle
    if (elements.toggleSidebarBtn) elements.toggleSidebarBtn.addEventListener('click', () => {
        elements.sidebar.classList.toggle('collapsed');
        console.log("[MainRenderer] Sidebar toggled.");
    });

    // Gérer le clic en dehors de la modale produit pour déclencher la confirmation
    window.addEventListener('click', async (event) => {
        if (elements.productModal && event.target === elements.productModal) {
            await handleCloseModalRequest();
        }
        if (elements.saveTemplateModal && event.target === elements.saveTemplateModal) {
            closeSaveTemplateModal();
        }
        if (elements.aliasEditModal && event.target === elements.aliasEditModal) {
            if (elements.aliasEditForm && isAliasEditFormDirty()) {
                const choice = await openUnsavedDialog();
                if (choice === 'save') {
                    await handleAliasEditFormSubmit(new Event('submit'));
                } else if (choice === 'discard') {
                    closeAliasEditModal();
                }
            } else {
                closeAliasEditModal();
            }
        }
        if (elements.manageFieldsModal && event.target === elements.manageFieldsModal) {
            elements.manageFieldsModal.style.display = 'none';
        }
    });

    // Alias Edit Modal close button listener
    if (elements.closeAliasEditModalBtn) elements.closeAliasEditModalBtn.addEventListener('click', closeAliasEditModal);
    if (elements.addAliasEditMockupPathBtn && elements.aliasEditMockupPathsContainer) { 
        elements.addAliasEditMockupPathBtn.addEventListener('click', () => addMockupPathInputForAliasEdit(elements.aliasEditMockupPathsContainer, elements.addAliasEditMockupPathBtn));
    }

    // Add submit listener for aliasEditForm
    if (elements.aliasEditForm) {
        elements.aliasEditForm.addEventListener('submit', handleAliasEditFormSubmit);
        // Also need a way to track if this form is dirty
        elements.aliasEditForm.addEventListener('input', () => { setAliasEditFormDirty(true); });
        elements.aliasEditForm.addEventListener('change', () => { setAliasEditFormDirty(true); });
    }

    if (elements.saveAliasAsTemplateBtn) {
        elements.saveAliasAsTemplateBtn.addEventListener('click', () => {
            const aliasKey = elements.aliasEditName ? elements.aliasEditName.textContent.trim() : '';
            if (!aliasKey) {
                alert('Cannot save as template: alias name is empty.');
                return;
            }
            document.dispatchEvent(new CustomEvent('open-save-template-naming-modal', { detail: { productKeyToSave: aliasKey } }));
        });
    }


    // --- Initial Application Load ---
    console.log("[MainRenderer] DOMContentLoaded: Initializing app.");
    savedProductTemplates = await loadProductTemplates(); 
    renderAllContent(); 
    console.log("[MainRenderer] App initialized. Final currentConfig:", JSON.parse(JSON.stringify(currentConfig)), " Final savedProductTemplates:", JSON.parse(JSON.stringify(savedProductTemplates)), " Final currentKnownFieldsConfig:", JSON.parse(JSON.stringify(currentKnownFieldsConfig)));


    // --- Gestionnaires d'événements pour les CustomEvent des templates ---
    document.addEventListener('add-product-from-template', (event) => {
        console.log(`[MainRenderer] Caught 'add-product-from-template' event. Template Key: ${event.detail.templateKey}. currentConfig before add:`, Object.keys(currentConfig).length);
        addProductFromTemplate(event.detail.templateKey);
        console.log(`[MainRenderer] After addProductFromTemplate. currentConfig size:`, Object.keys(currentConfig).length);
    });

    document.addEventListener('delete-product-template', (event) => {
        console.log(`[MainRenderer] Caught 'delete-product-template' event. Template Key: ${event.detail.templateKey}. savedProductTemplates before delete:`, Object.keys(savedProductTemplates).length);
        deleteProductTemplate(event.detail.templateKey);
        console.log(`[MainRenderer] After deleteProductTemplate. savedProductTemplates size:`, Object.keys(savedProductTemplates).length);
    });
    
    // --- Gestionnaires d'événements pour les CustomEvent des produits (Edit, Duplicate, Delete) ---
    document.addEventListener('open-edit-product-modal', (event) => {
        console.log(`[MainRenderer] Caught 'open-edit-product-modal' event for product: ${event.detail.productKey}`);
        openEditProductModal(event.detail.productKey);
    });
    document.addEventListener('duplicate-product', (event) => {
        console.log(`[MainRenderer] Caught 'duplicate-product' event for product: ${event.detail.productKey}`);
        duplicateProduct(event.detail.productKey);
    });
    document.addEventListener('delete-product', (event) => {
        console.log(`[MainRenderer] Caught 'delete-product' event for product: ${event.detail.productKey}`);
        deleteProduct(event.detail.productKey);
    });

        // Handle request to open the 'Save As Template' modal from product editor
        document.addEventListener('open-save-template-naming-modal', (event) => {
            console.log(`[MainRenderer] Caught 'open-save-template-naming-modal' for product: ${event.detail.productKeyToSave}`);
            openSaveTemplateModal(event.detail.productKeyToSave);
        });
    
    // Custom event to handle CSV import for product data (not just variants)
    document.addEventListener('process-full-csv-import', (event) => {
        handleFullCsvImport(event.detail.data);
    });

    document.addEventListener('known-fields-config-updated', (event) => {
        currentKnownFieldsConfig = event.detail.config;
        updateAllModuleData(currentConfig, currentSelectedProductKey, savedProductTemplates, currentKnownFieldsConfig);
        // If the modal was opened for promotion, reopen the product modal
        if (event.detail.modalState && event.detail.modalState.isOpen && event.detail.modalState.productKey) {
            openEditProductModal(event.detail.modalState.productKey);
        } else if (event.detail.modalState && event.detail.modalState.isOpen && event.detail.modalState.mode === 'add') {
             openAddProductModal();
        }
    });

        // When product data changes (add/edit/delete/CSV import etc.), re-render UI
        document.addEventListener('product-data-updated', (event) => {
            currentConfig = event.detail.config;
            currentSelectedProductKey = event.detail.updatedKey;
            renderAllContent();
        });
    
        // When templates list changes, refresh sidebar templates
        document.addEventListener('templates-updated', (event) => {
            savedProductTemplates = event.detail.templates;
            renderAllContent();
        });
    
    // Handle initial load of templates (if any)
    if (Object.keys(savedProductTemplates).length === 0) {
        console.log("[MainRenderer] No templates loaded initially. Attempting to load from disk.");
        savedProductTemplates = await loadProductTemplates();
        renderSavedProductTemplates(savedProductTemplates);
    }
});

// Alias edit form dirty state and submit handler (new functions)
let isAliasEditFormDirtyState = false;

function isAliasEditFormDirty() {
    return isAliasEditFormDirtyState;
}

function setAliasEditFormDirty(isDirty) {
    isAliasEditFormDirtyState = isDirty;
}

async function handleAliasEditFormSubmit(event) {
    event.preventDefault();
    console.log("[MainRenderer] Alias edit form submitted.");

    const originalKey = elements.aliasEditOriginalName.value;
    const newKey = elements.aliasEditName.textContent.trim(); // Alias name is displayed, not directly editable here

    // Collect data from alias edit form
    const aliasData = {
        type: 'alias', // Ensure type remains alias
        aspect: elements.aliasEditAspect.value.trim(),
        densite: elements.aliasEditDensite.value.trim(),
        dimentions: elements.aliasEditDimentions.value.trim(),
        sizeImpression: elements.aliasEditSizeImpression.value.trim(),
        mockups: getMockupPathsFromAliasEditForm(elements.aliasEditMockupPathsContainer)
    };

    // Basic validation (e.g., alias key shouldn't be empty, though it's display-only here)
    if (!originalKey) {
        alert('Error: Alias name is missing.');
        return;
    }

    // Update the currentConfig
    currentConfig[originalKey] = cleanObject(aliasData); // Update using original key

    // Re-render everything to reflect changes
    document.dispatchEvent(new CustomEvent('product-data-updated', { detail: { config: currentConfig, updatedKey: originalKey } }));

    setAliasEditFormDirty(false);
    closeAliasEditModal();
    alert(`Alias "${originalKey}" updated successfully!`);
}


// New event handler for promoting field to known
document.addEventListener('promote-field-to-known', (event) => {
    const { fieldKey, fieldValue, modalState } = event.detail;
    console.log(`[MainRenderer] Caught 'promote-field-to-known' event for key: ${fieldKey}, value: ${fieldValue}`);
    
    // Pass the original product modal state to the field management modal
    openManageFieldsModalForPromotion({
        key: fieldKey,
        label: fieldKey.split('.').pop().replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()), // Basic label suggestion
        type: typeof fieldValue === 'number' ? 'number' : 'text', // Infer type
        required: false,
        originalModalState: modalState // Pass the state back
    });
});


async function handleFullCsvImport(csvData) {
    console.log("[MainRenderer] Processing full CSV import for product configuration.");
    if (!csvData || csvData.length === 0) {
        alert("No valid data found in the CSV file for products.");
        return;
    }

    const newConfigFromCsv = {};
    let hasErrors = false;

    for (const record of csvData) {
        const productKey = record.name;
        if (!productKey || productKey.trim() === '') {
            console.error("[MainRenderer] CSV Import Error: Skipping record due to empty 'name' field.", record);
            hasErrors = true;
            continue;
        }

        if (newConfigFromCsv.hasOwnProperty(productKey)) {
            console.warn(`[MainRenderer] CSV Import Warning: Duplicate product key "${productKey}" found. Skipping later occurrences.`);
            hasErrors = true;
            continue;
        }

        const reconstructedProduct = reconstructProductFromFlatCsvRecord(record, currentKnownFieldsConfig);
        newConfigFromCsv[productKey] = reconstructedProduct;
    }

    if (Object.keys(newConfigFromCsv).length > 0) {
        // Option to merge or replace
        const confirmMerge = confirm(
            `Successfully processed ${Object.keys(newConfigFromCsv).length} products from CSV.\n` +
            `Do you want to merge this data with the current configuration (OK) or replace it (Cancel)?\n\n` +
            `OK: Merge (new products added, existing ones updated)\n` +
            `Cancel: Replace (current configuration will be entirely replaced by CSV data)`
        );

        if (confirmMerge) {
            Object.assign(currentConfig, newConfigFromCsv); // Merge
            alert(`CSV data merged with current configuration.`);
        } else {
            currentConfig = newConfigFromCsv; // Replace
            alert(`Current configuration replaced by CSV data.`);
        }
        
        document.dispatchEvent(new CustomEvent('product-data-updated', { detail: { config: currentConfig, updatedKey: null } }));
    } else {
        alert("No valid products could be imported from the CSV file.");
    }

    if (hasErrors) {
        alert("Some issues were encountered during CSV import (e.g., empty names, duplicates). Check console for details.");
    }
}