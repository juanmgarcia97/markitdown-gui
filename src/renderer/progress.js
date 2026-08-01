/**
 * ProgressManager - Gestiona la barra de progreso de conversión.
 * Muestra porcentaje, archivo actual e índice respecto al total.
 * Se subscribe a markitdownAPI.onProgressUpdate para recibir actualizaciones.
 */
export class ProgressManager {
  constructor() {
    this._state = 'idle'; // 'idle' | 'processing' | 'complete'
    this._completeTimer = null;

    // DOM references
    this._progressArea = document.getElementById('progress-area');
    this._progressBarFill = document.getElementById('progress-bar-fill');
    this._progressPercentage = document.getElementById('progress-percentage');
    this._progressFile = document.getElementById('progress-file');
    this._progressIndex = document.getElementById('progress-index');
    this._progressBar = this._progressArea?.querySelector('.progress-bar');
    this._btnCancel = document.getElementById('btn-cancel');

    this._bindEvents();
  }

  /**
   * Vincula event listeners.
   */
  _bindEvents() {
    // Cancel button
    if (this._btnCancel) {
      this._btnCancel.addEventListener('click', () => {
        window.markitdownAPI.cancelConversion();
      });
    }

    // Subscribe to progress updates from main process
    if (window.markitdownAPI?.onProgressUpdate) {
      window.markitdownAPI.onProgressUpdate((data) => {
        this.update(data);
      });
    }
  }

  /**
   * Muestra el área de progreso.
   */
  show() {
    if (this._progressArea) {
      this._progressArea.removeAttribute('hidden');
    }
    this._state = 'processing';
  }

  /**
   * Oculta el área de progreso.
   */
  hide() {
    if (this._progressArea) {
      this._progressArea.setAttribute('hidden', '');
    }
    this._state = 'idle';
  }

  /**
   * Actualiza la barra de progreso con los datos recibidos.
   * @param {Object} progressData
   * @param {number} progressData.percentage - 0 a 100
   * @param {string} progressData.currentFile - Nombre del archivo en proceso
   * @param {number} progressData.currentIndex - Índice actual (1-based)
   * @param {number} progressData.totalFiles - Total de archivos
   */
  update(progressData) {
    const { percentage, currentFile, currentIndex, totalFiles } = progressData;

    if (this._state === 'idle') {
      this.show();
    }

    // Update progress bar width
    if (this._progressBarFill) {
      this._progressBarFill.style.width = `${percentage}%`;
    }

    // Update percentage text
    if (this._progressPercentage) {
      this._progressPercentage.textContent = `${percentage}%`;
    }

    // Update current file name
    if (this._progressFile) {
      this._progressFile.textContent = currentFile || '';
    }

    // Update index display (e.g., "3 de 10")
    if (this._progressIndex) {
      this._progressIndex.textContent = `${currentIndex} de ${totalFiles}`;
    }

    // Update aria-valuenow for accessibility
    if (this._progressBar) {
      this._progressBar.setAttribute('aria-valuenow', String(percentage));
    }

    // Handle completion
    if (percentage >= 100) {
      this._state = 'complete';
      this._scheduleHide();
    } else {
      this._state = 'processing';
    }
  }

  /**
   * Resetea el progreso a su estado inicial.
   */
  reset() {
    if (this._completeTimer) {
      clearTimeout(this._completeTimer);
      this._completeTimer = null;
    }

    if (this._progressBarFill) {
      this._progressBarFill.style.width = '0%';
    }

    if (this._progressPercentage) {
      this._progressPercentage.textContent = '0%';
    }

    if (this._progressFile) {
      this._progressFile.textContent = '';
    }

    if (this._progressIndex) {
      this._progressIndex.textContent = '';
    }

    if (this._progressBar) {
      this._progressBar.setAttribute('aria-valuenow', '0');
    }

    this._state = 'idle';
  }

  /**
   * Retorna el estado actual del progreso.
   * @returns {'idle' | 'processing' | 'complete'}
   */
  getState() {
    return this._state;
  }

  /**
   * Programa la ocultación del área de progreso tras completar.
   */
  _scheduleHide() {
    if (this._completeTimer) {
      clearTimeout(this._completeTimer);
    }
    this._completeTimer = setTimeout(() => {
      this.hide();
      this.reset();
      this._completeTimer = null;
    }, 2000);
  }
}
