'use strict';

const fs = require('fs/promises');
const path = require('path');
const { LIMITS, ERROR_CODES } = require('../shared/constants');

/**
 * Gestiona la determinación de rutas de salida y resolución de conflictos de nombres.
 */
class OutputManager {
  /**
   * Determina la ruta de salida para un archivo convertido.
   * @param {string} inputFilePath - Ruta del archivo original
   * @param {string|null} customOutputDir - Directorio personalizado (null = usar directorio original)
   * @returns {Promise<string>} Ruta completa del archivo .md de salida
   * @throws {Error} si se alcanza el límite de 99 sufijos
   */
  async resolveOutputPath(inputFilePath, customOutputDir) {
    const outputDir = customOutputDir || path.dirname(inputFilePath);
    const baseName = path.basename(inputFilePath, path.extname(inputFilePath));
    const outputFileName = `${baseName}.md`;
    const outputPath = path.join(outputDir, outputFileName);

    // Check if the base path is available
    const baseExists = await this._fileExists(outputPath);
    if (!baseExists) {
      return outputPath;
    }

    // Try suffixes _1 through _99
    for (let i = 1; i <= LIMITS.MAX_SUFFIX; i++) {
      const suffixedPath = path.join(outputDir, `${baseName}_${i}.md`);
      const exists = await this._fileExists(suffixedPath);
      if (!exists) {
        return suffixedPath;
      }
    }

    // All 99 suffixes are taken
    const error = new Error(
      `Cannot resolve output path for "${path.basename(inputFilePath)}": all ${LIMITS.MAX_SUFFIX} suffixes are taken`
    );
    error.code = ERROR_CODES.SUFFIX_LIMIT;
    throw error;
  }

  /**
   * Verifica que el directorio de salida tenga permisos de escritura.
   * @param {string} dirPath
   * @returns {Promise<boolean>}
   */
  async isWritable(dirPath) {
    try {
      await fs.access(dirPath, fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Escribe contenido markdown a la ruta determinada.
   * @param {string} outputPath - Ruta de destino
   * @param {string} content - Contenido markdown
   * @returns {Promise<void>}
   */
  async writeOutput(outputPath, content) {
    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(outputPath, content, 'utf-8');
  }

  /**
   * Checks if a file exists at the given path.
   * @param {string} filePath
   * @returns {Promise<boolean>}
   * @private
   */
  async _fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = { OutputManager };
