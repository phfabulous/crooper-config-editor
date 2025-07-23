// src/renderer/productManagement.js
import { findDuplicates, getDragAfterElement } from './utils.js';
// Importer KNOWN_FIELDS_CONFIG pour le fallback par défaut
import { KNOWN_FIELDS_CONFIG, FIELD_CONDITIONS } from './constants.js';

// Internal collapsed state for each product card
let collapseState = {};

// DOM elements (passed during initialization)
let elements;
let currentConfig; // This will be passed from mainRenderer
let currentSelectedProductKey; // This will be passed from mainRenderer
let currentKnownFieldsConfig; // Nouvelle variable pour la configuration des champs connus

let draggedItem = null; // Internal state for drag & drop

// Reset collapse state (called when loading a new configuration)
export const resetCollapseState = () => {
    collapseState = {};
};

export const initializeProductElements = (domElements, config, selectedKey, knownFieldsConfig) => { // Ajout de knownFieldsConfig
    elements = domElements;
    currentConfig = config;
    currentSelectedProductKey = selectedKey;
    currentKnownFieldsConfig = knownFieldsConfig; // Initialiser la config des champs connus

    // Vérifier si productContainer existe avant d'attacher les écouteurs
    if (elements.productContainer) {
        elements.productContainer.ondragover = (e) => e.preventDefault(); // Allow drop
        elements.productContainer.ondrop = (e) => {
            e.preventDefault();
            const afterElement = getDragAfterElement(elements.productContainer, e.clientY);
            const draggable = document.querySelector('.dragging');

            if (draggable && draggedItem) {
                const droppedKey = draggedItem.dataset.productKey;
                // Filter out aliases from the productArray before reordering
                const productArray = Object.keys(currentConfig)
                                        .filter(key => currentConfig[key].type !== 'alias') // Exclude aliases
                                        .map(key => ({ key, ...currentConfig[key] }));

                const draggedIndex = productArray.findIndex(p => p.key === droppedKey);
                const [movedProduct] = productArray.splice(draggedIndex, 1);

                if (afterElement == null) {
                    productArray.push(movedProduct);
                } else {
                    const afterKey = afterElement.dataset.productKey;
                    const afterIndex = productArray.findIndex(p => p.key === afterKey);
                    productArray.splice(afterIndex, 0, movedProduct);
                }

                // Reconstruct currentConfig, ensuring aliases remain at the top
                const newOrderedConfig = {};
                // First, add all aliases back in their original order (or sorted if preferred)
                Object.keys(currentConfig)
                      .filter(key => currentConfig[key].type === 'alias')
                      .sort((a, b) => a.localeCompare(b)) // Keep aliases sorted consistently
                      .forEach(key => newOrderedConfig[key] = currentConfig[key]);

                // Then, add the reordered non-alias products
                productArray.forEach(p => {
                    const { key, ...rest } = p;
                    newOrderedConfig[key] = rest;
                });

                currentConfig = newOrderedConfig;
                // Dispatch event to mainRenderer to trigger a full re-render of content
                document.dispatchEvent(new CustomEvent('product-data-updated', { detail: { config: currentConfig, updatedKey: droppedKey } }));
            }
        };
    } else {
        console.error("[ProductManagement] ERREUR DOM: L'élément #productContainer n'a pas été trouvé.");
    }
};

export const updateProductData = (config, selectedKey, knownFieldsConfig) => { // Ajout de knownFieldsConfig
    currentConfig = config;
    currentSelectedProductKey = selectedKey;
    currentKnownFieldsConfig = knownFieldsConfig; // Mettre à jour la config des champs connus
    // Call renderProducts here to refresh the display based on updated data
    renderProducts(currentConfig, elements.productContainer, false);
};


export function renderProducts(configToRender, container, isTemplateView = false) {
    if (!container) {
        console.error("[ProductManagement] ERREUR DOM: Le conteneur de produits est null lors du rendu.");
        return;
    }
    container.innerHTML = ''; // TRÈS IMPORTANT : Vider le conteneur avant de re-rendre

    // Filter out 'alias' type products from the main product list
    const nonAliasProducts = Object.keys(configToRender)
                                .filter(key => configToRender[key].type !== 'alias')
                                .reduce((obj, key) => {
                                    obj[key] = configToRender[key];
                                    return obj;
                                }, {});

    const productNames = Object.keys(nonAliasProducts);
    const duplicateNames = isTemplateView ? [] : findDuplicates(productNames);

    // Ensure elements.noProductMessage and elements.noSavedTemplatesMessage are correctly referenced
    const messageElement = isTemplateView ? (elements.noSavedTemplatesMessage || document.getElementById('noSavedTemplatesMessage')) : (elements.noProductMessage || document.getElementById('noProductMessage'));

    if (productNames.length === 0) {
        if (messageElement) messageElement.style.display = 'block';
        return;
    } else {
        if (messageElement) messageElement.style.display = 'none';
    }

    const productArray = Object.keys(nonAliasProducts).map(key => ({ key, ...nonAliasProducts[key] }));


    productArray.forEach(product => {
        const key = product.key;
        const productCard = document.createElement('div');
        productCard.classList.add('product-card');
        productCard.dataset.productKey = key;
        if (!isTemplateView) {
            productCard.draggable = true; // Make draggable for main view
        }

        if (!isTemplateView && duplicateNames.includes(key)) {
            productCard.classList.add('duplicate');
        }
        const header = document.createElement('h3');
        header.classList.add('product-header');

        const titleSpan = document.createElement('span');
        titleSpan.textContent = product.name || key;

        const editShortBtn = document.createElement('button');
        editShortBtn.textContent = 'Edit';
        editShortBtn.classList.add('header-edit-btn');
        editShortBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            currentSelectedProductKey = key;
            document.dispatchEvent(new CustomEvent('open-edit-product-modal', { detail: { productKey: key } }));
        });

        const collapseIcon = document.createElement('span');
        collapseIcon.classList.add('collapse-icon');
        collapseIcon.innerHTML = '&#9660;';

        header.appendChild(titleSpan);
        header.appendChild(editShortBtn);
        header.appendChild(collapseIcon);

        header.addEventListener('click', (e) => {
            if (e.target.closest('.header-edit-btn')) return;
            const collapsedNow = !productCard.classList.contains('collapsed');
            productCard.classList.toggle('collapsed');
            collapseState[key] = collapsedNow;
        });
        productCard.appendChild(header);

        const isCollapsed = collapseState[key] !== undefined ? collapseState[key] : true;
        collapseState[key] = isCollapsed;
        if (isCollapsed) productCard.classList.add('collapsed');

        const detailsDiv = document.createElement('div');
        detailsDiv.classList.add('product-details');

        let fieldsToDisplay = [];
        const productTypeSpecificKey = product.product || product.type;
        
        let configForProduct = currentKnownFieldsConfig[productTypeSpecificKey];
        
        if (!configForProduct) {
            console.warn(`[ProductManagement] No specific field config found for product type "${productTypeSpecificKey}" or generic type "${product.type}". Using default 'tshirt' or minimal fields.`);
            configForProduct = KNOWN_FIELDS_CONFIG["tshirt"] || {
                displayOrder: ["name", "type", "prefix"],
                fields: {
                    "name": { "type": "text", "label": "Product Key / Name" },
                    "type": { "type": "text", "label": "Type" },
                    "prefix": { "type": "text", "label": "Prefix SKU" }
                }
            };
        }


        fieldsToDisplay = configForProduct.displayOrder.map(fieldKey => {
            const fieldConfig = configForProduct.fields[fieldKey];
            return fieldConfig ? { key: fieldKey, ...fieldConfig } : null;
        }).filter(Boolean);


        fieldsToDisplay.forEach(fieldInfo => {
            let value = product;
            const pathParts = fieldInfo.key.split('.');
            for (let i = 0; i < pathParts.length; i++) {
                if (value && typeof value === 'object' && value.hasOwnProperty(pathParts[i])) {
                    value = value[pathParts[i]];
                } else {
                    value = undefined;
                    break;
                }
            }

            if (value === undefined || value === null) value = '';

            if (fieldInfo.cond && typeof FIELD_CONDITIONS[fieldInfo.cond] === 'function' && !FIELD_CONDITIONS[fieldInfo.cond](product)) {
                return;
            }


            const p = document.createElement('p');
            const labelSpan = document.createElement('span');
            labelSpan.textContent = fieldInfo.label + ' ';
            p.appendChild(labelSpan);

            let input;
            switch (fieldInfo.type) {
                case 'text':
                case 'number':
                    input = document.createElement('input');
                    input.type = fieldInfo.type;
                    input.value = value;
                    if (fieldInfo.type === 'number') input.step = '0.01';
                    break;
                case 'textarea':
                    input = document.createElement('textarea');
                    input.value = value;
                    break;
                case 'select':
                    input = document.createElement('select');
                    fieldInfo.options.forEach(optionValue => {
                        const option = document.createElement('option');
                        option.value = optionValue;
                        option.textContent = optionValue;
                        input.appendChild(option);
                    });
                    input.value = value;
                    break;
                case 'checkbox':
                    input = document.createElement('input');
                    input.type = 'checkbox';
                    input.checked = !!value;
                    break;
                case 'imageUrl': // Rendre le type 'imageUrl' comme un champ de texte
                    input = document.createElement('input');
                    input.type = 'text';
                    input.value = value;
                    break;
                default:
                    console.warn(`[ProductManagement] Unknown field type for display: ${fieldInfo.type}`);
                    input = document.createElement('span');
                    input.textContent = value;
                    break;
            }


            input.classList.add('editable-field');
            input.dataset.key = fieldInfo.key;
            input.disabled = true;


            p.appendChild(input);
            detailsDiv.appendChild(p);
        });


        const actionsDiv = document.createElement('div');
        actionsDiv.classList.add('product-actions');

        if (isTemplateView) {
            const addToConfigBtn = document.createElement('button');
            addToConfigBtn.textContent = 'Add to Config';
            addToConfigBtn.classList.add('add-from-template-btn');
            addToConfigBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                document.dispatchEvent(new CustomEvent('add-product-from-template', { detail: { templateKey: key } }));
            });

            const deleteTemplateBtn = document.createElement('button');
            deleteTemplateBtn.textContent = 'Delete';
            deleteTemplateBtn.classList.add('delete-template-btn');
            deleteTemplateBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                document.dispatchEvent(new CustomEvent('delete-product-template', { detail: { templateKey: key } }));
            });

            actionsDiv.appendChild(addToConfigBtn);
            actionsDiv.appendChild(deleteTemplateBtn);
        } else {
            const editBtn = document.createElement('button');
            editBtn.textContent = 'Edit Full Details';
            editBtn.classList.add('edit-btn');
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                currentSelectedProductKey = key;
                document.dispatchEvent(new CustomEvent('open-edit-product-modal', { detail: { productKey: key } }));
            });

            const duplicateBtn = document.createElement('button');
            duplicateBtn.textContent = 'Duplicate';
            duplicateBtn.classList.add('duplicate-btn');
            duplicateBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                document.dispatchEvent(new CustomEvent('duplicate-product', { detail: { productKey: key } }));
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Delete';
            deleteBtn.classList.add('delete-btn');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                document.dispatchEvent(new CustomEvent('delete-product', { detail: { productKey: key } }));
            });

            actionsDiv.appendChild(editBtn);
            actionsDiv.appendChild(duplicateBtn);
            actionsDiv.appendChild(deleteBtn);

            productCard.addEventListener('click', (e) => {
                if (e.target.classList.contains('editable-field') || e.target.closest('.product-actions') || e.target.closest('.product-header')) {
                    return;
                }
                document.querySelectorAll('.product-card.selected').forEach(card => {
                    card.classList.remove('selected');
                });
                productCard.classList.add('selected');
                currentSelectedProductKey = key;
                document.dispatchEvent(new CustomEvent('product-selected', { detail: { productKey: key } }));
            });

            productCard.addEventListener('dragstart', (e) => {
                draggedItem = productCard;
                setTimeout(() => {
                    productCard.classList.add('dragging');
                }, 0);
                e.dataTransfer.effectAllowed = 'move';
            });

            productCard.addEventListener('dragend', () => {
                draggedItem = null;
                productCard.classList.remove('dragging');
            });
        }

        detailsDiv.appendChild(actionsDiv);
        productCard.appendChild(detailsDiv);

        container.appendChild(productCard);
    });
}