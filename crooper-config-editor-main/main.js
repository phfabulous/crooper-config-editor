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
        return { data: records };
    } catch (error) {
        console.error(`[Main Process] Failed to import CSV file ${filePath}:`, error);
        dialog.showErrorBox('Error', 'Failed to import CSV file: ' + error.message + '\nPath: ' + filePath);
        return null;
    }
});


// Helper function to flatten a product object for CSV export
function flattenProduct(product, knownFieldsConfig) {
    const flatProduct = {
        name: product.name || '', // Always include name, even if empty
        type: product.type || ''  // Always include type, even if empty
    };

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

    // Recursively process nested objects
    function processObject(obj, prefix = '') {
        for (const key in obj) {
            if (Object.hasOwnProperty.call(obj, key)) {
                const fullKey = prefix ? `${prefix}.${key}` : key;
                const value = obj[key];

                // Special handling for CSV export
                if (key === 'mockups' && Array.isArray(value)) {
                    value.forEach((mockup, index) => {
                        flatProduct[`mockups_path_${index}`] = mockup.path || '';
                        flatProduct[`mockups_name_${index}`] = mockup.name || '';
                    });
                } else if (key === 'variant' && typeof value === 'object' && !Array.isArray(value) && product.type === 'parent') {
                    // Flatten variants for 'parent' type products
                    // This section will try to extract data for variant1Type/Values, variant2Type/Values
                    const allPrimaryValues = new Set();
                    let detectedVariant1Type = '';
                    const allSecondaryValues = new Set();
                    let detectedVariant2Type = '';

                    Object.values(value).forEach(primaryVariant => {
                        // Pour le type de variante principal, ne cherchez que la propriété qui correspond à l'ID de la variante
                        // et qui n'est pas un attribut secondaire comme prix, images, etc.
                        for(const k in primaryVariant) {
                            // Exclure 'type', 'variant', et les propriétés qui ressemblent à des attributs ou URLs d'image
                            // et s'assurer que la valeur n'est pas vide pour être considérée comme une "valeur" de variante
                            if (Object.hasOwnProperty.call(primaryVariant, k) && k !== 'type' && !k.endsWith('_FR') && k !== 'variant' && !k.startsWith('prix') && !k.startsWith('sale') && !k.startsWith('picture_')) {
                                if (primaryVariant[k]) { // S'assurer que la valeur n'est pas vide
                                    if (!detectedVariant1Type) detectedVariant1Type = k;
                                    allPrimaryValues.add(primaryVariant[k]);
                                }
                            }
                        }

                        // Pour le type de variante secondaire (si présent)
                        if (primaryVariant.variant && typeof primaryVariant.variant === 'object') {
                            Object.values(primaryVariant.variant).forEach(secondaryVariant => {
                                for(const skey in secondaryVariant) {
                                    // Similaire, exclure les attributs et n'inclure que la valeur d'identification
                                    if (Object.hasOwnProperty.call(secondaryVariant, skey) && !skey.startsWith('prix') && !skey.startsWith('sale') && !skey.startsWith('picture_')) {
                                        if (secondaryVariant[skey]) { // S'assurer que la valeur n'est pas vide
                                            if (!detectedVariant2Type) detectedVariant2Type = skey;
                                            allSecondaryValues.add(secondaryVariant[skey]);
                                        }
                                    }
                                }
                            });
                        }

                        // Export other direct properties of the primary variant (prixFabric, saleFabric, etc.)
                        // These should be appended as `variant_KEY_PROP` to flatProduct.
                        // We need to define a consistent way to handle these to avoid column explosion and allow re-import.
                        // For simplicity in export, we'll prefix them if they are not the primary/secondary variant identifying values.
                        for (const prop in primaryVariant) {
                            if (Object.hasOwnProperty.call(primaryVariant, prop) && prop !== 'variant' && prop !== 'type' && !prop.endsWith('_FR') && prop !== detectedVariant1Type) {
                                // Add a specific column for each direct property of the primary variant
                                // E.g., variant_color_prixFabric (if color is variant1Type)
                                // This requires more specific column names for export and corresponding re-import logic.
                                // For now, let's append generically if they exist and are not primary/secondary value.
                                // But avoid adding them to the 'variant values' lists.
                                // Let's simplify this part: only export primary/secondary values in variant1/2Values,
                                // and if other specific variant attributes (like price, images) need to be exported,
                                // they should be added as new top-level flattened keys with a clear convention,
                                // or handled by a separate variant-specific export if too complex for the main CSV.
                                // Given the current problem is mixed values in 'variant values', this is key.
                                if (primaryVariant[prop] !== undefined && primaryVariant[prop] !== null && primaryVariant[prop] !== '') {
                                    // Check if this property is one of the specific attributes we want to export directly.
                                    // For example, if you want "prixFabric" and "saleFabric" to appear as `variant_prixFabric` etc.
                                    // This assumes all primary variants will have these properties, or they'll just be empty.
                                    // For now, let's not add them as `variant_prop` here if they are not explicitly handled.
                                    // The main goal is to fix `variantValues`.
                                }
                            }
                        }
                    });

                    if (detectedVariant1Type) {
                        flatProduct['variant1Type'] = detectedVariant1Type;
                        // allPrimaryValues contient des valeurs uniques, joindre par virgule.
                        flatProduct['variant1Values'] = [...allPrimaryValues].join(',');
                    }
                    if (detectedVariant2Type) {
                        flatProduct['variant2Type'] = detectedVariant2Type;
                        // allSecondaryValues contient des valeurs uniques, joindre par virgule.
                        flatProduct['variant2Values'] = [...allSecondaryValues].join(',');
                    }

                } else if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
                    processObject(value, fullKey); // Recursively flatten nested objects
                } else {
                    // Simple values or arrays (that are not mockups/variants)
                    let exportValue = value;
                    if (typeof value === 'boolean') {
                        exportValue = value ? 'true' : 'false';
                    } else if (Array.isArray(value)) {
                        exportValue = value.join(','); // Join array elements with commas
                    }
                    flatProduct[fullKey] = exportValue === null || exportValue === undefined ? '' : exportValue; // Ensure empty string for null/undefined
                }
            }
        }
    }

    processObject(product);

    // Fill in any known fields that weren't present in the product with empty strings
    allKnownHeaders.forEach(header => {
        if (!(header in flatProduct)) {
            flatProduct[header] = '';
        }
    });

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

    const allProductsFlat = [];
    const allHeaders = new Set();

    // Prioriser les headers 'name' et 'type'
    allHeaders.add('name');
    allHeaders.add('type');

    // Collecter tous les produits (y compris les alias pour l'export complet)
    for (const productKey in configData) {
        if (Object.hasOwnProperty.call(configData, productKey)) {
            const product = configData[productKey];
            const flatProduct = flattenProduct(product, knownFieldsConfig);
            allProductsFlat.push(flatProduct);
            Object.keys(flatProduct).forEach(header => allHeaders.add(header));
        }
    }

    // Ajouter tous les champs connus (de tous les types) aux en-têtes
    // pour garantir que le template exporté est complet.
    for (const type in knownFieldsConfig) {
        if (Object.hasOwnProperty.call(knownFieldsConfig, type) && knownFieldsConfig[type].fields) {
            for (const fieldKey in knownFieldsConfig[type].fields) {
                // Les champs 'mockups' et 'variant' sont déjà gérés dans flattenProduct pour générer des colonnes spécifiques.
                // On s'assure qu'ils sont ajoutés au set global.
                allHeaders.add(fieldKey);
            }
        }
    }

    // Ajouter les en-têtes spécifiques pour les mockups (basé sur le nombre max trouvé)
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

    // Ajouter les en-têtes de génération de variantes pour la ré-importation facilitée si non déjà présents
    allHeaders.add('variant1Type');
    allHeaders.add('variant1Values');
    allHeaders.add('variant2Type');
    allHeaders.add('variant2Values');
    // Si des propriétés directes de variants ont été détectées et aplaties (ex: variant_prixFabric), les ajouter aussi
    allProductsFlat.forEach(fp => {
        for (const key in fp) {
            if (key.startsWith('variant_') && !key.startsWith('variant1') && !key.startsWith('variant2')) {
                allHeaders.add(key);
            }
        }
    });


    // Convertir le Set en Array et trier pour un ordre cohérent
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