// src/renderer/catalogManagement.js
// Gestion de l'édition des catalogues (UI modal/panel)
let elementsCatalog = {};
let currentConfigLocal = {};
let currentCatalogLocal = null;
let currentKnownFieldsLocal = {};

let isDirty = false;
let originalCatalogSnapshot = null;

export function initializeCatalogElements(domElements, config, catalog, knownFieldsConfig) {
    elementsCatalog = domElements;
    currentConfigLocal = config;
    currentCatalogLocal = catalog || null;
    currentKnownFieldsLocal = knownFieldsConfig || {};

    // Wire open button if present
    if (elementsCatalog.openCatalogBtn) {
        elementsCatalog.openCatalogBtn.addEventListener('click', () => {
            openCatalogModal();
        });
    }

    // Wire close 'X' if present
    const closeBtn = document.getElementById('catalogModalCloseBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => closeCatalogModal());
    }

    // Populate when requested
    document.addEventListener('open-catalog-modal', () => openCatalogModal());

    // Listen for external updates
    document.addEventListener('external-catalog-update', (e) => {
        currentCatalogLocal = e.detail.catalog;
        // If modal open, re-render
        if (document.getElementById('catalogModal') && document.getElementById('catalogModal').style.display === 'block') {
            renderCatalogModal();
        }
    });

    // Listen to global expand/collapse events to keep catalog entries in sync with product toolbar
    document.addEventListener('global-expand-products', () => {
        const entries = document.querySelectorAll('.catalog-product-entry');
        entries.forEach(entry => {
            entry.classList.remove('collapsed');
            const btn = entry.querySelector('.toggle-details-btn'); if (btn) btn.textContent = '−';
        });
    });
    document.addEventListener('global-collapse-products', () => {
        const entries = document.querySelectorAll('.catalog-product-entry');
        entries.forEach(entry => {
            entry.classList.add('collapsed');
            const btn = entry.querySelector('.toggle-details-btn'); if (btn) btn.textContent = '+';
        });
    });
}

export function updateCatalogData(catalog) {
    currentCatalogLocal = catalog;
}

// New: update currentConfig reference so product lists are always up-to-date
export function updateConfigData(config, knownFieldsConfig) {
    currentConfigLocal = config || {};
    currentKnownFieldsLocal = knownFieldsConfig || {};
}

function markDirty() {
    isDirty = true;
}

function resetDirty() {
    isDirty = false;
    originalCatalogSnapshot = currentCatalogLocal ? JSON.parse(JSON.stringify(currentCatalogLocal)) : null;
}

export function openCatalogModal() {
    const modal = document.getElementById('catalogModal');
    if (!modal) return;
    modal.style.display = 'block';
    // take snapshot for discard checks
    originalCatalogSnapshot = currentCatalogLocal ? JSON.parse(JSON.stringify(currentCatalogLocal)) : null;
    isDirty = false;
    renderCatalogModal();
    // Sync initial collapsed state from global toolbar flag
    try {
        const collapsedFlag = document.documentElement.dataset.productsCollapsed;
        if (collapsedFlag === 'false') {
            document.querySelectorAll('.catalog-product-entry').forEach(entry => { entry.classList.remove('collapsed'); const btn = entry.querySelector('.toggle-details-btn'); if (btn) btn.textContent = '−'; });
        } else if (collapsedFlag === 'true') {
            document.querySelectorAll('.catalog-product-entry').forEach(entry => { entry.classList.add('collapsed'); const btn = entry.querySelector('.toggle-details-btn'); if (btn) btn.textContent = '+'; });
        }
    } catch (err) {}
}

export function closeCatalogModal() {
    const modal = document.getElementById('catalogModal');
    if (!modal) return;
    if (isDirty) {
        // Ask user what to do: save, discard, or cancel
        const saveFirst = confirm('Sauvegarder les modifications du catalogue ? OK = Sauvegarder et fermer, Annuler = Ne pas sauvegarder.');
        if (saveFirst) {
            signalCatalogUpdate();
            modal.style.display = 'none';
            resetDirty();
            return;
        } else {
            const discard = confirm('Ignorer les modifications et fermer sans sauvegarder ? OK = Ignorer et fermer, Annuler = Annuler.');
            if (discard) {
                // restore snapshot
                currentCatalogLocal = originalCatalogSnapshot ? JSON.parse(JSON.stringify(originalCatalogSnapshot)) : null;
                document.dispatchEvent(new CustomEvent('catalog-data-updated', { detail: { catalog: currentCatalogLocal } }));
                modal.style.display = 'none';
                resetDirty();
                return;
            } else {
                // cancel close
                return;
            }
        }
    }
    modal.style.display = 'none';
}

function renderCatalogModal() {
    const modal = document.getElementById('catalogModal');
    if (!modal) return;
    const metaForm = modal.querySelector('#catalogMetaForm');
    const pagesContainer = modal.querySelector('#catalogPagesContainer');

    // Reset
    metaForm.innerHTML = '';
    pagesContainer.innerHTML = '';

    // If no catalog defined, initialize minimal structure
    if (!currentCatalogLocal) {
        currentCatalogLocal = {
            type: 'catalog',
            dossier: '/catalog',
            name: 'catalog_{label}.pdf',
            pdf_template: '',
            color_offset_x: 0,
            color_offset_y: 0,
            qrcode_width: 50,
            qrcode_height: 50,
            pages: []
        };
    }

    // Meta fields
    const metaFields = [
        { key: 'name', label: 'Nom fichier (template)', type: 'text' },
        { key: 'dossier', label: 'Dossier', type: 'text' },
        { key: 'pdf_template', label: 'Template PDF', type: 'text' },
        { key: 'color_offset_x', label: 'Color Offset X', type: 'number' },
        { key: 'color_offset_y', label: 'Color Offset Y', type: 'number' },
        { key: 'qrcode_width', label: 'QRCODE Width', type: 'number' },
        { key: 'qrcode_height', label: 'QRCODE Height', type: 'number' }
    ];

    metaFields.forEach(f => {
        const wrapper = document.createElement('div');
        wrapper.className = 'form-group';
        const label = document.createElement('label');
        label.textContent = f.label;
        const input = document.createElement('input');
        input.type = f.type;
        input.value = currentCatalogLocal[f.key] !== undefined ? currentCatalogLocal[f.key] : '';
        input.dataset.key = f.key;
        input.addEventListener('input', (e) => { currentCatalogLocal[f.key] = (e.target.type === 'number') ? parseFloat(e.target.value || 0) : e.target.value; markDirty(); });
        wrapper.appendChild(label);
        wrapper.appendChild(input);
        metaForm.appendChild(wrapper);
    });

    // Pages
    currentCatalogLocal.pages = currentCatalogLocal.pages || [];
    currentCatalogLocal.pages.forEach((page, pageIndex) => {
        pagesContainer.appendChild(createPageElement(page, pageIndex));
    });

    // Controls
    const controls = modal.querySelector('#catalogControls');
    controls.querySelector('#addPageBtn').onclick = () => {
        currentCatalogLocal.pages.push({ _comment: `page ${currentCatalogLocal.pages.length + 1}`, products: [] });
        pagesContainer.appendChild(createPageElement(currentCatalogLocal.pages[currentCatalogLocal.pages.length - 1], currentCatalogLocal.pages.length - 1));
        markDirty();
    };

    controls.querySelector('#saveCatalogBtn').onclick = () => {
        signalCatalogUpdate();
        modal.style.display = 'none';
        resetDirty();
    };

    controls.querySelector('#closeCatalogBtn').onclick = () => {
        closeCatalogModal();
    };

    // Save & Close button bottom-right
    let footer = modal.querySelector('.catalog-footer');
    if (!footer) {
        footer = document.createElement('div'); footer.className = 'catalog-footer';
        const saveAndClose = document.createElement('button'); saveAndClose.id = 'saveAndCloseCatalogBtn'; saveAndClose.className = 'btn primary'; saveAndClose.textContent = 'Sauvegarder et fermer';
        saveAndClose.addEventListener('click', () => {
            signalCatalogUpdate();
            modal.style.display = 'none';
            resetDirty();
        });
        footer.appendChild(saveAndClose);
        modal.querySelector('.modal-content').appendChild(footer);
    }
}

function createPageElement(page, pageIndex) {
    const pageDiv = document.createElement('div');
    pageDiv.className = 'catalog-page-entry';
    const header = document.createElement('div');
    header.className = 'catalog-page-header';
    header.innerHTML = `<strong>Page ${pageIndex + 1}</strong> <button type="button" class="remove-page-btn">Supprimer</button>`;
    pageDiv.appendChild(header);

    const commentInput = document.createElement('input');
    commentInput.type = 'text';
    commentInput.value = page._comment || '';
    commentInput.placeholder = 'Commentaire page';
    commentInput.addEventListener('input', () => {
        page._comment = commentInput.value;
        markDirty();
    });
    pageDiv.appendChild(commentInput);

    const productsList = document.createElement('div');
    productsList.className = 'catalog-products-list';

    (page.products || []).forEach((p, idx) => {
        productsList.appendChild(createProductEntryElement(p, page, idx));
    });

    const addProductBtn = document.createElement('button');
    addProductBtn.type = 'button';
    addProductBtn.textContent = 'Ajouter un produit à la page';
    addProductBtn.addEventListener('click', () => {
        const newProd = { product: '', x: 0, y: 0, width: 100, height: 100 };
        page.products = page.products || [];
        page.products.push(newProd);
        productsList.appendChild(createProductEntryElement(newProd, page, page.products.length - 1));
        markDirty();
    });

    pageDiv.appendChild(productsList);
    pageDiv.appendChild(addProductBtn);

    header.querySelector('.remove-page-btn').addEventListener('click', () => {
        if (!confirm('Supprimer cette page ?')) return;
        const parent = pageDiv.parentElement;
        parent.removeChild(pageDiv);
        // remove page from catalog
        currentCatalogLocal.pages.splice(pageIndex, 1);
        markDirty();
        // re-render modal to update page indices
        renderCatalogModal();
    });

    return pageDiv;
}

function createProductEntryElement(prod, pageRef, idx) {
    const entry = document.createElement('div');
    entry.className = 'catalog-product-entry';

    // Add collapsible header for the product entry
    const entryHeader = document.createElement('div');
    entryHeader.className = 'catalog-product-entry-header';
    const headerTitle = document.createElement('span');
    headerTitle.textContent = prod.product || '(produit non sélectionné)';
    headerTitle.className = 'catalog-entry-title';
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'toggle-details-btn';
    toggleBtn.textContent = '+'; // collapsed by default
    entryHeader.appendChild(headerTitle);
    entryHeader.appendChild(toggleBtn);
    entry.appendChild(entryHeader);

    // create row containers
    const row1 = document.createElement('div'); row1.className = 'row row-product-variant';
    const row2 = document.createElement('div'); row2.className = 'row row-xy';
    const row3 = document.createElement('div'); row3.className = 'row row-size-pic';
    const row4 = document.createElement('div'); row4.className = 'row row-other';

    // Helper to refresh header title when product changes
    function refreshHeaderTitle() {
        headerTitle.textContent = prod.product || '(produit non sélectionné)';
    }

    // Product select populated from currentConfigLocal keys (exclude catalog & aliases)
    const productSelect = document.createElement('select');
    const emptyOpt = document.createElement('option'); emptyOpt.value = '';
    emptyOpt.textContent = '-- Sélectionner un produit --';
    productSelect.appendChild(emptyOpt);
    for (const k in currentConfigLocal) {
        if (!Object.hasOwnProperty.call(currentConfigLocal, k)) continue;
        if (k === 'catalog') continue;
        const item = currentConfigLocal[k];
        if (!item || item.type === 'alias') continue;
        const opt = document.createElement('option'); opt.value = k; opt.textContent = item.name || k; productSelect.appendChild(opt);
    }
    productSelect.value = prod.product || '';
    productSelect.addEventListener('change', () => {
        prod.product = productSelect.value;
        refreshVariantSelector();
        refreshHeaderTitle();
        markDirty();
    });

    // Variant selector (optional) - will be inserted AFTER productSelect
    let variantSelect = null;
    let commentedChk = null;
    function refreshVariantSelector() {
        // remove previous if present
        if (variantSelect && variantSelect.parentElement) variantSelect.parentElement.removeChild(variantSelect);
        if (commentedChk && commentedChk.parentElement) commentedChk.parentElement.removeChild(commentedChk);

        variantSelect = document.createElement('select');
        variantSelect.className = 'catalog-variant-select';
        const selEmpty = document.createElement('option'); selEmpty.value = ''; selEmpty.textContent = '-- Variant (optionnel) --';
        variantSelect.appendChild(selEmpty);

        const prodKey = prod.product;
        if (prodKey && currentConfigLocal && currentConfigLocal[prodKey] && currentConfigLocal[prodKey].variant && typeof currentConfigLocal[prodKey].variant === 'object') {
            Object.keys(currentConfigLocal[prodKey].variant).forEach(vk => {
                const o = document.createElement('option'); o.value = vk; o.textContent = vk; variantSelect.appendChild(o);
            });

            // Determine initial variant value and commented state from prod (prefer 'variant' over '_variant')
            let initialVariant = '';
            let isCommented = false;
            if (Object.prototype.hasOwnProperty.call(prod, 'variant')) {
                initialVariant = prod.variant || '';
                isCommented = false;
            } else if (Object.prototype.hasOwnProperty.call(prod, '_variant')) {
                const raw = (prod._variant || '').toString();
                // If the property name is '_variant' that indicates the variant is commented
                isCommented = true;
                // value may or may not include leading underscores; strip them for display
                initialVariant = raw.replace(/^_+/, '');
            }

            // Ensure option exists for initial value
            if (initialVariant && !Array.from(variantSelect.options).some(o => o.value === initialVariant)) {
                const opt = document.createElement('option'); opt.value = initialVariant; opt.text = initialVariant; variantSelect.appendChild(opt);
            }

            variantSelect.value = initialVariant || '';

            variantSelect.addEventListener('change', () => {
                const val = variantSelect.value || '';
                // write to prod using commented checkbox state
                if (commentedChk && commentedChk.checked) {
                    if (val) prod._variant = '_' + val; else { delete prod._variant; }
                    delete prod.variant;
                } else {
                    if (val) prod.variant = val; else { delete prod.variant; }
                    delete prod._variant;
                }
                markDirty();
            });

            // commented checkbox with visible label 'commenté'
            commentedChk = document.createElement('input'); commentedChk.type = 'checkbox'; commentedChk.className = 'commented-checkbox';
            commentedChk.checked = !!isCommented;
            commentedChk.addEventListener('change', () => {
                const currentVal = variantSelect.value || '';
                if (!currentVal) return;
                if (commentedChk.checked) {
                    prod._variant = '_' + currentVal;
                    delete prod.variant;
                } else {
                    prod.variant = currentVal;
                    delete prod._variant;
                }
                markDirty();
            });

            // place productSelect and variantSelect side by side (row1)
            row1.innerHTML = '';
            const prodWrapper = createLabeledInput('Produit', productSelect);
            const varWrapper = createLabeledInput('Variant', variantSelect);
            const chkWrapper = createLabeledInput('commenté', commentedChk);
            prodWrapper.classList.add('flex-item');
            varWrapper.classList.add('flex-item');
            chkWrapper.classList.add('flex-item');
            row1.appendChild(prodWrapper);
            row1.appendChild(varWrapper);
            row1.appendChild(chkWrapper);
        } else {
            // no variants, only product select
            row1.innerHTML = '';
            const prodWrapper = createLabeledInput('Produit', productSelect);
            prodWrapper.classList.add('flex-item-full');
            row1.appendChild(prodWrapper);
        }
    }
    refreshVariantSelector();

    // X/Y pair (row2)
    const xInput = document.createElement('input'); xInput.type = 'number'; xInput.value = prod.x || 0; xInput.dataset.key = 'x'; xInput.addEventListener('input', () => { prod.x = parseFloat(xInput.value || 0); markDirty(); });
    const yInput = document.createElement('input'); yInput.type = 'number'; yInput.value = prod.y || 0; yInput.dataset.key = 'y'; yInput.addEventListener('input', () => { prod.y = parseFloat(yInput.value || 0); markDirty(); });
    row2.appendChild(createLabeledInput('X', xInput));
    row2.appendChild(createLabeledInput('Y', yInput));

    // Width/Height/Picture (row3) - add wrapper classes for CSS sizing
    const wInput = document.createElement('input'); wInput.type = 'number'; wInput.value = prod.width || 100; wInput.addEventListener('input', () => { prod.width = parseFloat(wInput.value || 0); markDirty(); });
    const hInput = document.createElement('input'); hInput.type = 'number'; hInput.value = prod.height || 100; hInput.addEventListener('input', () => { prod.height = parseFloat(hInput.value || 0); markDirty(); });
    const picInput = document.createElement('input'); picInput.type = 'text'; picInput.placeholder = 'picture_catalog (optional)'; picInput.value = prod.picture_catalog || '';
    picInput.addEventListener('input', () => { prod.picture_catalog = picInput.value; markDirty(); });
    const wWrap = createLabeledInput('Width', wInput); wWrap.classList.add('small-field');
    const hWrap = createLabeledInput('Height', hInput); hWrap.classList.add('small-field');
    const picWrap = createLabeledInput('Picture', picInput); picWrap.classList.add('picture-field');
    row3.appendChild(wWrap);
    row3.appendChild(hWrap);
    row3.appendChild(picWrap);

    // Other fields (group _x/_y pairs) (row4)
    // We must strictly enforce ordering: first all paired *_x/_y groups side-by-side, then remaining single keys beneath.
    row4.innerHTML = '';
    const handledKeys = new Set(['product', '_variant', 'variant', 'x', 'y', 'width', 'height', 'picture_catalog']);

    // Collect keys and detect pairs deterministically
    const allKeys = Object.keys(prod || {});
    const pairBases = [];
    const singles = [];
    const pairedSeen = new Set();

    allKeys.forEach(k => {
        if (handledKeys.has(k) || k.startsWith('_')) return; // skip commented/handled
        if (k.endsWith('_x')) {
            const base = k.slice(0, -2);
            const ky = base + '_y';
            if (prod.hasOwnProperty(ky)) {
                pairBases.push(base);
                pairedSeen.add(k);
                pairedSeen.add(ky);
                return;
            }
        }
        // skip _y if it was part of pair (we'll handle via pairBases)
        if (k.endsWith('_y')) {
            const base = k.slice(0, -2);
            const kx = base + '_x';
            if (prod.hasOwnProperty(kx)) return; // will be handled
        }
        // otherwise treat as single
        if (!pairedSeen.has(k)) singles.push(k);
    });

    // Create pair groups first (each base produces two inputs side-by-side)
    pairBases.forEach(base => {
        const kx = base + '_x';
        const ky = base + '_y';
        const ix = document.createElement('input'); ix.type = 'number'; ix.value = prod[kx] || 0; ix.addEventListener('input', () => { prod[kx] = parseFloat(ix.value || 0); markDirty(); });
        const iy = document.createElement('input'); iy.type = 'number'; iy.value = prod[ky] || 0; iy.addEventListener('input', () => { prod[ky] = parseFloat(iy.value || 0); markDirty(); });
        const groupWrapper = document.createElement('div'); groupWrapper.className = 'pair-group';
        // left and right labeled inputs
        const left = createLabeledInput(base + ' X', ix); left.classList.add('flex-item');
        const right = createLabeledInput(base + ' Y', iy); right.classList.add('flex-item');
        groupWrapper.appendChild(left);
        groupWrapper.appendChild(right);
        row4.appendChild(groupWrapper);
    });

    // Then create single-key inputs, each on its own labeled row under pairs
    singles.forEach(k => {
        const inp = document.createElement('input'); inp.type = 'text'; inp.value = prod[k] || '';
        inp.addEventListener('input', () => { prod[k] = inp.value; markDirty(); });
        const wrapper = createLabeledInput(k, inp);
        // add delete button for custom fields
        const delBtn = document.createElement('button'); delBtn.type = 'button'; delBtn.className = 'delete-field-btn'; delBtn.textContent = '✖';
        delBtn.addEventListener('click', () => {
            if (!confirm(`Supprimer le champ "${k}" ?`)) return;
            delete prod[k];
            wrapper.remove();
            markDirty();
        });
        wrapper.appendChild(delBtn);
        // place single fields under pairs for clear ordering
        row4.appendChild(wrapper);
    });

    // Button to add custom field
    const addFieldBtn = document.createElement('button');
    addFieldBtn.type = 'button';
    addFieldBtn.className = 'btn small add-field-btn always-visible';
    addFieldBtn.textContent = 'Ajouter champ';

    // Create inline field adder to avoid prompt() (some environments disable window.prompt)
    addFieldBtn.addEventListener('click', () => {
        // If entry is collapsed, expand it first so the inline form is visible
        if (entry.classList.contains('collapsed')) {
            entry.classList.remove('collapsed');
            toggleBtn.textContent = '−';
        }
        // If an inline form already exists, focus it
        if (row4.querySelector('.inline-add-field')) {
            row4.querySelector('.inline-add-field input').focus();
            return;
        }
        const inline = document.createElement('div'); inline.className = 'inline-add-field';
        const keyInput = document.createElement('input'); keyInput.type = 'text'; keyInput.placeholder = 'Nom de la clé (ex: custom_label)';
        const okBtn = document.createElement('button'); okBtn.type = 'button'; okBtn.className = 'btn'; okBtn.textContent = 'OK';
        const cancelBtn = document.createElement('button'); cancelBtn.type = 'button'; cancelBtn.className = 'btn'; cancelBtn.textContent = 'Annuler';
        inline.appendChild(keyInput); inline.appendChild(okBtn); inline.appendChild(cancelBtn);
        row4.appendChild(inline);
        keyInput.focus();

        okBtn.addEventListener('click', () => {
            const key = (keyInput.value || '').trim();
            if (!key) { alert('Nom de clé vide'); keyInput.focus(); return; }
            if (prod.hasOwnProperty(key)) { alert('La clé existe déjà pour cet élément.'); keyInput.focus(); return; }
            // initialize field in model
            prod[key] = '';
            // create input and append to row4 (under pairs)
            const newInput = document.createElement('input'); newInput.type = 'text'; newInput.value = '';
            newInput.addEventListener('input', () => { prod[key] = newInput.value; markDirty(); });
            const newWrapper = createLabeledInput(key, newInput);
            const delBtn = document.createElement('button'); delBtn.type = 'button'; delBtn.className = 'delete-field-btn'; delBtn.textContent = '✖';
            delBtn.addEventListener('click', () => { if (!confirm(`Supprimer le champ "${key}" ?`)) return; delete prod[key]; newWrapper.remove(); markDirty(); });
            newWrapper.appendChild(delBtn);
            row4.appendChild(newWrapper);
            inline.remove();
            markDirty();
        });
        cancelBtn.addEventListener('click', () => { inline.remove(); });
    });

    const removeBtn = document.createElement('button'); removeBtn.type = 'button'; removeBtn.textContent = 'Supprimer'; removeBtn.addEventListener('click', () => {
        if (!confirm('Supprimer cet élément produit ?')) return;
        const idxLocal = pageRef.products.indexOf(prod);
        if (idxLocal !== -1) pageRef.products.splice(idxLocal, 1);
        entry.remove();
        markDirty();
    });

    // Toggle details visibility
    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const collapsed = entry.classList.toggle('collapsed');
        toggleBtn.textContent = collapsed ? '+' : '−';
        // Explicitly hide/show children to ensure CSS applies
        if (collapsed) {
            entry.querySelectorAll('.row, .inline-add-field, .pair-group, .picture-field, .delete-field-btn, button:not(.toggle-details-btn)').forEach(n => { n.style.display = 'none'; });
            console.log('[Catalog] entry collapsed', prod.product || '(no product)');
        } else {
            entry.querySelectorAll('.row, .inline-add-field, .pair-group, .picture-field, .delete-field-btn, button:not(.toggle-details-btn)').forEach(n => { n.style.display = ''; });
            console.log('[Catalog] entry expanded', prod.product || '(no product)');
        }
    });

    // Initialize collapsed state to true to keep UI compact
    entry.classList.add('collapsed');

    entry.appendChild(row1);
    entry.appendChild(row2);
    entry.appendChild(row3);
    entry.appendChild(row4);
    entry.appendChild(addFieldBtn);
    entry.appendChild(removeBtn);
    return entry;
}

function createLabeledInput(labelText, inputEl) {
    const wrapper = document.createElement('div');
    wrapper.className = 'labeled-input';
    const lbl = document.createElement('label'); lbl.textContent = labelText; lbl.className = 'mini-label';
    wrapper.appendChild(lbl);
    wrapper.appendChild(inputEl);
    return wrapper;
}

function onCatalogMetaChange(e) {
    const key = e.target.dataset.key;
    let val = e.target.value;
    if (e.target.type === 'number') val = parseFloat(val || 0);
    currentCatalogLocal[key] = val;
    signalCatalogUpdate();
}

function signalCatalogUpdate() {
    // Clean simple structure
    const cleaned = currentCatalogLocal;
    currentCatalogLocal = cleaned;
    isDirty = true;
    document.dispatchEvent(new CustomEvent('catalog-data-updated', { detail: { catalog: currentCatalogLocal } }));
}

// Helper: validate that paired X/Y fields are numbers and present
export function validateCatalogStructure(catalog) {
    if (!catalog) return false;
    if (!Array.isArray(catalog.pages)) return false;
    for (const page of catalog.pages) {
        if (!page.products) continue;
        for (const prod of page.products) {
            if (typeof prod.x !== 'number' || typeof prod.y !== 'number') return false;
        }
    }
    return true;
}

// Expose some helpers
export default {
    initializeCatalogElements,
    openCatalogModal,
    closeCatalogModal,
    updateCatalogData,
    updateConfigData,
    validateCatalogStructure
};
