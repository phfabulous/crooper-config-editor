// src/renderer/utils.js

export function showError(element, message) {
    element.textContent = message;
    element.style.display = 'block';
}

export function hideError(element) {
    element.textContent = '';
    element.style.display = 'none';
}

// Corrected cleanObject: only delete undefined or null. Explicitly preserve empty strings and empty arrays.
export function cleanObject(obj) {
    if (typeof obj !== 'object' || obj === null) {
        // Return primitive values as is, including empty strings
        return obj;
    }

    if (Array.isArray(obj)) {
        const cleanedArray = [];
        for (const item of obj) {
            const cleanedItem = cleanObject(item);
            // Only add if the cleaned item is not strictly undefined.
            // This means null, "", 0, {}, [] will be added.
            if (cleanedItem !== undefined) {
                cleanedArray.push(cleanedItem);
            }
        }
        // Return the array, even if empty, as [] is a valid state
        return cleanedArray;
    }

    const cleanedObj = {};
    for (const prop in obj) {
        if (Object.hasOwnProperty.call(obj, prop)) {
            const value = obj[prop];

            // Recursively clean nested objects/arrays
            if (typeof value === 'object' && value !== null) {
                const cleanedValue = cleanObject(value);
                // Keep the property if the cleaned nested object/array is not undefined.
                // This will preserve empty objects {} and empty arrays []
                if (cleanedValue !== undefined) {
                    cleanedObj[prop] = cleanedValue;
                }
            } else if (value !== undefined && value !== null) {
                // Keep non-null/non-undefined values.
                // This explicitly includes empty strings "", numbers 0, false.
                cleanedObj[prop] = value;
            }
            // If value is undefined or null, it's implicitly skipped (deleted) from cleanedObj.
        }
    }

    // After cleaning, if the object is empty, return an empty object {} instead of undefined.
    // This ensures that empty objects are preserved at their level.
    // If a parent's cleanObject call gets an {} it will keep it.
    // If it gets undefined, it will remove the property.
    return Object.keys(cleanedObj).length === 0 ? {} : cleanedObj;
}


export function findDuplicates(keys) {
    const counts = {};
    keys.forEach(key => {
        counts[key] = (counts[key] || 0) + 1;
    });
    return keys.filter(key => counts[key] > 1);
}

// Drag and Drop Helper: Get element to insert after
export function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.product-card:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: -Infinity }).element;
}