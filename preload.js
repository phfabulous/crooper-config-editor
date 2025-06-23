// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (configData, filePath) => ipcRenderer.invoke('save-config', configData, filePath),
  showSaveDialog: () => ipcRenderer.invoke('show-save-dialog'),
  getCurrentConfig: () => ipcRenderer.invoke('get-current-config'),
  loadProductTemplatesFromFile: (fileName) => ipcRenderer.invoke('load-product-templates-from-file', fileName),
  saveProductTemplatesFromFile: (templatesData, fileName) => ipcRenderer.invoke('save-product-templates-to-file', templatesData, fileName),
  loadKnownFieldsConfig: (fileName) => ipcRenderer.invoke('load-known-fields-config', fileName),
  saveKnownFieldsConfig: (fieldsData, fileName) => ipcRenderer.invoke('save-known-fields-config', fieldsData, fileName),
  importCsvData: () => ipcRenderer.invoke('import-csv-data'),
  exportConfigToCsv: (configData, knownFieldsConfig) => ipcRenderer.invoke('export-config-to-csv', configData, knownFieldsConfig), // NOUVEAU: Export config CSV
  generateCsvTemplate: (knownFieldsConfig) => ipcRenderer.invoke('generate-csv-template', knownFieldsConfig) // Passer les champs connus
});