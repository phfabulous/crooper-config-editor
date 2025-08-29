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

// New: ensure toolbar with Expand/Collapse All is available and wired
function ensureProductToolbar(container) {
    if (!container || !container.parentElement) return;
    const parent = container.parentElement;
    // Avoid creating multiple toolbars
    if (parent.querySelector('.product-toolbar')) return;

    const toolbar = document.createElement('div');
    toolbar.classList.add('product-toolbar');
    toolbar.style.display = 'flex';
    toolbar.style.gap = '8px';
    toolbar.style.marginBottom = '8px';

    const expandAllBtn = document.createElement('button');
    expandAllBtn.textContent = 'Afficher tout';
    expandAllBtn.title = 'Développer tous les produits';
    expandAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Dispatch a global event so other modules (catalog) can react
        document.dispatchEvent(new CustomEvent('global-expand-products'));
        // Set global flag for future modal openings
        try { document.documentElement.dataset.productsCollapsed = 'false'; } catch (err) {}
        // Local fallback
        try { expandAllProducts(); } catch (err) { console.warn('expandAllProducts error', err); }
    });

    const collapseAllBtn = document.createElement('button');
    collapseAllBtn.textContent = 'Réduire tout';
    collapseAllBtn.title = 'Réduire tous les produits';
    collapseAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.dispatchEvent(new CustomEvent('global-collapse-products'));
        try { document.documentElement.dataset.productsCollapsed = 'true'; } catch (err) {}
        try { collapseAllProducts(); } catch (err) { console.warn('collapseAllProducts error', err); }
    });

    const toggleAllBtn = document.createElement('button');
    toggleAllBtn.textContent = 'Basculer';
    toggleAllBtn.title = 'Basculer l\'état de tous les produits';
    toggleAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const anyCollapsed = Array.from(parent.querySelectorAll('.product-card')).some(card => card.classList.contains('collapsed'));
        if (anyCollapsed) {
            document.dispatchEvent(new CustomEvent('global-expand-products'));
            try { document.documentElement.dataset.productsCollapsed = 'false'; } catch (err) {}
            try { expandAllProducts(); } catch (err) { console.warn(err); }
        } else {
            document.dispatchEvent(new CustomEvent('global-collapse-products'));
            try { document.documentElement.dataset.productsCollapsed = 'true'; } catch (err) {}
            try { collapseAllProducts(); } catch (err) { console.warn(err); }
        }
    });

    toolbar.appendChild(expandAllBtn);
    toolbar.appendChild(collapseAllBtn);
    toolbar.appendChild(toggleAllBtn);

    parent.insertBefore(toolbar, container);
}

export function collapseAllProducts() {
    const container = elements && elements.productContainer;
    if (!container) return;
    const cards = container.querySelectorAll('.product-card');
    cards.forEach(card => {
        card.classList.add('collapsed');
        const key = card.dataset.productKey;
        if (key) collapseState[key] = true;
    });
}

export function expandAllProducts() {
    const container = elements && elements.productContainer;
    if (!container) return;
    const cards = container.querySelectorAll('.product-card');
    cards.forEach(card => {
        card.classList.remove('collapsed');
        const key = card.dataset.productKey;
        if (key) collapseState[key] = false;
    });
}

export const initializeProductElements = (domElements, config, selectedKey, knownFieldsConfig) => { // Ajout de knownFieldsConfig
    elements = domElements;
    currentConfig = config;
    currentSelectedProductKey = selectedKey;
    currentKnownFieldsConfig = knownFieldsConfig; // Initialiser la config des champs connus

    // Vérifier si productContainer existe avant d'attacher les écouteurs
    if (elements.productContainer) {
        // Ensure toolbar exists for expand/collapse
        ensureProductToolbar(elements.productContainer);

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
    container.innerHTML = '';

    // Filter out 'alias' type products and the special 'catalog' key from the main product list
    const nonAliasProducts = Object.keys(configToRender)
                                .filter(key => key !== 'catalog' && configToRender[key].type !== 'alias')
                                .reduce((obj, key) => {
                                    obj[key] = configToRender[key];
                                    return obj;
                                }, {});

    const productNames = Object.keys(nonAliasProducts);
    const duplicateNames = isTemplateView ? [] : findDuplicates(productNames);

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
            productCard.draggable = true;
        }
        if (!isTemplateView && duplicateNames.includes(key)) {
            productCard.classList.add('duplicate');
        }
        // Modern header
        const header = document.createElement('div');
        header.classList.add('product-header');
        const titleSpan = document.createElement('span');
        titleSpan.textContent = product.name || key;
        const actionsDiv = document.createElement('div');
        actionsDiv.classList.add('product-actions');
        // Always visible actions
        const editBtn = document.createElement('button');
        editBtn.textContent = '✏️';
        editBtn.classList.add('edit-btn');
        editBtn.title = 'Éditer';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            currentSelectedProductKey = key;
            document.dispatchEvent(new CustomEvent('open-edit-product-modal', { detail: { productKey: key } }));
        });
        const duplicateBtn = document.createElement('button');
        duplicateBtn.textContent = '⎘';
        duplicateBtn.classList.add('duplicate-btn');
        duplicateBtn.title = 'Dupliquer';
        duplicateBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.dispatchEvent(new CustomEvent('duplicate-product', { detail: { productKey: key } }));
        });
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '🗑️';
        deleteBtn.classList.add('delete-btn');
        deleteBtn.title = 'Supprimer';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.dispatchEvent(new CustomEvent('delete-product', { detail: { productKey: key } }));
        });
        actionsDiv.appendChild(editBtn);
        actionsDiv.appendChild(duplicateBtn);
        actionsDiv.appendChild(deleteBtn);
        header.appendChild(titleSpan);
        header.appendChild(actionsDiv);
        productCard.appendChild(header);
        // Collapse/expand details
        header.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            const collapsedNow = !productCard.classList.contains('collapsed');
            productCard.classList.toggle('collapsed');
            collapseState[key] = collapsedNow;
        });
        const isCollapsed = collapseState[key] !== undefined ? collapseState[key] : true;
        collapseState[key] = isCollapsed;
        if (isCollapsed) productCard.classList.add('collapsed');
        const detailsDiv = document.createElement('div');
        detailsDiv.classList.add('product-details');
        // Champs principaux
        let fieldsToDisplay = [];
        const productTypeSpecificKey = product.product || product.type;
        let configForProduct = currentKnownFieldsConfig[productTypeSpecificKey];
        if (!configForProduct) {
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
                case 'imageUrl':
                    input = document.createElement('input');
                    input.type = 'text';
                    input.value = value;
                    break;
                default:
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
        productCard.appendChild(detailsDiv);
        // Sélection visuelle
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
        container.appendChild(productCard);
    });
}