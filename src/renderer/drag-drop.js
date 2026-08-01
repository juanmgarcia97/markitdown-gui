/**
 * Drag-and-drop handler for the MarkItDown GUI renderer.
 * Handles file import via drag-drop on the Drop_Zone and the "Agregar archivos" button.
 *
 * @module drag-drop
 */

/**
 * Initializes drag-and-drop functionality on the drop zone element.
 *
 * @param {Object} options
 * @param {function(import('../shared/constants').ValidationResult[]): void} options.onFilesValidated
 *   Callback invoked with validation results after files are processed.
 * @param {function(): string[]} options.getExistingPaths
 *   Getter that returns the current list of already-imported file paths.
 */
export function initDragDrop({ onFilesValidated, getExistingPaths }) {
  const dropZone = document.getElementById('drop-zone');
  const btnAddFiles = document.getElementById('btn-add-files');

  if (!dropZone) {
    console.error('drag-drop: #drop-zone element not found');
    return;
  }

  // Track drag enter/leave depth to handle child element events properly
  let dragCounter = 0;

  // --- Drag events ---

  dropZone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter++;
    if (dragCounter === 1) {
      dropZone.classList.add('drag-over');
    }
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Ensure the visual feedback stays active
    if (!dropZone.classList.contains('drag-over')) {
      dropZone.classList.add('drag-over');
    }
  });

  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      dropZone.classList.remove('drag-over');
    }
  });

  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;
    dropZone.classList.remove('drag-over');

    await handleDroppedFiles(e.dataTransfer, onFilesValidated, getExistingPaths);
  });

  // --- "Agregar archivos" button ---

  if (btnAddFiles) {
    btnAddFiles.addEventListener('click', async () => {
      const result = await window.markitdownAPI.openFileDialog();
      if (result && result.length > 0) {
        const existingPaths = getExistingPaths ? getExistingPaths() : [];
        const validationResults = await window.markitdownAPI.validateFiles(result, existingPaths);
        onFilesValidated(validationResults);
      }
    });
  }
}

/**
 * Processes files from a DataTransfer object (from a drop event).
 * Separates files and folders, extracts first-level files from folders,
 * then validates all paths.
 *
 * @param {DataTransfer} dataTransfer - The DataTransfer from the drop event
 * @param {function} onFilesValidated - Callback with validation results
 * @param {function(): string[]} getExistingPaths - Getter for existing paths
 */
async function handleDroppedFiles(dataTransfer, onFilesValidated, getExistingPaths) {
  const files = dataTransfer.files;
  if (!files || files.length === 0) {
    return;
  }

  const filePaths = [];
  const folderPaths = [];

  // In Electron, File objects from DataTransfer have a .path property
  // Use webkitGetAsEntry to determine if an item is a file or directory
  const items = dataTransfer.items;

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i].path;

    if (!filePath) {
      continue;
    }

    // Check if item is a directory using webkitGetAsEntry
    let isDirectory = false;
    if (items && items[i]) {
      const entry = items[i].webkitGetAsEntry && items[i].webkitGetAsEntry();
      if (entry && entry.isDirectory) {
        isDirectory = true;
      }
    }

    // Fallback: if the File type is empty and there's no extension, it's likely a folder
    if (!isDirectory && files[i].type === '' && files[i].size === 0) {
      isDirectory = true;
    }

    if (isDirectory) {
      folderPaths.push(filePath);
    } else {
      filePaths.push(filePath);
    }
  }

  // Extract first-level files from folders
  for (const folderPath of folderPaths) {
    try {
      const extractedFiles = await window.markitdownAPI.extractFolderFiles(folderPath);
      if (Array.isArray(extractedFiles)) {
        filePaths.push(...extractedFiles);
      }
    } catch (err) {
      console.error(`drag-drop: Error extracting files from folder "${folderPath}":`, err);
    }
  }

  if (filePaths.length === 0) {
    return;
  }

  // Validate all collected file paths
  const existingPaths = getExistingPaths ? getExistingPaths() : [];
  const validationResults = await window.markitdownAPI.validateFiles(filePaths, existingPaths);
  onFilesValidated(validationResults);
}
