'use strict';

const crypto = require('crypto');

/**
 * Orquesta la conversión secuencial de múltiples archivos con soporte
 * de cancelación y reporte de progreso.
 */
class BatchProcessor {
  /**
   * @param {Object} pythonBridge - Instancia de PythonBridge para ejecutar conversiones
   * @param {Object} outputManager - Instancia de OutputManager para resolver rutas y escribir resultados
   */
  constructor(pythonBridge, outputManager) {
    this._pythonBridge = pythonBridge;
    this._outputManager = outputManager;
    this._processing = false;
    this._cancelled = false;
  }

  /**
   * Inicia la conversión secuencial de archivos.
   * @param {Array<{path: string, name: string, extension: string, size: number, status: string}>} files - Archivos a convertir
   * @param {string|null} outputDir - Directorio de salida (null = usar directorio del archivo original)
   * @param {function} onProgress - Callback de progreso: ({percentage, currentFile, currentIndex, totalFiles})
   * @returns {Promise<{successful: number, failed: number, cancelled: number, totalTimeMs: number, results: Array}>}
   */
  async process(files, outputDir, onProgress) {
    this._processing = true;
    this._cancelled = false;

    const startTime = Date.now();
    const totalFiles = files.length;
    const results = [];
    let successful = 0;
    let failed = 0;
    let cancelled = 0;

    for (let i = 0; i < totalFiles; i++) {
      // Check cancellation before processing the next file
      if (this._cancelled) {
        // Mark remaining files as cancelled
        for (let j = i; j < totalFiles; j++) {
          results.push({
            id: crypto.randomUUID(),
            success: false,
            error: 'Cancelled by user',
          });
          cancelled++;
        }
        break;
      }

      const file = files[i];

      // Emit progress BEFORE processing each file
      if (typeof onProgress === 'function') {
        onProgress({
          percentage: Math.round((i / totalFiles) * 100),
          currentFile: file.name,
          currentIndex: i + 1,
          totalFiles,
        });
      }

      try {
        const requestId = crypto.randomUUID();
        const response = await this._pythonBridge.convert(file.path, requestId);

        if (response.success) {
          // Resolve output path and write the markdown
          const outputPath = await this._outputManager.resolveOutputPath(file.path, outputDir);
          await this._outputManager.writeOutput(outputPath, response.markdown);

          results.push({
            id: requestId,
            success: true,
            markdown: response.markdown,
            outputPath,
          });
          successful++;
        } else {
          results.push({
            id: requestId,
            success: false,
            error: response.error || 'Conversion failed',
          });
          failed++;
        }
      } catch (error) {
        results.push({
          id: crypto.randomUUID(),
          success: false,
          error: error.message || 'Unknown error',
        });
        failed++;
      }

      // Emit progress AFTER processing each file
      if (typeof onProgress === 'function') {
        onProgress({
          percentage: Math.round(((i + 1) / totalFiles) * 100),
          currentFile: file.name,
          currentIndex: i + 1,
          totalFiles,
        });
      }
    }

    const totalTimeMs = Date.now() - startTime;
    this._processing = false;

    return {
      successful,
      failed,
      cancelled,
      totalTimeMs,
      results,
    };
  }

  /**
   * Cancela la conversión después del archivo actual.
   * El archivo en proceso se completará, pero la cola se detendrá.
   */
  cancel() {
    this._cancelled = true;
  }

  /**
   * Indica si hay una conversión en progreso.
   * @returns {boolean}
   */
  isProcessing() {
    return this._processing;
  }
}

module.exports = { BatchProcessor };
