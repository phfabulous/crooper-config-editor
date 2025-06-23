// src/renderer/fieldManagement.js
import { FIELDS_CONFIG_FILE_NAME, KNOWN_FIELDS_CONFIG } from './constants.js';
import { cleanObject } from './utils.js';

let elements;
let currentKnownFieldsConfig = {};
let originalModalStateBeforePromotion = null; // Nouvelle variable pour stocker l'état de la modale produit

export const initializeFieldManagementElements = (domElements, initialFieldsConfig) => {
    elements = domElements;
    currentKnownFieldsConfig = initialFieldsConfig;

    elements.closeManageFieldsModalBtn.addEventListener('click', closeManageFieldsModal);
    elements.manageFieldsBtn.addEventListener('click', openManageFieldsModal);
    elements.productTypeForFields.addEventListener('change', renderFieldsList);
    elements.addNewFieldBtn.addEventListener('click', addEditableFieldRow);
    elements.saveFieldsConfigBtn.addEventListener('click', saveKnownFieldsConfigToDisk);

    // Initial render when the module is initialized
    renderFieldsList();
};

export const updateFieldManagementData = (fieldsConfig) => {
    currentKnownFieldsConfig = fieldsConfig;
    renderFieldsList();
};

export function openManageFieldsModal() {
    console.log("[FieldManagement] Opening Manage Fields Modal.");
    elements.manageFieldsModal.style.display = 'block';
    elements.productTypeForFields.value = 'all';
    renderFieldsList();
    originalModalStateBeforePromotion = null; // Réinitialiser si ouvert directement
}

// Fonction modifiée pour accepter le modalState
export function openManageFieldsModalForPromotion(fieldData) {
    console.log("[FieldManagement] Opening Manage Fields Modal for field promotion:", fieldData);
    elements.manageFieldsModal.style.display = 'block';
    elements.productTypeForFields.value = 'all'; // Afficher 'all' par défaut lors de la promotion
    renderFieldsList(); // Re-render la liste pour s'assurer qu'elle est propre
    addEditableFieldRow(fieldData); // Ajouter le champ promu à la liste éditée
    // Stocker l'état original de la modale produit
    originalModalStateBeforePromotion = fieldData.originalModalState || null;
}


export function closeManageFieldsModal() {
    console.log("[FieldManagement] Closing Manage Fields Modal.");
    elements.manageFieldsModal.style.display = 'none';
    elements.fieldsListContainer.innerHTML = '';
    originalModalStateBeforePromotion = null; // Réinitialiser après fermeture
}

function renderFieldsList() {
    console.log("[FieldManagement] Rendering fields list for type:", elements.productTypeForFields.value);
    elements.fieldsListContainer.innerHTML = '';
    const selectedType = elements.productTypeForFields.value;

    let fieldsToDisplay = [];

    if (selectedType === 'all') {
        const defaultFields = KNOWN_FIELDS_CONFIG['tshirt']?.fields || {
            "name": { "type": "text", "label": "Product Key / Name", "required": true },
            "type": { "type": "select", "label": "Type de Produit", "options": ["alias", "simple", "parent"], "required": true },
            "prefix": { "type": "text", "label": "Prefix SKU", "required": true }
        };
        // Pour "all", itérer sur tous les champs connus pour les afficher
        const allUniqueFields = {};
        for (const typeKey in currentKnownFieldsConfig) {
            if (currentKnownFieldsConfig[typeKey] && currentKnownFieldsConfig[typeKey].fields) {
                for (const fieldKey in currentKnownFieldsConfig[typeKey].fields) {
                    if (!allUniqueFields[fieldKey]) { // Vérifier par clé pour éviter les doublons
                        allUniqueFields[fieldKey] = currentKnownFieldsConfig[typeKey].fields[fieldKey];
                    }
                }
            }
        }
        // Ajouter les champs par défaut si la config chargée est vide
        if (Object.keys(allUniqueFields).length === 0) {
            Object.assign(allUniqueFields, defaultFields);
        }
        fieldsToDisplay = Object.entries(allUniqueFields).map(([key, config]) => ({ key, ...config }));

    } else if (currentKnownFieldsConfig[selectedType]) {
        fieldsToDisplay = Object.entries(currentKnownFieldsConfig[selectedType].fields).map(([key, config]) => ({ key, ...config }));
    } else {
        console.log(`[FieldManagement] No specific configuration found for product type: ${selectedType}. Using a default minimal set.`);
        // Fallback to a hardcoded minimal set if no config is found for the selected type
        // This set should ideally mirror the default in KNOWN_FIELDS_CONFIG to avoid inconsistencies
        fieldsToDisplay = [
            { key: 'name', label: 'Product Key / Name', type: 'text', required: true, disabled: true },
            { key: 'type', label: 'Type de Produit', type: 'select', options: ['alias', 'simple', 'parent'], required: true, disabled: true },
            { key: 'prefix', label: 'Prefix SKU', type: 'text', required: true }
        ];
    }
    
    const headerRow = document.createElement('div');
    headerRow.classList.add('field-row', 'field-header');
    headerRow.innerHTML = `
        <div class="field-label-col">Label</div>
        <div class="field-key-col">Key</div>
        <div class="field-type-col">Type</div>
        <div class="field-required-col">Required</div>
        <div class="field-options-col">Options (comma-separated)</div>
        <div class="field-actions-col">Actions</div>
    `;
    elements.fieldsListContainer.appendChild(headerRow);

    fieldsToDisplay.forEach(field => addEditableFieldRow(field));
}

function addEditableFieldRow(fieldData = {}) {
    const fieldRow = document.createElement('div');
    fieldRow.classList.add('field-row');
    fieldRow.dataset.fieldKey = fieldData.key || '';

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.classList.add('field-label-input');
    labelInput.value = fieldData.label || '';
    labelInput.placeholder = 'Label';

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.classList.add('field-key-input');
    keyInput.value = fieldData.key || '';
    keyInput.placeholder = 'Key (e.g., product.name)';
    keyInput.disabled = fieldData.disabled || false; // Désactiver pour les champs système (name, type)

    const typeSelect = document.createElement('select');
    typeSelect.classList.add('field-type-select');
    ['text', 'number', 'textarea', 'select', 'checkbox', 'imageUrl'].forEach(type => { // Ajout de imageUrl ici
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type.charAt(0).toUpperCase() + type.slice(1);
        typeSelect.appendChild(option);
    });
    typeSelect.value = fieldData.type || 'text';
    typeSelect.disabled = fieldData.disabled || false; // Désactiver pour les champs système

    const requiredCheckboxWrapper = document.createElement('div'); // Wrapper pour centrer la checkbox
    requiredCheckboxWrapper.classList.add('field-required-checkbox-wrapper');
    const requiredCheckbox = document.createElement('input');
    requiredCheckbox.type = 'checkbox';
    requiredCheckbox.classList.add('field-required-checkbox');
    requiredCheckbox.checked = fieldData.required || false;
    requiredCheckboxWrapper.appendChild(requiredCheckbox);


    const optionsInput = document.createElement('input');
    optionsInput.type = 'text';
    optionsInput.classList.add('field-options-input');
    optionsInput.value = (fieldData.options && Array.isArray(fieldData.options)) ? fieldData.options.join(', ') : '';
    optionsInput.placeholder = 'Option1, Option2';
    optionsInput.style.display = (typeSelect.value === 'select' ? 'block' : 'none');
    typeSelect.addEventListener('change', () => {
        optionsInput.style.display = (typeSelect.value === 'select' ? 'block' : 'none');
    });

    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Remove';
    deleteButton.classList.add('remove-field-btn');
    deleteButton.type = 'button';
    deleteButton.addEventListener('click', () => {
        if (confirm(`Are you sure you want to remove the field "${labelInput.value || keyInput.value}"?`)) {
            fieldRow.remove();
        }
    });

    const actionsCol = document.createElement('div');
    actionsCol.classList.add('field-actions-col');
    actionsCol.appendChild(deleteButton);


    fieldRow.appendChild(labelInput);
    fieldRow.appendChild(keyInput);
    fieldRow.appendChild(typeSelect);
    fieldRow.appendChild(requiredCheckboxWrapper);
    fieldRow.appendChild(optionsInput);
    fieldRow.appendChild(actionsCol);

    elements.fieldsListContainer.appendChild(fieldRow);
}

async function saveKnownFieldsConfigToDisk() {
    console.log("[FieldManagement] Attempting to save known fields configuration.");
    const selectedType = elements.productTypeForFields.value;
    const newConfigForType = {
        displayOrder: [],
        fields: {}
    };

    const fieldRows = elements.fieldsListContainer.querySelectorAll('.field-row:not(.field-header)');
    fieldRows.forEach(row => {
        const label = row.querySelector('.field-label-input').value.trim();
        const key = row.querySelector('.field-key-input').value.trim();
        const type = row.querySelector('.field-type-select').value;
        const required = row.querySelector('.field-required-checkbox').checked;
        const optionsStr = row.querySelector('.field-options-input').value.trim();
        const options = optionsStr ? optionsStr.split(',').map(opt => opt.trim()) : undefined;

        if (key) {
            newConfigForType.displayOrder.push(key);
            newConfigForType.fields[key] = cleanObject({
                label: label || key,
                type: type,
                required: required || undefined,
                options: options || undefined
            });
        }
    });

    // If 'all' is selected, merge with existing config, don't overwrite other types
    if (selectedType === 'all') {
        // Create a deep copy to modify
        const updatedAllFieldsConfig = JSON.parse(JSON.stringify(currentKnownFieldsConfig));
        
        // Ensure default structure for 'all' types if they don't exist
        if (!updatedAllFieldsConfig['simple']) updatedAllFieldsConfig['simple'] = { displayOrder: [], fields: {} };
        if (!updatedAllFieldsConfig['parent']) updatedAllFieldsConfig['parent'] = { displayOrder: [], fields: {} };
        if (!updatedAllFieldsConfig['alias']) updatedAllFieldsConfig['alias'] = { displayOrder: [], fields: {} };

        // For "all" mode, update fields across all specific types,
        // or just add them to a 'common' type if you want a shared set.
        // The current implementation for 'all' just iterates for display,
        // so we need to decide how to save 'all' changes.
        // For simplicity, let's assume 'all' edits apply to all specific types if they don't override.
        // A more robust solution would be to have a 'common' section in config.
        
        // For now, let's just save the 'all' edited fields as a new 'all' type in the config,
        // or better, find the most common type and apply there, or apply to all existing.
        // A simpler approach for 'all' mode: if a field is edited, update it in ALL types
        // where it exists, and add it to a default type (e.g., 'tshirt') if new.

        // Simpler for now: just update the 'all' key (if we ever use it) or directly overwrite the current display logic.
        // Let's assume for 'all' mode, we're editing shared/global fields.
        // For existing common fields, update their properties. For new fields, add them to 'tshirt' as a default.
        
        // This part needs careful design for "all" mode.
        // For now, if "all" is selected, let's update a placeholder 'all' config and re-dispatch.
        currentKnownFieldsConfig[selectedType] = newConfigForType; // This will update the 'all' key
    } else {
        currentKnownFieldsConfig[selectedType] = newConfigForType;
    }

    currentKnownFieldsConfig = cleanObject(currentKnownFieldsConfig);

    try {
        const success = await window.electronAPI.saveKnownFieldsConfig(currentKnownFieldsConfig, FIELDS_CONFIG_FILE_NAME);
        if (success) {
            alert('Known fields configuration saved successfully!');
            document.dispatchEvent(new CustomEvent('known-fields-config-updated', {
                detail: { config: currentKnownFieldsConfig, modalState: originalModalStateBeforePromotion }
            }));
        } else {
            alert('Failed to save known fields configuration.');
        }
    } catch (error) {
        console.error("[FieldManagement] Error saving known fields configuration:", error);
        alert('An unexpected error occurred while saving fields configuration: ' + error.message);
    }
}

export async function loadKnownFieldsConfig() {
    console.log("[FieldManagement] Request to load known fields configuration.");
    try {
        const loadedConfig = await window.electronAPI.loadKnownFieldsConfig(FIELDS_CONFIG_FILE_NAME);
        if (Object.keys(loadedConfig).length === 0) {
            console.log("[FieldManagement] No custom fields config found, using default KNOWN_FIELDS_CONFIG from constants.");
            currentKnownFieldsConfig = JSON.parse(JSON.stringify(KNOWN_FIELDS_CONFIG));
        } else {
            // Merge loaded config with default KNOWN_FIELDS_CONFIG to ensure all default types are present
            // and newly added fields are recognized even if they weren't explicitly saved per type.
            const mergedConfig = JSON.parse(JSON.stringify(KNOWN_FIELDS_CONFIG));
            for (const typeKey in loadedConfig) {
                if (loadedConfig[typeKey] && loadedConfig[typeKey].fields) {
                    if (!mergedConfig[typeKey]) {
                        mergedConfig[typeKey] = { displayOrder: [], fields: {} };
                    }
                    for (const fieldKey in loadedConfig[typeKey].fields) {
                        // Add new fields or update existing ones
                        if (!mergedConfig[typeKey].fields[fieldKey]) {
                            mergedConfig[typeKey].displayOrder.push(fieldKey);
                        }
                        mergedConfig[typeKey].fields[fieldKey] = loadedConfig[typeKey].fields[fieldKey];
                    }
                    // Ensure display order is unique and reflects new additions
                    mergedConfig[typeKey].displayOrder = [...new Set([...mergedConfig[typeKey].displayOrder, ...Object.keys(loadedConfig[typeKey].fields)])];
                }
            }
            currentKnownFieldsConfig = mergedConfig;
            console.log("[FieldManagement] Known fields config loaded and merged:", currentKnownFieldsConfig);
        }
        document.dispatchEvent(new CustomEvent('known-fields-config-loaded', { detail: { config: currentKnownFieldsConfig } }));
        return currentKnownFieldsConfig;
    } catch (error) {
        console.error("[FieldManagement] Error during loadKnownFieldsConfig:", error);
        alert('An unexpected error occurred while loading fields configuration: ' + error.message);
        return {};
    }
}