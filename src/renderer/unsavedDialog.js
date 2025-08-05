export let elements;
let resolveChoice = null;

export function initializeUnsavedDialogElements(domElements) {
    elements = domElements;
    if (!elements.unsavedChangesModal) {
        console.warn('[UnsavedDialog] Modal elements missing');
        return;
    }
    elements.unsavedSaveBtn.addEventListener('click', () => handleChoice('save'));
    elements.unsavedDiscardBtn.addEventListener('click', () => handleChoice('discard'));
    elements.unsavedCancelBtn.addEventListener('click', () => handleChoice('cancel'));
}

function handleChoice(choice) {
    if (elements.unsavedChangesModal) {
        elements.unsavedChangesModal.style.display = 'none';
    }
    if (resolveChoice) {
        resolveChoice(choice);
        resolveChoice = null;
    }
}

export function openUnsavedDialog() {
    return new Promise((resolve) => {
        resolveChoice = resolve;
        if (elements && elements.unsavedChangesModal) {
            elements.unsavedChangesModal.style.display = 'block';
        } else {
            resolve('cancel');
        }
    });
}