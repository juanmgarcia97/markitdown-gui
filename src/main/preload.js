const { contextBridge, ipcRenderer } = require('electron');

// Whitelist of allowed IPC channels for security
const VALID_CHANNELS = [
  'progress-update',
  'conversion-complete',
  'conversion-error',
];

contextBridge.exposeInMainWorld('markitdownAPI', {
  // File operations
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  validateFiles: (paths, existing) => ipcRenderer.invoke('validate-files', paths, existing),
  extractFolderFiles: (folderPath) => ipcRenderer.invoke('extract-folder-files', folderPath),

  // Conversion
  startConversion: (files, outputDir) => ipcRenderer.invoke('start-conversion', files, outputDir),
  cancelConversion: () => ipcRenderer.invoke('cancel-conversion'),

  // Output
  selectOutputDir: () => ipcRenderer.invoke('select-output-dir'),
  getOutputDir: () => ipcRenderer.invoke('get-output-dir'),
  openOutputFolder: (dirPath) => ipcRenderer.invoke('open-output-folder', dirPath),

  // Preview
  readMarkdownFile: (filePath) => ipcRenderer.invoke('read-markdown-file', filePath),
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),

  // Events (only allow whitelisted channels)
  onProgressUpdate: (cb) => ipcRenderer.on('progress-update', (_, data) => cb(data)),
  onConversionComplete: (cb) => ipcRenderer.on('conversion-complete', (_, data) => cb(data)),
  onConversionError: (cb) => ipcRenderer.on('conversion-error', (_, data) => cb(data)),

  // Cleanup (only allow removing listeners on whitelisted channels)
  removeAllListeners: (channel) => {
    if (VALID_CHANNELS.includes(channel)) {
      ipcRenderer.removeAllListeners(channel);
    }
  },
});
