/**
 * Formats a file size in bytes to a human-readable string.
 * @param {number} bytes - File size in bytes (non-negative integer)
 * @returns {string} Formatted string (e.g., "512 B", "1.5 KB", "25.3 MB", "1.2 GB")
 */
function formatFileSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1048576) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1073741824) {
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

/**
 * @typedef {Object} FileItem
 * @property {string} path - Absolute file path
 * @property {string} name - File basename
 * @property {string} extension - Extension without dot
 * @property {number} size - Size in bytes
 * @property {'pending'|'converting'|'done'|'error'} status
 */

const INCREMENTAL_BATCH_SIZE = 20;
const INCREMENTAL_DELAY_MS = 16; // ~1 frame

class FileList {
  constructor() {
    /** @type {FileItem[]} */
    this._files = [];
    /** @type {string|null} */
    this._selectedPath = null;
    /** @type {Function|null} */
    this._onSelectionChange = null;
    /** @type {Function|null} */
    this._onRemove = null;

    this._container = document.querySelector('.file-list__container');
    this._emptyEl = this._container ? this._container.querySelector('.file-list__empty') : null;
    this._countEl = document.getElementById('file-count');
  }

  /**
   * Register a callback for file selection changes.
   * @param {Function} callback - Called with the selected FileItem or null
   */
  onSelectionChange(callback) {
    this._onSelectionChange = callback;
  }

  /**
   * Register a callback for file removal.
   * @param {Function} callback - Called with the file path that was removed
   */
  onRemove(callback) {
    this._onRemove = callback;
  }

  /**
   * Add validated files to the list. Only adds files marked as valid.
   * @param {Array<{path: string, fileName: string, valid: boolean, fileSize?: number}>} validationResults
   */
  addFiles(validationResults) {
    const validFiles = validationResults.filter(r => r.valid);
    const newItems = validFiles.map(r => ({
      path: r.path,
      name: r.fileName || this._basename(r.path),
      extension: this._getExtension(r.path),
      size: r.fileSize || 0,
      status: 'pending',
    }));

    // Filter out duplicates already in the list
    const existingPaths = new Set(this._files.map(f => f.path));
    const uniqueItems = newItems.filter(item => !existingPaths.has(item.path));

    if (uniqueItems.length === 0) return;

    this._files.push(...uniqueItems);

    if (this._files.length > 100) {
      this._renderIncremental(uniqueItems);
    } else {
      this._render();
    }
  }

  /**
   * Remove a file from the list by path.
   * @param {string} path
   */
  removeFile(path) {
    const index = this._files.findIndex(f => f.path === path);
    if (index === -1) return;

    this._files.splice(index, 1);

    if (this._selectedPath === path) {
      this._selectedPath = null;
      if (this._onSelectionChange) this._onSelectionChange(null);
    }

    this._render();

    if (this._onRemove) this._onRemove(path);
  }

  /**
   * Update the status of a file.
   * @param {string} path
   * @param {'pending'|'converting'|'done'|'error'} status
   */
  updateFileStatus(path, status) {
    const file = this._files.find(f => f.path === path);
    if (!file) return;

    file.status = status;

    // Update just the status element in the DOM for performance
    const itemEl = this._container
      ? this._container.querySelector(`[data-path="${CSS.escape(path)}"]`)
      : null;

    if (itemEl) {
      const statusEl = itemEl.querySelector('.file-item__status');
      if (statusEl) {
        statusEl.textContent = this._statusLabel(status);
        statusEl.className = 'file-item__status';
        if (status === 'done' || status === 'error' || status === 'converting') {
          statusEl.classList.add(`file-item__status--${status}`);
        }
      }
    }
  }

  /**
   * Return array of current FileItem objects.
   * @returns {FileItem[]}
   */
  getFiles() {
    return [...this._files];
  }

  /**
   * Return array of current file paths.
   * @returns {string[]}
   */
  getFilePaths() {
    return this._files.map(f => f.path);
  }

  /**
   * Clear all files from the list.
   */
  clear() {
    this._files = [];
    this._selectedPath = null;
    this._render();
  }

  /**
   * Get the currently selected file.
   * @returns {FileItem|null}
   */
  getSelectedFile() {
    if (!this._selectedPath) return null;
    return this._files.find(f => f.path === this._selectedPath) || null;
  }

  /**
   * Select a file by path.
   * @param {string} path
   */
  selectFile(path) {
    const file = this._files.find(f => f.path === path);
    if (!file) return;

    this._selectedPath = path;

    // Update DOM selection state
    if (this._container) {
      const items = this._container.querySelectorAll('.file-item');
      items.forEach(item => {
        if (item.getAttribute('data-path') === path) {
          item.classList.add('file-item--selected');
        } else {
          item.classList.remove('file-item--selected');
        }
      });
    }

    if (this._onSelectionChange) this._onSelectionChange(file);
  }

  // --- Private methods ---

  /**
   * Full re-render of the file list.
   */
  _render() {
    if (!this._container) return;

    // Clear existing file items (keep the empty placeholder)
    const existingItems = this._container.querySelectorAll('.file-item');
    existingItems.forEach(el => el.remove());

    // Toggle empty state
    if (this._emptyEl) {
      this._emptyEl.style.display = this._files.length === 0 ? '' : 'none';
    }

    // Render file items
    const fragment = document.createDocumentFragment();
    for (const file of this._files) {
      fragment.appendChild(this._createFileItemElement(file));
    }
    this._container.appendChild(fragment);

    // Update count
    this._updateCount();
  }

  /**
   * Incrementally render new items in batches (for > 100 files).
   * @param {FileItem[]} newItems
   */
  _renderIncremental(newItems) {
    if (!this._container) return;

    // Hide empty state
    if (this._emptyEl) {
      this._emptyEl.style.display = 'none';
    }

    // Render in batches to avoid blocking
    let index = 0;
    const renderBatch = () => {
      const fragment = document.createDocumentFragment();
      const end = Math.min(index + INCREMENTAL_BATCH_SIZE, newItems.length);

      for (let i = index; i < end; i++) {
        fragment.appendChild(this._createFileItemElement(newItems[i]));
      }
      this._container.appendChild(fragment);
      index = end;

      if (index < newItems.length) {
        setTimeout(renderBatch, INCREMENTAL_DELAY_MS);
      }
    };

    renderBatch();
    this._updateCount();
  }

  /**
   * Create a DOM element for a file item.
   * @param {FileItem} file
   * @returns {HTMLElement}
   */
  _createFileItemElement(file) {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-path', file.path);

    if (file.path === this._selectedPath) {
      item.classList.add('file-item--selected');
    }

    // File name
    const nameEl = document.createElement('span');
    nameEl.className = 'file-item__name';
    nameEl.textContent = file.name;
    nameEl.title = file.path;

    // File size
    const sizeEl = document.createElement('span');
    sizeEl.className = 'file-item__size';
    sizeEl.textContent = formatFileSize(file.size);

    // Extension badge
    const extEl = document.createElement('span');
    extEl.className = 'file-item__ext';
    extEl.textContent = file.extension;

    // Status
    const statusEl = document.createElement('span');
    statusEl.className = 'file-item__status';
    if (file.status === 'done' || file.status === 'error' || file.status === 'converting') {
      statusEl.classList.add(`file-item__status--${file.status}`);
    }
    statusEl.textContent = this._statusLabel(file.status);

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'file-item__remove';
    removeBtn.type = 'button';
    removeBtn.title = 'Eliminar archivo';
    removeBtn.setAttribute('aria-label', `Eliminar ${file.name}`);
    removeBtn.innerHTML = '&#x2715;'; // × character
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.removeFile(file.path);
    });

    // Click to select
    item.addEventListener('click', () => {
      this.selectFile(file.path);
    });

    item.appendChild(nameEl);
    item.appendChild(sizeEl);
    item.appendChild(extEl);
    item.appendChild(statusEl);
    item.appendChild(removeBtn);

    return item;
  }

  /**
   * Update the file count display.
   */
  _updateCount() {
    if (this._countEl) {
      const count = this._files.length;
      this._countEl.textContent = `${count} archivo${count !== 1 ? 's' : ''}`;
    }
  }

  /**
   * Get a human-readable status label.
   * @param {string} status
   * @returns {string}
   */
  _statusLabel(status) {
    const labels = {
      pending: 'Pendiente',
      converting: 'Convirtiendo...',
      done: 'Listo',
      error: 'Error',
    };
    return labels[status] || status;
  }

  /**
   * Extract the basename from a file path.
   * @param {string} filePath
   * @returns {string}
   */
  _basename(filePath) {
    const parts = filePath.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || filePath;
  }

  /**
   * Extract file extension (without dot) from a path.
   * @param {string} filePath
   * @returns {string}
   */
  _getExtension(filePath) {
    const name = this._basename(filePath);
    const dotIndex = name.lastIndexOf('.');
    if (dotIndex === -1 || dotIndex === 0) return '';
    return name.substring(dotIndex + 1).toLowerCase();
  }
}

export { FileList, formatFileSize };
