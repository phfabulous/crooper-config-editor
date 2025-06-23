// src/renderer/templateManagement.js
import { renderProducts } from './productManagement.js';
import { TEMPLATES_FILE_NAME } from './constants.js';

// DOM elements (passed during initialization)
let elements;
let currentConfig; // From mainRenderer
let savedProductTemplates; // Internal state for templates

export const initializeTemplateElements = (domElements, config, templates) => {
    elements = domElements;
    currentConfig = config;
    savedProductTemplates = templates;

    // Attach event listeners
    elements.saveTemplateForm.addEventListener('submit', handleSaveTemplateFormSubmit);
    elements.closeSaveTemplateModalBtn.addEventListener('click', closeSaveTemplateModal);
};

// Function to update global state references when they change in mainRenderer
export const updateTemplateData = (config, templates) => {
    currentConfig = config;
    savedProductTemplates = templates; 
    renderSavedProductTemplates(savedProductTemplates); // Re-render sidebar templates when data updates
};

export function renderSavedProductTemplates(templatesToRender) {
    console.log("[TemplateManagement] Rendering templates. Count:", Object.keys(templatesToRender).length);
    elements.savedTemplatesContainer.innerHTML = '';
    const templateKeys = Object.keys(templatesToRender);

    if (templateKeys.length === 0) {
        elements.noSavedTemplatesMessage.style.display = 'block';
        return;
    } else {
        elements.noSavedTemplatesMessage.style.display = 'none';
    }

    templateKeys.forEach(key => {
        const template = templatesToRender[key];
        const templateItem = document.createElement('div');
        templateItem.classList.add('template-item');
        templateItem.dataset.templateKey = key;

        const nameContainer = document.createElement('div'); // Conteneur pour les noms
        nameContainer.classList.add('template-name-container');

        const friendlyNameSpan = document.createElement('span');
        friendlyNameSpan.classList.add('friendly-name');
        friendlyNameSpan.textContent = template.friendlyName || key;
        nameContainer.appendChild(friendlyNameSpan);

        const techNameSpan = document.createElement('span');
        techNameSpan.classList.add('tech-name');
        techNameSpan.textContent = ` (${key})`;
        nameContainer.appendChild(techNameSpan);

        const actionsDiv = document.createElement('div');
        actionsDiv.classList.add('template-actions');

        const addToConfigBtn = document.createElement('button');
        addToConfigBtn.textContent = 'Add';
        addToConfigBtn.classList.add('add-from-template-btn');
        addToConfigBtn.title = 'Add to Configuration';
        addToConfigBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log(`[TemplateManagement] Bouton 'Add' cliqué pour template: ${key}`);
            document.dispatchEvent(new CustomEvent('add-product-from-template', { detail: { templateKey: key } }));
        });

        const deleteTemplateBtn = document.createElement('button');
        deleteTemplateBtn.textContent = 'Del';
        deleteTemplateBtn.classList.add('delete-template-btn');
        deleteTemplateBtn.title = 'Delete Template';
        deleteTemplateBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log(`[TemplateManagement] Bouton 'Del' cliqué pour template: ${key}`);
            document.dispatchEvent(new CustomEvent('delete-product-template', { detail: { templateKey: key } }));
        });

        actionsDiv.appendChild(addToConfigBtn);
        actionsDiv.appendChild(deleteTemplateBtn);

        templateItem.appendChild(nameContainer);
        templateItem.appendChild(actionsDiv);

        templateItem.addEventListener('click', () => {
            document.querySelectorAll('.template-item.selected').forEach(item => item.classList.remove('selected'));
            templateItem.classList.add('selected');
        });

        elements.savedTemplatesContainer.appendChild(templateItem);
    });
}

export async function loadProductTemplates() {
    console.log("[TemplateManagement] Initial load request.");
    try {
        const templates = await window.electronAPI.loadProductTemplatesFromFile(TEMPLATES_FILE_NAME);
        if (templates) {
            savedProductTemplates = templates;
            renderSavedProductTemplates(savedProductTemplates);
            console.log("[TemplateManagement] Templates loaded into module state:", savedProductTemplates);
            return templates;
        }
    } catch (error) {
        console.error("[TemplateManagement] Error during loadProductTemplates:", error);
    }
    return {};
}

export async function saveProductTemplatesToDisk() {
    console.log("[TemplateManagement] Request to save templates to disk. Current state:", savedProductTemplates);
    try {
        const success = await window.electronAPI.saveProductTemplatesFromFile(savedProductTemplates, TEMPLATES_FILE_NAME);
        if (success) {
            console.log('[TemplateManagement] Product templates saved successfully to disk!');
        } else {
            alert('Failed to save product templates to disk.');
        }
        return success;
    } catch (error) {
        console.error("[TemplateManagement] Error during saveProductTemplatesToDisk:", error);
        alert('An unexpected error occurred while saving templates: ' + error.message);
        return false;
    }
}

export function openSaveTemplateModal(productKeyToSave) {
    elements.templateTechnicalNameInput.value = productKeyToSave;
    elements.templateFriendlyNameInput.value = productKeyToSave;
    elements.saveTemplateModal.style.display = 'block';
}

export function closeSaveTemplateModal() {
    elements.saveTemplateModal.style.display = 'none';
    elements.saveTemplateForm.reset();
}

async function handleSaveTemplateFormSubmit(event) {
    event.preventDefault();
    const friendlyName = elements.templateFriendlyNameInput.value.trim();
    const technicalName = elements.templateTechnicalNameInput.value.trim();

    if (!friendlyName) {
        alert('Friendly Name is required.');
        return;
    }

    if (!currentConfig || !currentConfig[technicalName]) {
        alert('Error: The selected product to save as template was not found in the current configuration.');
        closeSaveTemplateModal();
        return;
    }

    const productToSave = JSON.parse(JSON.stringify(currentConfig[technicalName]));
    productToSave.friendlyName = friendlyName;

    let baseTechnicalName = technicalName;
    let uniqueTemplateKey = baseTechnicalName;
    let counter = 1;
    while (savedProductTemplates.hasOwnProperty(uniqueTemplateKey)) {
        uniqueTemplateKey = `${baseTechnicalName}_${counter}`;
        counter++;
    }

    savedProductTemplates[uniqueTemplateKey] = productToSave;
    renderSavedProductTemplates(savedProductTemplates);
    const saveSuccess = await saveProductTemplatesToDisk();
    closeSaveTemplateModal();
    if (saveSuccess) {
        alert(`Product "${technicalName}" saved as template "${friendlyName}" (Technical ID: ${uniqueTemplateKey}).`);
    } else {
        alert(`Failed to save template "${friendlyName}". Check console for errors.`);
    }
    
    document.dispatchEvent(new CustomEvent('templates-updated', { detail: { templates: savedProductTemplates } }));
}


export function addProductFromTemplate(templateKey) {
    console.log(`[TemplateManagement] addProductFromTemplate called for template: ${templateKey}`);
    const templateProduct = savedProductTemplates[templateKey];
    if (!templateProduct) {
        alert('Template product not found.');
        console.error(`[TemplateManagement] Template "${templateKey}" not found in savedProductTemplates.`);
        return;
    }

    let newProductKey = templateKey;
    let counter = 1;
    while (currentConfig.hasOwnProperty(newProductKey)) {
        newProductKey = `${templateKey}_new${counter++}`;
    }

    const newProduct = JSON.parse(JSON.stringify(templateProduct));
    newProduct.name = newProductKey;

    delete newProduct.friendlyName;

    currentConfig[newProductKey] = newProduct;
    console.log(`[TemplateManagement] New product added to currentConfig: ${newProductKey}`, JSON.parse(JSON.stringify(newProduct)));
    document.dispatchEvent(new CustomEvent('product-data-updated', { detail: { config: currentConfig, updatedKey: newProductKey } }));
    alert(`Template "${templateProduct.friendlyName || templateKey}" added to current configuration as "${newProductKey}".`);
}

export function deleteProductTemplate(templateKey) {
    console.log(`[TemplateManagement] deleteProductTemplate called for template: ${templateKey}`);
    if (confirm(`Are you sure you want to delete product template "${savedProductTemplates[templateKey].friendlyName || templateKey}"?`)) {
        delete savedProductTemplates[templateKey];
        console.log(`[TemplateManagement] Template deleted from savedProductTemplates: ${templateKey}`);
        renderSavedProductTemplates(savedProductTemplates);
        saveProductTemplatesToDisk();
        alert(`Product template "${templateKey}" deleted.`);

        document.dispatchEvent(new CustomEvent('templates-updated', { detail: { templates: savedProductTemplates } }));
    }
}