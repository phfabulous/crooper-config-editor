// main.js
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { parse } = require('csv-parse');
const { stringify } = require('csv-stringify');

let mainWindow;
let currentConfig = {};
let currentConfigFilePath = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');

  // Open the DevTools.
  // mainWindow.webContents.openDevTools(); // Uncomment for debugging in dev tools
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handler to load a configuration file
ipcMain.handle('load-config', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'JSON Files', extensions: ['json'] }]
  });

  if (canceled) {
    console.log("[Main Process] Load config canceled by user.");
    return null;
  }

  const filePath = filePaths[0];
  console.log(`[Main Process] Attempting to load config from: ${filePath}`);
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const parsedData = JSON.parse(fileContent);
    console.log("[Main Process] Config loaded successfully:", parsedData);
    return { data: parsedData, filePath: filePath };
  } catch (error) {
    console.error(`[Main Process] Failed to load configuration file ${filePath}:`, error);
    dialog.showErrorBox('Error', 'Failed to load configuration file: ' + error.message + '\nPath: ' + filePath);
    return null;
  }
});

// Helper function to move mockups from products to their alias
function moveMockupsToAlias(configData) {
  const processedConfig = JSON.parse(JSON.stringify(configData)); // Deep copy
  
  // Iterate through all products to find those with alias property
  for (const productKey in processedConfig) {
    const product = processedConfig[productKey];
    
    // If product has an alias and mockups, move mockups to the alias
    if (product.alias && product.mockups && Array.isArray(product.mockups) && product.mockups.length > 0) {
      const aliasKey = product.alias;
      
      // Check if the alias exists in the config
      if (processedConfig[aliasKey] && processedConfig[aliasKey].type === 'alias') {
        console.log(`[Main Process] Moving mockups from product '${productKey}' to alias '${aliasKey}'`);
        
        // Move mockups to alias (merge if alias already has mockups)
        if (!processedConfig[aliasKey].mockups) {
          processedConfig[aliasKey].mockups = [];
        }
        
        // Add product mockups to alias mockups (avoid duplicates)
        product.mockups.forEach(mockup => {
          const exists = processedConfig[aliasKey].mockups.some(existing => 
            existing.path === mockup.path && existing.name === mockup.name
          );
          if (!exists) {
            processedConfig[aliasKey].mockups.push(mockup);
          }
        });
        
        // Remove mockups from the product
        delete processedConfig[productKey].mockups;
        
        console.log(`[Main Process] Mockups moved successfully. Alias '${aliasKey}' now has ${processedConfig[aliasKey].mockups.length} mockups`);
      } else {
        console.warn(`[Main Process] Warning: Product '${productKey}' references alias '${aliasKey}' but alias not found or not of type 'alias'`);
      }
    }
  }
  
  return processedConfig;
}

// IPC handler to save the current configuration
ipcMain.handle('save-config', async (event, configData, filePath) => {
  console.log(`[Main Process] Attempting to save config to: ${filePath}`);
  try {
    // Process the config data to move mockups to aliases before saving
    const processedConfigData = moveMockupsToAlias(configData);
    
    fs.writeFileSync(filePath, JSON.stringify(processedConfigData, null, 2), 'utf-8');
    console.log("[Main Process] Config saved successfully:", processedConfigData);
    return true;
  } catch (error) {
    console.error(`[Main Process] Failed to save configuration file ${filePath}:`, error);
    dialog.showErrorBox('Error', 'Failed to save configuration file: ' + error.message + '\nPath: ' + filePath);
    return false;
  }
});

// IPC handler to show save dialog (for 'Save As' and initial save)
ipcMain.handle('show-save-dialog', async () => {
    console.log("[Main Process] Showing save dialog.");
    const result = await dialog.showSaveDialog(mainWindow, {
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });
    console.log("[Main Process] Save dialog result:", result);
    return result;
});


// IPC handler to get the current configuration (useful for re-rendering or initial load)
ipcMain.handle('get-current-config', () => {
  console.log("[Main Process] Getting current config (should be empty initially).");
  return { data: currentConfig, filePath: currentConfigFilePath };
});


// IPC handler to load product templates from a default subfolder
ipcMain.handle('load-product-templates-from-file', async (event, fileName) => {
  const templatesFolder = path.join(app.getPath('userData'), 'product_templates');
  const fullPath = path.join(templatesFolder, fileName);
  console.log(`[Main Process] Templates: Attempting to load from: ${fullPath}`);

  try {
    if (!fs.existsSync(templatesFolder)) {
      fs.mkdirSync(templatesFolder, { recursive: true });
      console.log(`[Main Process] Templates: Created folder: ${templatesFolder}`);
    }

    if (fs.existsSync(fullPath)) {
      const fileContent = fs.readFileSync(fullPath, 'utf-8');
      const parsedContent = JSON.parse(fileContent);
      console.log(`[Main Process] Templates: Successfully loaded from file. Content:`, parsedContent);
      return parsedContent;
    }
    console.log(`[Main Process] Templates: File not found, returning empty object. Path: ${fullPath}`);
    return {};
  } catch (error) {
    console.error(`[Main Process] Templates: Failed to load from ${fullPath}:`, error);
    dialog.showErrorBox('Error loading templates', 'Failed to load product templates: ' + error.message + '\nPath: ' + fullPath);
    return {};
  }
});

// IPC handler to save product templates to a default subfolder
ipcMain.handle('save-product-templates-to-file', async (event, templatesData, fileName) => {
  const templatesFolder = path.join(app.getPath('userData'), 'product_templates');
  const fullPath = path.join(templatesFolder, fileName);
  console.log(`[Main Process] Templates: Attempting to save to: ${fullPath}`);
  console.log(`[Main Process] Templates: Data to save:`, templatesData);

  try {
    if (!fs.existsSync(templatesFolder)) {
      fs.mkdirSync(templatesFolder, { recursive: true });
      console.log(`[Main Process] Templates: Created folder: ${templatesFolder}`);
    }
    fs.writeFileSync(fullPath, JSON.stringify(templatesData, null, 2), 'utf-8');
    console.log(`[Main Process] Templates: Successfully saved data to file.`);
    return true;
  } catch (error) {
    console.error(`[Main Process] Templates: Failed to save to ${fullPath}:`, error);
    dialog.showErrorBox('Error saving templates', 'Failed to save product templates: ' + error.message + '\nPath: ' + fullPath);
    return false;
  }
});

// IPC handler to load known fields configuration from a default subfolder
ipcMain.handle('load-known-fields-config', async (event, fileName) => {
  const configFolder = path.join(app.getPath('userData'), 'field_configs');
  const fullPath = path.join(configFolder, fileName);
  console.log(`[Main Process] Fields Config: Attempting to load from: ${fullPath}`);

  try {
    if (!fs.existsSync(configFolder)) {
      fs.mkdirSync(configFolder, { recursive: true });
      console.log(`[Main Process] Fields Config: Created folder: ${configFolder}`);
    }

    if (fs.existsSync(fullPath)) {
      const fileContent = fs.readFileSync(fullPath, 'utf-8');
      const parsedContent = JSON.parse(fileContent);
      console.log(`[Main Process] Fields Config: Successfully loaded from file. Content:`, parsedContent);
      return parsedContent;
    }
    console.log(`[Main Process] Fields Config: File not found, returning empty object. Path: ${fullPath}`);
    return {}; 
  } catch (error) {
    console.error(`[Main Process] Fields Config: Failed to load from ${fullPath}:`, error);
    dialog.showErrorBox('Error loading fields config', 'Failed to load known fields configuration: ' + error.message + '\nPath: ' + fullPath);
    return {};
  }
});

// IPC handler to save known fields configuration to a default subfolder
ipcMain.handle('save-known-fields-config', async (event, fieldsData, fileName) => {
  const configFolder = path.join(app.getPath('userData'), 'field_configs');
  const fullPath = path.join(configFolder, fileName);
  console.log(`[Main Process] Fields Config: Attempting to save to: ${fullPath}`);
  console.log(`[Main Process] Fields Config: Data to save:`, fieldsData);

  try {
    if (!fs.existsSync(configFolder)) {
      fs.mkdirSync(configFolder, { recursive: true });
      console.log(`[Main Process] Fields Config: Created folder: ${configFolder}`);
    }
    fs.writeFileSync(fullPath, JSON.stringify(fieldsData, null, 2), 'utf-8');
    console.log(`[Main Process] Fields Config: Successfully saved data to file.`);
    return true;
  } catch (error) {
    console.error(`[Main Process] Fields Config: Failed to save to ${fullPath}:`, error);
    dialog.showErrorBox('Error saving fields config', 'Failed to save known fields configuration: ' + error.message + '\nPath: ' + fullPath);
    return false;
  }
});

// IPC handler pour l'importation CSV
ipcMain.handle('import-csv-data', async () => {
    console.log("[Main Process] Showing open dialog for CSV import.");
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: 'CSV Files', extensions: ['csv'] }]
    });

    if (canceled) {
        console.log("[Main Process] CSV import canceled by user.");
        return null;
    }

    const filePath = filePaths[0];
    console.log(`[Main Process] Attempting to read CSV from: ${filePath}`);
    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const records = await new Promise((resolve, reject) => {
            parse(fileContent, {
                columns: true,
                skip_empty_lines: true,
                trim: true
            }, (err, records) => {
                if (err) reject(err);
                else resolve(records);
            });
        });
        console.log("[Main Process] CSV data parsed successfully:", records);

        // Nouvelle logique : reconstruction parent/enfant avec héritage et override
        const configData = {};
        let lastParent = null;
        for (const row of records) {
            // Si la ligne a un nom et type, c'est un parent
            if (row.name && row.type) {
                lastParent = JSON.parse(JSON.stringify(row));
                // Préparer la structure variant si parent
                if (row.type === 'parent') {
                    lastParent.variant = {};
                }
                configData[row.name] = lastParent;
            } else if (lastParent) {
                // Ligne enfant : override sur variant(s) ciblés
                if (lastParent.type === 'parent') {
                    // Ciblage variant1/variant2
                    const v1val = row.variant1Values;
                    const v2val = row.variant2Values;
                    // On applique les overrides sur le(s) variant(s) ciblés
                    if (v1val && !v2val) {
                        // Override sur variant1
                        if (!lastParent.variant[v1val]) lastParent.variant[v1val] = {};
                        for (const key in row) {
                            if (row[key] !== '' && key !== 'variant1Values' && key !== 'variant2Values') {
                                lastParent.variant[v1val][key] = row[key];
                            }
                        }
                    } else if (v1val && v2val) {
                        // Override sur sous-variant
                        if (!lastParent.variant[v1val]) lastParent.variant[v1val] = {};
                        if (!lastParent.variant[v1val].variant) lastParent.variant[v1val].variant = {};
                        if (!lastParent.variant[v1val].variant[v2val]) lastParent.variant[v1val].variant[v2val] = {};
                        for (const key in row) {
                            if (row[key] !== '' && key !== 'variant1Values' && key !== 'variant2Values') {
                                lastParent.variant[v1val].variant[v2val][key] = row[key];
                            }
                        }
                    }
                }
        }
        // Retourne à la fois le format array (records) et le format objet (configData)
        return { data: records, configData };
    }
    } catch (error) {
        console.error(`[Main Process] Failed to import CSV file ${filePath}:`, error);
        dialog.showErrorBox('Error', 'Failed to import CSV file: ' + error.message + '\nPath: ' + filePath);
        return null;
    }
});


// Helper function to flatten a product object for CSV export
function flattenProduct(product, knownFieldsConfig) {
    const flatProduct = {};

    // Get all known fields from all types to ensure comprehensive headers
    const allKnownHeaders = new Set();
    for (const typeKey in knownFieldsConfig) {
        if (knownFieldsConfig[typeKey] && knownFieldsConfig[typeKey].fields) {
            for (const fieldKey in knownFieldsConfig[typeKey].fields) {
                // Exclude 'mockups' and 'variant' as they are flattened specially
                if (!fieldKey.startsWith('mockups') && !fieldKey.startsWith('variant')) {
                    allKnownHeaders.add(fieldKey);
                }
            }
        }
    }

    // Flatten the product object
    for (const key in product) {
        if (Object.hasOwnProperty.call(product, key)) {
            const value = product[key];

            // Special handling for CSV export
            if (key === 'mockups' && Array.isArray(value)) {
                value.forEach((mockup, index) => {
                    flatProduct[`mockups_path_${index}`] = mockup.path || '';
                    flatProduct[`mockups_name_${index}`] = mockup.name || '';
                });
            } else if (key === 'variant' && typeof value === 'object' && !Array.isArray(value) && product.type === 'parent') {
                // Flatten variants for 'parent' type products
                // This section will try to extract data for variant1Type/Values, variant2Type/Values
                let allPrimaryValues = new Set();
                let detectedVariant1Type = '';
                let allSecondaryValues = new Set();
                let detectedVariant2Type = '';

                // Analyser d'abord toute la structure pour identifier les vrais champs structurels
                const structuralFieldCandidates = new Map(); // fieldName -> Set of values
                
                Object.entries(value).forEach(([variantKey, primaryVariant]) => {
                    // Un champ est structurel si sa valeur correspond à la clé du variant
                    for(const k in primaryVariant) {
                        if (Object.hasOwnProperty.call(primaryVariant, k) && 
                            k !== 'type' && k !== 'variant' && 
                            primaryVariant[k] === variantKey) {
                            // C'est un champ structurel de niveau 1
                            if (!structuralFieldCandidates.has(k)) {
                                structuralFieldCandidates.set(k, new Set());
                            }
                            structuralFieldCandidates.get(k).add(primaryVariant[k]);
                        }
                        // Également vérifier les champs _FR associés
                        if (k.endsWith('_FR') && primaryVariant[k]) {
                            const baseField = k.replace('_FR', '');
                            if (primaryVariant[baseField] === variantKey) {
                                if (!structuralFieldCandidates.has(k)) {
                                    structuralFieldCandidates.set(k, new Set());
                                }
                                structuralFieldCandidates.get(k).add(primaryVariant[k]);
                            }
                        }
                    }
                    
                    // Analyser les sous-variants pour le niveau 2
                    if (primaryVariant.variant && typeof primaryVariant.variant === 'object') {
                        Object.entries(primaryVariant.variant).forEach(([subKey, subVariant]) => {
                            for(const sk in subVariant) {
                                if (Object.hasOwnProperty.call(subVariant, sk) && 
                                    sk !== 'type' && sk !== 'variant' && 
                                    subVariant[sk] === subKey) {
                                    // C'est un champ structurel de niveau 2
                                    if (!structuralFieldCandidates.has(sk)) {
                                        structuralFieldCandidates.set(sk, new Set());
                                    }
                                    structuralFieldCandidates.get(sk).add(subVariant[sk]);
                                }
                            }
                        });
                    }
                });

                // Maintenant identifier les types de variants corrects
                const structuralFields = Array.from(structuralFieldCandidates.keys())
                    .filter(field => !field.endsWith('_FR')); // Exclure les champs _FR du type principal
                
                if (structuralFields.length > 0) {
                    detectedVariant1Type = structuralFields[0];
                    allPrimaryValues = structuralFieldCandidates.get(detectedVariant1Type);
                }
                
                if (structuralFields.length > 1) {
                    detectedVariant2Type = structuralFields[1];
                    allSecondaryValues = structuralFieldCandidates.get(detectedVariant2Type);
                }

                // Export other direct properties of the primary variant
                Object.values(value).forEach(primaryVariant => {
                    for (const prop in primaryVariant) {
                        if (Object.hasOwnProperty.call(primaryVariant, prop) && 
                            prop !== 'variant' && prop !== 'type' && !prop.endsWith('_FR') && 
                            prop !== detectedVariant1Type && prop !== detectedVariant2Type) {
                            flatProduct[`variant_${prop}`] = primaryVariant[prop];
                        }
                    }
                });

                if (detectedVariant1Type) {
                    flatProduct['variant1Type'] = detectedVariant1Type;
                    flatProduct['variant1Values'] = [...allPrimaryValues].join(',');
                }
                if (detectedVariant2Type) {
                    flatProduct['variant2Type'] = detectedVariant2Type;
                    flatProduct['variant2Values'] = [...allSecondaryValues].join(',');
                }

            } else if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
                // Nested object, recurse into it
                const nestedFlat = flattenProduct(value, knownFieldsConfig);
                for (const nestedKey in nestedFlat) {
                    if (Object.hasOwnProperty.call(nestedFlat, nestedKey)) {
                        flatProduct[nestedKey] = nestedFlat[nestedKey];
                    }
                }
            } else {
                // Simple value, just add it
                flatProduct[key] = value;
            }
        }
    }

    // Ne pas forcer des valeurs vides pour tous les champs connus
    // Cette logique était problématique et écrasait les vraies valeurs
    // Les lignes parent gardent leurs valeurs, les lignes enfant sont gérées séparément
    
    return flatProduct;
}

// IPC handler pour exporter la configuration actuelle en CSV
ipcMain.handle('export-config-to-csv', async (event, configData, knownFieldsConfig) => {
    console.log("[Main Process] Initiating export config to CSV.");

    const defaultFileName = `crooper_config_export_${Date.now()}.csv`;
    const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultFileName,
        filters: [{ name: 'CSV Files', extensions: ['csv'] }]
    });

    if (result.canceled) {
        console.log("[Main Process] CSV export canceled by user.");
        return false;
    }

    const filePath = result.filePath;
    console.log(`[Main Process] Attempting to save config CSV to: ${filePath}`);

    // Nouvelle logique export CSV :
    // 1. Générer une ligne parent (toutes valeurs héritées)
    // 2. Générer une ligne enfant pour chaque variant avec données spécifiques
    const allProductsFlat = [];
    const allHeaders = new Set();
    allHeaders.add('name');
    allHeaders.add('type');

    for (const productKey in configData) {
        if (!Object.hasOwnProperty.call(configData, productKey)) continue;
        const product = configData[productKey];
        const flatParent = flattenProduct(product, knownFieldsConfig);
        // Les lignes parent gardent TOUTES leurs données - pas de modification
        allProductsFlat.push(flatParent);
        Object.keys(flatParent).forEach(header => allHeaders.add(header));

        // Si le produit a des variants enfants avec données spécifiques
        if (product.type === 'parent' && product.variant) {
            console.log("[Main Process] Export - Processing variants for product:", product.name);
            
            // Réutiliser la même logique de détection des champs structurels que dans flattenProduct
            const structuralFieldCandidates = new Map();
            
            // Identifier dynamiquement les champs de structure
            Object.entries(product.variant).forEach(([variantKey, primaryVariant]) => {
                // Un champ est structurel si sa valeur correspond à la clé du variant
                for(const k in primaryVariant) {
                    if (Object.hasOwnProperty.call(primaryVariant, k) && 
                        k !== 'type' && k !== 'variant' && 
                        primaryVariant[k] === variantKey) {
                        // C'est un champ structurel de niveau 1
                        if (!structuralFieldCandidates.has(k)) {
                            structuralFieldCandidates.set(k, new Set());
                        }
                        structuralFieldCandidates.get(k).add(primaryVariant[k]);
                    }
                    // Également vérifier les champs _FR associés
                    if (k.endsWith('_FR') && primaryVariant[k]) {
                        const baseField = k.replace('_FR', '');
                        if (primaryVariant[baseField] === variantKey) {
                            if (!structuralFieldCandidates.has(k)) {
                                structuralFieldCandidates.set(k, new Set());
                            }
                            structuralFieldCandidates.get(k).add(primaryVariant[k]);
                        }
                    }
                }
                
                // Analyser les sous-variants pour le niveau 2
                if (primaryVariant.variant && typeof primaryVariant.variant === 'object') {
                    Object.entries(primaryVariant.variant).forEach(([subKey, subVariant]) => {
                        for(const sk in subVariant) {
                            if (Object.hasOwnProperty.call(subVariant, sk) && 
                                sk !== 'type' && sk !== 'variant' && 
                                subVariant[sk] === subKey) {
                                // C'est un champ structurel de niveau 2
                                if (!structuralFieldCandidates.has(sk)) {
                                    structuralFieldCandidates.set(sk, new Set());
                                }
                                structuralFieldCandidates.get(sk).add(subVariant[sk]);
                            }
                        }
                    });
                }
            });

            // Créer l'ensemble des champs structurels détectés
            const structuralFields = new Set(['type', 'variant']);
            structuralFieldCandidates.forEach((values, fieldName) => {
                structuralFields.add(fieldName);
            });
            
            console.log("[Main Process] Export - Structural fields detected:", Array.from(structuralFields));
            
            // Collecter tous les variants uniques avec leurs champs spécifiques
            for (const variantKey in product.variant) {
                const variantObj = product.variant[variantKey];
                
                // Identifier les champs spécifiques (différents du parent et non structurels)
                const specificFields = {};
                for (const field in variantObj) {
                    // Exclure les champs structurels identifiés dynamiquement
                    if (!structuralFields.has(field) && 
                        variantObj[field] !== '' && variantObj[field] !== null && variantObj[field] !== undefined) {
                        
                        // Vérifier si la valeur diffère du parent (si le parent a cette propriété)
                        const parentValue = product[field];
                        if (parentValue === undefined || parentValue !== variantObj[field]) {
                            specificFields[field] = variantObj[field];
                        }
                    }
                }
                
                // Si on a des champs spécifiques différents du parent, créer une ligne enfant
                if (Object.keys(specificFields).length > 0) {
                    console.log("[Main Process] Export - Creating child line for variant:", variantKey, "with fields:", specificFields);
                    
                    const childLine = { ...flatParent };
                    
                    // Définir seulement les champs essentiels pour identifier les variants
                    const essentialFields = new Set([
                        'name', 'type', 'variant1Type', 'variant1Values', 'variant2Type', 'variant2Values'
                    ]);
                    
                    // Vider tous les champs sauf ceux spécifiques ET les champs d'identification des variants
                    for (const key in childLine) {
                        if (!(key in specificFields) && !essentialFields.has(key)) {
                            childLine[key] = '';
                        }
                    }
                    
                    // Remplir les champs spécifiques
                    Object.assign(childLine, specificFields);
                    
                    // Définir la valeur du variant principal
                    childLine['variant1Values'] = variantObj[flatParent['variant1Type']] || variantKey;
                    
                    allProductsFlat.push(childLine);
                    Object.keys(childLine).forEach(header => allHeaders.add(header));
                }
                
                // Traiter les sous-variants de niveau 2
                if (variantObj.variant) {
                    for (const subKey in variantObj.variant) {
                        const subObj = variantObj.variant[subKey];
                        const subSpecificFields = {};
                        
                        for (const subField in subObj) {
                            // Exclure les champs structurels identifiés dynamiquement
                            if (!structuralFields.has(subField) &&
                                subObj[subField] !== '' && subObj[subField] !== null && subObj[subField] !== undefined) {
                                
                                // Vérifier si diffère du parent ou du variant de niveau 1
                                const parentValue = product[subField];
                                const variant1Value = variantObj[subField];
                                
                                if ((parentValue === undefined || parentValue !== subObj[subField]) &&
                                    (variant1Value === undefined || variant1Value !== subObj[subField])) {
                                    subSpecificFields[subField] = subObj[subField];
                                }
                            }
                        }
                        
                        // Si on a des champs spécifiques pour ce sous-variant
                        if (Object.keys(subSpecificFields).length > 0) {
                            console.log("[Main Process] Export - Creating child line for sub-variant:", variantKey + ">" + subKey, "with fields:", subSpecificFields);
                            
                            const subChildLine = { ...flatParent };
                            
                            // Définir seulement les champs essentiels pour identifier les variants
                            const essentialFields = new Set([
                                'name', 'type', 'variant1Type', 'variant1Values', 'variant2Type', 'variant2Values'
                            ]);
                            
                            // Vider tous les champs sauf ceux spécifiques ET les champs d'identification des variants
                            for (const key in subChildLine) {
                                if (!(key in subSpecificFields) && !essentialFields.has(key)) {
                                    subChildLine[key] = '';
                                }
                            }
                            
                            // Remplir les champs spécifiques
                            Object.assign(subChildLine, subSpecificFields);
                            
                            // Définir les valeurs des variants
                            subChildLine['variant1Values'] = variantObj[flatParent['variant1Type']] || variantKey;
                            if (flatParent['variant2Type']) {
                                subChildLine['variant2Values'] = subObj[flatParent['variant2Type']] || subKey;
                            }
                            
                            allProductsFlat.push(subChildLine);
                            Object.keys(subChildLine).forEach(header => allHeaders.add(header));
                        }
                    }
                }
            }
        }
    }

    // Ajout des headers restants (mockups, variants, etc.)
    for (const type in knownFieldsConfig) {
        if (Object.hasOwnProperty.call(knownFieldsConfig, type) && knownFieldsConfig[type].fields) {
            for (const fieldKey in knownFieldsConfig[type].fields) {
                allHeaders.add(fieldKey);
            }
        }
    }
    // Mockups
    const maxMockups = allProductsFlat.reduce((max, prod) => {
        let currentMax = 0;
        for (let i = 0; ; i++) {
            if (prod[`mockups_path_${i}`] || prod[`mockups_name_${i}`]) {
                currentMax = i + 1;
            } else {
                break;
            }
        }
        return Math.max(max, currentMax);
    }, 0);
    for (let i = 0; i < maxMockups; i++) {
        allHeaders.add(`mockups_path_${i}`);
        allHeaders.add(`mockups_name_${i}`);
    }
    // Variants
    allHeaders.add('variant1Type');
    allHeaders.add('variant1Values');
    allHeaders.add('variant2Type');
    allHeaders.add('variant2Values');
    allProductsFlat.forEach(fp => {
        for (const key in fp) {
            if (key.startsWith('variant_') && !key.startsWith('variant1') && !key.startsWith('variant2')) {
                allHeaders.add(key);
            }
        }
    });
    const sortedHeaders = Array.from(allHeaders).sort((a, b) => {
        // Ordre spécifique des colonnes selon vos exigences
        const customOrder = [
            'name', 'type', 'prefix', 'price', 'product', 'sizeImpression', 'sku', 'alias', 
            'CompositeItem', 'parentSku', 'variant1Type', 'variant1Values', 'variant2Type', 'variant2Values',
            'weight', 'width', 'amazon.DesCourtes', 'amazon.title', 'amazon.Title_FR', 'aspect', 
            'category', 'densite', 'dimentions', 'dossier', 'ERPCategory', 'genre', 'height', 
            'label', 'length', 'picture_1', 'picture_2', 'picture_3', 'picture_4', 'picture_5', 
            'picture_6', 'picture_7', 'picture_8', 'mockups_name_0', 'mockups_path_0', 'psd'
        ];
        
        const indexA = customOrder.indexOf(a);
        const indexB = customOrder.indexOf(b);
        
        // Si les deux sont dans l'ordre personnalisé, utiliser cet ordre
        if (indexA !== -1 && indexB !== -1) {
            return indexA - indexB;
        }
        
        // Si seulement A est dans l'ordre personnalisé, A vient en premier
        if (indexA !== -1) return -1;
        
        // Si seulement B est dans l'ordre personnalisé, B vient en premier
        if (indexB !== -1) return 1;
        
        // Pour les mockups supplémentaires, les trier par index numérique
        const isAMockup = a.startsWith('mockups_');
        const isBMockup = b.startsWith('mockups_');
        if (isAMockup && isBMockup) {
            const matchA = a.match(/mockups_\w+_(\d+)/);
            const matchB = b.match(/mockups_\w+_(\d+)/);
            if (matchA && matchB) {
                const numA = parseInt(matchA[1]);
                const numB = parseInt(matchB[1]);
                if (numA !== numB) return numA - numB;
                return a.localeCompare(b); // path avant name pour le même index
            }
        }
        
        // Si aucun n'est dans l'ordre personnalisé, ordre alphabétique
        return a.localeCompare(b);
    });

    try {
        const csvString = await new Promise((resolve, reject) => {
            stringify(allProductsFlat, { 
                header: true, 
                columns: sortedHeaders,
                quoted: true // Force quoting for all fields to prevent issues with commas
            }, (err, output) => {
                if (err) reject(err);
                else resolve(output);
            });
        });
        fs.writeFileSync(filePath, csvString, 'utf-8');
        console.log("[Main Process] Config exported to CSV successfully.");
        return true;
    } catch (error) {
        console.error(`[Main Process] Failed to export config to CSV to ${filePath}:`, error);
        dialog.showErrorBox('Error', 'Failed to export configuration to CSV: ' + error.message + '\nPath: ' + filePath);
        return false;
    }
});


// IPC handler pour générer un template CSV (modifié pour être plus complet)
ipcMain.handle('generate-csv-template', async (event, knownFieldsConfig) => {
    console.log("[Main Process] Showing save dialog for CSV template.");

    const defaultFileName = `crooper_config_template_${Date.now()}.csv`;
    const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultFileName,
        filters: [{ name: 'CSV Files', extensions: ['csv'] }]
    });

    if (result.canceled) {
        console.log("[Main Process] CSV template save canceled by user.");
        return false;
    }

    const filePath = result.filePath;
    console.log(`[Main Process] Attempting to save CSV template to: ${filePath}`);

    // Collecter tous les en-têtes possibles à partir de KNOWN_FIELDS_CONFIG
    const allHeaders = new Set();
    allHeaders.add('name'); // Obligatoire
    allHeaders.add('type'); // Obligatoire

    for (const type in knownFieldsConfig) {
        if (Object.hasOwnProperty.call(knownFieldsConfig, type) && knownFieldsConfig[type].fields) {
            for (const fieldKey in knownFieldsConfig[type].fields) {
                // Ajouter tous les champs connus, sauf les cas spéciaux gérés par aplatissement
                if (!fieldKey.startsWith('mockups') && !fieldKey.startsWith('variant') && fieldKey !== 'name' && fieldKey !== 'type') {
                    allHeaders.add(fieldKey);
                }
            }
        }
    }
    
    // Ajouter des en-têtes pour les mockups (ex: jusqu'à 3 mockups pour le template)
    for (let i = 0; i < 3; i++) { // Permet 3 paires path/name par défaut dans le template
        allHeaders.add(`mockups_path_${i}`);
        allHeaders.add(`mockups_name_${i}`);
    }

    // Ajouter les en-têtes pour la génération de variantes
    allHeaders.add('variant1Type');
    allHeaders.add('variant1Values');
    allHeaders.add('variant2Type');
    allHeaders.add('variant2Values');
    
    // Tri des en-têtes pour un ordre cohérent et lisible
    const sortedHeaders = Array.from(allHeaders).sort((a, b) => {
        // Prioriser 'name' et 'type' au début
        if (a === 'name') return -1;
        if (b === 'name') return 1;
        if (a === 'type') return -1;
        if (b === 'type') return 1;

        // Puis les mockups ensemble
        const isAMockupPath = a.startsWith('mockups_path_');
        const isBMockupPath = b.startsWith('mockups_path_');
        const isAMockupName = a.startsWith('mockups_name_');
        const isBMockupName = b.startsWith('mockups_name_');

        if ((isAMockupPath || isAMockupName) && !(isBMockupPath || isBMockupName)) return -1;
        if ((isBMockupPath || isBMockupName) && !(isAMockupPath || isAMockupName)) return 1;
        // Si les deux sont des mockups, trier par index numérique
        if ((isAMockupPath || isAMockupName) && (isBMockupPath || isBMockupName)) {
            const indexA = parseInt(a.split('_').pop());
            const indexB = parseInt(b.split('_').pop());
            if (indexA !== indexB) return indexA - indexB;
            return a.localeCompare(b); // path avant name
        }

        // Puis les champs de variantes (variant1Type, variant1Values, etc.)
        const isAVariantGen = a.startsWith('variant1') || a.startsWith('variant2');
        const isBVariantGen = b.startsWith('variant1') || b.startsWith('variant2');
        if (isAVariantGen && !isBVariantGen) return -1;
        if (isBVariantGen && !isAVariantGen) return 1;

        // Enfin le reste par ordre alphabétique
        return a.localeCompare(b);
    });


    // Créer un enregistrement exemple pour le template
    const exampleRecord = {};
    sortedHeaders.forEach(header => {
        exampleRecord[header] = ''; // Valeurs vides par défaut
    });
    // Remplir quelques champs obligatoires et de variantes pour l'exemple
    exampleRecord.name = 'example_product_name';
    exampleRecord.type = 'simple';
    exampleRecord.prefix = 'EX';
    exampleRecord.category = 'T-shirt';
    exampleRecord.variant1Type = 'color';
    exampleRecord.variant1Values = 'white,black,red';
    exampleRecord.variant2Type = 'size';
    exampleRecord.variant2Values = 'XS,S,M';
    exampleRecord.mockups_path_0 = 'C:/mockups/example_mockup_path';
    exampleRecord.mockups_name_0 = '{label}.jpg';

    const records = [exampleRecord];

    try {
        const csvString = await new Promise((resolve, reject) => {
            stringify(records, { 
                header: true, 
                columns: sortedHeaders,
                quoted: true // Force quoting for all fields in template as well
            }, (err, output) => {
                if (err) reject(err);
                else resolve(output);
            });
        });
        fs.writeFileSync(filePath, csvString, 'utf-8');
        console.log("[Main Process] CSV template saved successfully.");
        return true;
    } catch (error) {
        console.error(`[Main Process] Failed to save CSV template to ${filePath}:`, error);
        dialog.showErrorBox('Error', 'Failed to save CSV template: ' + error.message + '\nPath: ' + filePath);
        return false;
    }
});