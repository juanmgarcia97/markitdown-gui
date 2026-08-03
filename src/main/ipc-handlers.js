'use strict';

const fs = require('fs');
const path = require('path');

const { SUPPORTED_FORMATS } = require('../shared/constants');
const { FileValidator } = require('./file-validator');
const { OutputManager } = require('./output-manager');
const { BatchProcessor } = require('./batch-processor');
const { PythonBridge } = require('./python-bridge');
const { SettingsManager } = require('./settings-manager');
const { log } = require('./logger');

/**
 * Builds the file filters array for the open-file dialog
 * based on SUPPORTED_FORMATS extensions.
 * @returns {Array<{name: string, extensions: string[]}>}
 */
function buildDialogFilters() {
  const extensions = Object.keys(SUPPORTED_FORMATS);
  return [
    { name: 'Supported Files', extensions },
    { name: 'All Files', extensions: ['*'] },
  ];
}

let _handlersRegistered = false;
let _mainWindowRef = null;

/**
 * Updates the mainWindow reference used by IPC handlers.
 * Call this when a new window is created (e.g., on macOS activate).
 * @param {import('electron').BrowserWindow} mainWindow
 */
function updateMainWindowRef(mainWindow) {
  _mainWindowRef = mainWindow;
}

/**
 * Returns whether IPC handlers have already been registered.
 * Useful for testing.
 * @returns {boolean}
 */
function isRegistered() {
  return _handlersRegistered;
}

/**
 * Resets the registration state. Only for testing.
 */
function resetHandlersRegistered() {
  _handlersRegistered = false;
  _mainWindowRef = null;
}

/**
 * Registers all IPC handlers that connect the preload API with main process modules.
 * Handlers are registered only once. Subsequent calls update the mainWindow reference.
 * @param {import('electron').BrowserWindow} mainWindow - The main application window
 * @param {Object} [deps] - Optional dependency injection (for testing)
 * @param {FileValidator} [deps.fileValidator]
 * @param {OutputManager} [deps.outputManager]
 * @param {PythonBridge} [deps.pythonBridge]
 * @param {BatchProcessor} [deps.batchProcessor]
 * @param {SettingsManager} [deps.settingsManager]
 * @param {Object} [deps.electron] - Electron modules (for testing)
 */
function registerIpcHandlers(mainWindow, deps = {}) {
  _mainWindowRef = mainWindow;

  if (_handlersRegistered) {
    log.info('IPC handlers already registered, updating mainWindow reference only');
    return;
  }
  _handlersRegistered = true;
  const electron = deps.electron || require('electron');
  const { ipcMain, dialog, shell, clipboard } = electron;

  const fileValidator = deps.fileValidator || new FileValidator();
  const outputManager = deps.outputManager || new OutputManager();
  const pythonBridge = deps.pythonBridge || new PythonBridge();
  const settingsManager = deps.settingsManager || new SettingsManager();
  const batchProcessor =
    deps.batchProcessor || new BatchProcessor(pythonBridge, outputManager);

  let pythonBridgeInitialized = false;

  /**
   * Ensures the PythonBridge is initialized (lazy initialization).
   * Returns true if ready, false if initialization failed.
   */
  async function ensurePythonBridgeReady() {
    if (pythonBridgeInitialized) return true;
    try {
      log.info('Initializing PythonBridge (lazy)...');
      await pythonBridge.initialize();
      pythonBridgeInitialized = true;
      log.info('PythonBridge initialized successfully');
      return true;
    } catch (err) {
      log.error('PythonBridge initialization failed:', err.message);
      return false;
    }
  }

  log.info('Registering IPC handlers');

  // ─── File Operations ──────────────────────────────────────────────────

  /**
   * Opens a native file dialog filtered by supported extensions.
   * Returns the selected file paths or an empty array if cancelled.
   */
  ipcMain.handle('open-file-dialog', async () => {
    log.info('IPC: open-file-dialog');
    const result = await dialog.showOpenDialog(_mainWindowRef, {
      properties: ['openFile', 'multiSelections'],
      filters: buildDialogFilters(),
    });

    if (result.canceled) {
      return [];
    }
    return result.filePaths;
  });

  /**
   * Validates an array of file paths against all validation rules.
   * @param {string[]} paths - File paths to validate
   * @param {string[]} existingPaths - Already imported paths (for duplicate detection)
   * @returns {Promise<ValidationResult[]>}
   */
  ipcMain.handle('validate-files', async (_event, paths, existingPaths) => {
    log.info('IPC: validate-files', { count: paths ? paths.length : 0 });
    return fileValidator.validate(paths, existingPaths || []);
  });

  /**
   * Reads first-level files from a folder path.
   * Returns an array of absolute file paths (excludes subdirectories).
   */
  ipcMain.handle('extract-folder-files', async (_event, folderPath) => {
    log.info('IPC: extract-folder-files', folderPath);
    try {
      const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
      const filePaths = entries
        .filter((entry) => entry.isFile())
        .map((entry) => path.join(folderPath, entry.name));
      return filePaths;
    } catch (err) {
      log.error('extract-folder-files failed:', err.message);
      return [];
    }
  });

  // ─── Conversion ───────────────────────────────────────────────────────

  /**
   * Starts batch conversion of files.
   * Sends progress updates and completion event via mainWindow.webContents.
   */
  ipcMain.handle('start-conversion', async (_event, files, outputDir) => {
    log.info('IPC: start-conversion', { fileCount: files ? files.length : 0, outputDir });

    // Lazy initialization of PythonBridge
    const ready = await ensurePythonBridgeReady();
    if (!ready) {
      const error = new Error(
        'Python environment is not available. Please check the application installation.'
      );
      error.code = 'python_not_found';
      log.error('start-conversion aborted: PythonBridge not ready');
      if (_mainWindowRef && !_mainWindowRef.isDestroyed()) {
        _mainWindowRef.webContents.send('conversion-error', {
          message: error.message,
          code: error.code,
        });
      }
      throw error;
    }

    const onProgress = (progressData) => {
      if (_mainWindowRef && !_mainWindowRef.isDestroyed()) {
        _mainWindowRef.webContents.send('progress-update', progressData);
      }
    };

    try {
      const result = await batchProcessor.process(files, outputDir, onProgress);

      if (_mainWindowRef && !_mainWindowRef.isDestroyed()) {
        _mainWindowRef.webContents.send('conversion-complete', result);
      }

      return result;
    } catch (error) {
      log.error('start-conversion error:', error.message);
      if (_mainWindowRef && !_mainWindowRef.isDestroyed()) {
        _mainWindowRef.webContents.send('conversion-error', {
          message: error.message,
          code: error.code,
        });
      }
      throw error;
    }
  });

  /**
   * Cancels the current batch conversion.
   */
  ipcMain.handle('cancel-conversion', () => {
    log.info('IPC: cancel-conversion');
    batchProcessor.cancel();
  });

  // ─── Output Directory ─────────────────────────────────────────────────

  /**
   * Opens a native directory selection dialog and persists the chosen path.
   * Returns the selected directory path or null if cancelled.
   */
  ipcMain.handle('select-output-dir', async () => {
    log.info('IPC: select-output-dir');
    const result = await dialog.showOpenDialog(_mainWindowRef, {
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const dirPath = result.filePaths[0];
    await settingsManager.setOutputDir(dirPath);
    return dirPath;
  });

  /**
   * Returns the currently configured output directory.
   */
  ipcMain.handle('get-output-dir', async () => {
    return settingsManager.getOutputDir();
  });

  /**
   * Opens a folder in the system file explorer.
   */
  ipcMain.handle('open-output-folder', async (_event, dirPath) => {
    await shell.openPath(dirPath);
  });

  // ─── Preview & Clipboard ──────────────────────────────────────────────

  /**
   * Reads a .md file from disk and returns its content as a string.
   */
  ipcMain.handle('read-markdown-file', async (_event, filePath) => {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return content;
  });

  /**
   * Copies text to the system clipboard.
   */
  ipcMain.handle('copy-to-clipboard', (_event, text) => {
    clipboard.writeText(text);
  });

  // ─── Logging ──────────────────────────────────────────────────────────

  /**
   * Returns the log file path so the renderer can display it to the user.
   */
  ipcMain.handle('get-log-path', () => {
    return log.getLogPath();
  });
}

module.exports = { registerIpcHandlers, updateMainWindowRef, isRegistered, resetHandlersRegistered };
