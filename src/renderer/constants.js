// src/renderer/constants.js

export const TEMPLATES_FILE_NAME = 'product_templates.json';
export const FIELDS_CONFIG_FILE_NAME = 'fields_config.json';

export const PREDEFINED_VALUES = {
    colors: [
        { value: 'white', label: 'blanc' },
        { value: 'black', label: 'noir' },
        { value: 'red', label: 'rouge' },
        { value: 'blue', label: 'bleu' },
        { value: 'grey', label: 'gris' },
        { value: 'pink', label: 'rose' }
    ],
    sizes: ['XS', 'S', 'M', 'L', 'XL']
};

// Nouvelle constante pour les variables du Crooper
export const CROOPER_VARIABLES = [
    '{label}',
    '{color}',
    '{color_FR}',
    '{size}',
    '{product}',
    '{category}',
    '{genre}',
    '{prefix}',
    '{sku}', // SKU du variant si pertinent
    '{parentSku}', // SKU du parent si pertinent
    // Ajoutez ici d'autres variables qui pourraient être nécessaires
];

export const KNOWN_FIELDS_CONFIG = {
    "tshirt": {
        "displayOrder": [
            "name", "type", "prefix", "category", "genre", "product", "alias",
            "ERPCategory", "price", "weight",
            "amazon.Title_FR", "amazon.DesCourtes",
            "picture_catalog", "picture_main", // Autres exemples de champs d'image
            "aspect", "densite", "dimentions", "sizeImpression"
        ],
        "fields": {
            "name": { "type": "text", "label": "Product Key / Name", "required": true },
            "type": { "type": "select", "label": "Type de Produit", "options": ["alias", "simple", "parent"], "required": true },
            "prefix": { "type": "text", "label": "Prefix SKU", "required": true },
            "category": { "type": "text", "label": "Category" },
            "genre": { "type": "text", "label": "Genre" },
            "product": { "type": "text", "label": "Product" },
            "alias": { "type": "text", "label": "Alias Reference" },
            "ERPCategory": { "type": "text", "label": "ERP Category" },
            "price": { "type": "number", "label": "Price" },
            "weight": { "type": "number", "label": "Weight (g)" },
            "amazon.Title_FR": { "type": "text", "label": "Amazon Title (FR)" },
            "amazon.DesCourtes": { "type": "textarea", "label": "Amazon Short Description (FR)" },
            // Définition des champs d'image comme type 'text' pour l'instant
            "picture_catalog": { "type": "text", "label": "Picture Catalog" },
            "picture_main": { "type": "text", "label": "Picture Main" },
            "aspect": { "type": "text", "label": "Aspect Ratio" },
            "densite": { "type": "text", "label": "Density" },
            "dimentions": { "type": "text", "label": "Dimensions" },
            "sizeImpression": { "type": "text", "label": "Impression Size (WxH)" }
        }
    },
    "sweat": {
        "displayOrder": [
            "name", "type", "prefix", "category", "genre", "product", "alias",
            "ERPCategory", "price", "weight",
            "amazon.Title_FR", "amazon.DesCourtes"
                ],
        "fields": {
            "name": { "type": "text", "label": "Product Key / Name", "required": true },
            "type": { "type": "select", "label": "Type de Produit", "options": ["alias", "simple", "parent"], "required": true },
            "prefix": { "type": "text", "label": "Prefix SKU", "required": true },
            "category": { "type": "text", "label": "Category" },
            "genre": { "type": "text", "label": "Genre" },
            "product": { "type": "text", "label": "Product" },
            "alias": { "type": "text", "label": "Alias Reference" },
            "ERPCategory": { "type": "text", "label": "ERP Category" },
            "price": { "type": "number", "label": "Price" },
            "weight": { "type": "number", "label": "Weight (g)" },
            "amazon.Title_FR": { "type": "text", "label": "Amazon Title (FR)" },
            "amazon.DesCourtes": { "type": "textarea", "label": "Amazon Short Description (FR)" }
        }
    },
    // Vous pourriez ajouter une configuration "image_url" ou "common_image_fields" ici
    // si vous voulez que les champs d'URL d'image aient un traitement spécifique
    // ou si vous voulez qu'ils aient des propriétés communes définies par défaut.
    // Pour l'instant, ils sont définis comme des champs 'text' ordinaires.
};

export const FIELD_CONDITIONS = {
    isNotAlias: (p) => p.type !== 'alias',
    isAlias: (p) => p.type === 'alias',
};