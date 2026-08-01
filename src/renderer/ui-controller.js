/**
 * UIController - Top-level orchestrator for the renderer process.
 * Coordinates FileList, MarkdownPreview, ProgressManager, and DragDrop modules.
 * Manages the full application flow: import → validate → convert → show results.
 *
 * Validates: Requirements 2.2, 2.4, 2.7, 3.6, 7.1
 */

import { FileList } from './file-list.js';
import { MarkdownPreview } from './markdown-preview.js';
import { ProgressManager } from './progress.js';
import { initDragDrop } from './drag-drop.js';

const TOAST_DURATION_MS = 5000;

/**
 * Initialize the UI controller and wire all modules together.
 * This is the single entry point for the renderer's application logic.
 */
export function initUIController() {
  const fileList = new FileList();
  const markdownPreview = new MarkdownPreview();
  const progressManager = new ProgressManager();

  // State
  let isConverting = false;
  let currentOutputDir = null;

  // DOM references
  const btnConvert = document.getElementById('btn-convert');
  const btnSelectOutput = document.getElementById('btn-select-output');
  const outputDirPath = document.getElementById('output-dir-path');
  const toastContainer = document.getElementById('toast-container');

  // --- Initialize drag-drop ---
  initDragDrop({
    onFilesValidated: (validationResults) => {
      handleFilesValidated(validationResults);
    },
    getExistingPaths: () => fileList.getFilePaths(),
  });

  // --- Load initial output directory ---
  loadOutputDir();

  // --- Wire FileList selection to MarkdownPreview ---
  fileList.onSelectionChange(async (file) => {
    if (!file) {
      markdownPreview.clear();
      return;
    }

    if (file.status === 'done') {
      try {
        const outputPath = resolveOutputPathForFile(file.path);
        const markdown = await window.markitdownAPI.readMarkdownFile(outputPath);
        markdownPreview.showPreview(markdown);
      } catch (err) {
        markdownPreview.clear();
        console.error('Error reading converted file:', err);
      }
    } else {
      markdownPreview.clear();
    }
  });

  // --- Convert button ---
  if (btnConvert) {
    btnConvert.addEventListener('click', () => {
      startConversion();
    });
  }

  // --- Output directory selector ---
  if (btnSelectOutput) {
    btnSelectOutput.addEventListener('click', async () => {
      const dir = await window.markitdownAPI.selectOutputDir();
      if (dir) {
        currentOutputDir = dir;
        updateOutputDirDisplay(dir);
      }
    });
  }

  // --- Subscribe to conversion events ---
  if (window.markitdownAPI?.onConversionComplete) {
    window.markitdownAPI.onConversionComplete((summary) => {
      handleConversionComplete(summary);
    });
  }

  if (window.markitdownAPI?.onConversionError) {
    window.markitdownAPI.onConversionError((errorData) => {
      handleConversionError(errorData);
    });
  }

  // --- Internal functions ---

  /**
   * Load the saved output directory on app start.
   */
  async function loadOutputDir() {
    try {
      const dir = await window.markitdownAPI.getOutputDir();
      if (dir) {
        currentOutputDir = dir;
        updateOutputDirDisplay(dir);
      }
    } catch (err) {
      console.error('Error loading output directory:', err);
    }
  }

  /**
   * Update the output directory path display.
   * @param {string|null} dir
   */
  function updateOutputDirDisplay(dir) {
    if (outputDirPath) {
      outputDirPath.textContent = dir || 'Misma carpeta del archivo original';
      outputDirPath.title = dir || '';
    }
  }

  /**
   * Handle validated files from drag-drop or file dialog.
   * Adds valid files to FileList and shows notifications for invalid ones.
   * @param {Array} validationResults
   */
  function handleFilesValidated(validationResults) {
    // Show notifications for invalid files
    const invalidFiles = validationResults.filter(r => !r.valid);
    if (invalidFiles.length > 0) {
      const duplicates = invalidFiles.filter(r => r.error === 'duplicate');
      const others = invalidFiles.filter(r => r.error !== 'duplicate');

      if (duplicates.length > 0) {
        showToast(
          `${duplicates.length} archivo${duplicates.length > 1 ? 's' : ''} duplicado${duplicates.length > 1 ? 's' : ''} omitido${duplicates.length > 1 ? 's' : ''}`,
          'warning'
        );
      }

      for (const file of others) {
        const message = getValidationErrorMessage(file);
        showToast(message, 'warning');
      }
    }

    // Add valid files to the list
    fileList.addFiles(validationResults);

    // Update convert button state
    updateConvertButtonState();
  }

  /**
   * Get a human-readable error message for a validation failure.
   * @param {Object} result - ValidationResult
   * @returns {string}
   */
  function getValidationErrorMessage(result) {
    switch (result.error) {
      case 'unsupported_extension':
        return `"${result.fileName}" tiene un formato no soportado. Formatos aceptados: PDF, Word, Excel, PowerPoint, imágenes, audio, HTML, CSV, JSON y más.`;
      case 'mime_mismatch':
        return `"${result.fileName}" tiene una discrepancia entre su extensión y contenido real (MIME: ${result.detectedMime || 'desconocido'}).`;
      case 'path_traversal':
        return `"${result.fileName}" tiene una ruta inválida.`;
      case 'too_large':
        return `"${result.fileName}" excede el límite de 500 MB.`;
      case 'unreadable':
        return `"${result.fileName}" no se puede leer.`;
      default:
        return `"${result.fileName}" no pudo ser importado.`;
    }
  }

  /**
   * Update the convert button enabled/disabled state.
   */
  function updateConvertButtonState() {
    if (!btnConvert) return;
    const hasFiles = fileList.getFiles().length > 0;
    btnConvert.disabled = !hasFiles || isConverting;
  }

  /**
   * Start the conversion process.
   */
  async function startConversion() {
    const files = fileList.getFiles();
    if (files.length === 0) {
      showToast('Agrega archivos antes de convertir', 'info');
      return;
    }

    isConverting = true;
    updateConvertButtonState();
    progressManager.show();

    // Mark all files as pending
    for (const file of files) {
      if (file.status === 'pending') {
        // Already pending, no change needed
      }
    }

    try {
      const filePaths = files.map(f => f.path);
      await window.markitdownAPI.startConversion(filePaths, currentOutputDir);
    } catch (err) {
      showToast(`Error al iniciar la conversión: ${err.message || err}`, 'error', true);
      isConverting = false;
      updateConvertButtonState();
      progressManager.hide();
    }
  }

  /**
   * Handle conversion complete event from main process.
   * @param {Object} summary - BatchResult
   * @param {number} summary.successful
   * @param {number} summary.failed
   * @param {number} summary.cancelled
   * @param {number} summary.totalTimeMs
   * @param {Array} summary.results - ConversionResult[]
   */
  function handleConversionComplete(summary) {
    isConverting = false;
    updateConvertButtonState();
    progressManager.reset();
    progressManager.hide();

    // Update file statuses based on results
    if (summary.results && Array.isArray(summary.results)) {
      for (const result of summary.results) {
        if (result.success) {
          fileList.updateFileStatus(result.filePath || result.path, 'done');
        } else {
          fileList.updateFileStatus(result.filePath || result.path, 'error');
        }
      }
    }

    // Show summary toast
    const totalTimeSec = (summary.totalTimeMs / 1000).toFixed(1);
    const summaryMessage = `Conversión completada: ${summary.successful} exitoso${summary.successful !== 1 ? 's' : ''}, ${summary.failed} fallido${summary.failed !== 1 ? 's' : ''}, ${totalTimeSec}s`;

    showToast(summaryMessage, 'success', false, () => {
      openOutputFolder();
    });
  }

  /**
   * Handle conversion error event from main process.
   * @param {Object} errorData
   * @param {string} errorData.message
   * @param {string} [errorData.filePath]
   */
  function handleConversionError(errorData) {
    const message = errorData.message || 'Error desconocido durante la conversión';
    showToast(message, 'error', true);

    if (errorData.filePath) {
      fileList.updateFileStatus(errorData.filePath, 'error');
    }
  }

  /**
   * Open the output folder in the system file explorer.
   */
  async function openOutputFolder() {
    try {
      const dir = currentOutputDir || null;
      await window.markitdownAPI.openOutputFolder(dir);
    } catch (err) {
      console.error('Error opening output folder:', err);
    }
  }

  /**
   * Resolve the expected output path for a converted file.
   * Matches the logic in OutputManager: same dir or custom dir, .md extension.
   * @param {string} inputPath
   * @returns {string}
   */
  function resolveOutputPathForFile(inputPath) {
    const parts = inputPath.replace(/\\/g, '/').split('/');
    const fileName = parts[parts.length - 1];
    const dotIndex = fileName.lastIndexOf('.');
    const baseName = dotIndex > 0 ? fileName.substring(0, dotIndex) : fileName;
    const outputFileName = baseName + '.md';

    if (currentOutputDir) {
      return currentOutputDir.replace(/\\/g, '/') + '/' + outputFileName;
    }

    // Same directory as the original file
    parts[parts.length - 1] = outputFileName;
    return parts.join('/');
  }

  // --- Toast Notification System ---

  /**
   * Show a toast notification.
   * @param {string} message - The message to display
   * @param {'success'|'error'|'info'|'warning'} type - Toast type
   * @param {boolean} [persistent=false] - If true, requires manual dismiss
   * @param {Function} [onAction] - Optional action callback (shows "Abrir carpeta" button)
   */
  function showToast(message, type = 'info', persistent = false, onAction = null) {
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.setAttribute('role', 'alert');

    // Message content
    const messageEl = document.createElement('span');
    messageEl.className = 'toast__message';
    messageEl.textContent = message;
    toast.appendChild(messageEl);

    // Action button (e.g., "Abrir carpeta")
    if (onAction) {
      const actionBtn = document.createElement('button');
      actionBtn.className = 'toast__action';
      actionBtn.textContent = 'Abrir carpeta';
      actionBtn.type = 'button';
      actionBtn.addEventListener('click', () => {
        onAction();
        removeToast(toast);
      });
      toast.appendChild(actionBtn);
    }

    // Dismiss button
    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'toast__dismiss';
    dismissBtn.type = 'button';
    dismissBtn.setAttribute('aria-label', 'Cerrar notificación');
    dismissBtn.innerHTML = '&#x2715;';
    dismissBtn.addEventListener('click', () => {
      removeToast(toast);
    });
    toast.appendChild(dismissBtn);

    toastContainer.appendChild(toast);

    // Auto-dismiss for non-persistent toasts
    if (!persistent) {
      setTimeout(() => {
        removeToast(toast);
      }, TOAST_DURATION_MS);
    }
  }

  /**
   * Remove a toast element from the container with animation.
   * @param {HTMLElement} toast
   */
  function removeToast(toast) {
    if (!toast || !toast.parentNode) return;
    toast.classList.add('toast--exiting');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }

  // --- FileList removal updates button state ---
  fileList.onRemove(() => {
    updateConvertButtonState();
  });

  // Initial button state
  updateConvertButtonState();

  // Expose for testing/debugging if needed
  return {
    fileList,
    markdownPreview,
    progressManager,
    showToast,
    startConversion,
    updateConvertButtonState,
  };
}
