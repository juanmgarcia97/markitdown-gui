'use strict';

const path = require('path');
const fs = require('fs');
const { SUPPORTED_FORMATS, LIMITS, ERROR_CODES } = require('../shared/constants');

/**
 * Extensiones de texto plano que file-type no puede detectar por magic bytes.
 * Para estos formatos se omite la validación de MIME.
 */
const TEXT_BASED_EXTENSIONS = new Set([
  'txt', 'md', 'csv', 'json', 'jsonl', 'html', 'htm', 'xml', 'rss', 'atom',
]);

/**
 * Cached dynamic import of file-type (ESM module).
 * @type {Promise<{fileTypeFromFile: Function}> | null}
 */
let fileTypeModule = null;

function getFileType() {
  if (!fileTypeModule) {
    fileTypeModule = import('file-type');
  }
  return fileTypeModule;
}

class FileValidator {
  /**
   * Valida un conjunto de rutas de archivo.
   * Ejecuta todas las validaciones para cada archivo y devuelve un resultado por archivo.
   * @param {string[]} filePaths - Rutas a validar
   * @param {string[]} existingPaths - Rutas ya presentes (para detectar duplicados)
   * @returns {Promise<ValidationResult[]>}
   */
  async validate(filePaths, existingPaths = []) {
    const normalizedExisting = existingPaths.map((p) => path.resolve(p));
    const results = [];

    for (const filePath of filePaths) {
      const result = await this._validateSingleFile(filePath, normalizedExisting);
      results.push(result);
    }

    return results;
  }

  /**
   * Verifica extensión contra la lista de formatos soportados (case-insensitive).
   * @param {string} filePath
   * @returns {boolean}
   */
  isSupportedExtension(filePath) {
    const ext = this._getExtension(filePath);
    return ext !== '' && Object.prototype.hasOwnProperty.call(SUPPORTED_FORMATS, ext);
  }

  /**
   * Detecta el tipo MIME real mediante magic bytes usando file-type.
   * @param {string} filePath
   * @returns {Promise<{mime: string, ext: string} | null>}
   */
  async detectMimeType(filePath) {
    try {
      const { fileTypeFromFile } = await getFileType();
      const result = await fileTypeFromFile(filePath);
      if (!result) {
        return null;
      }
      return { mime: result.mime, ext: result.ext };
    } catch {
      return null;
    }
  }

  /**
   * Valida que el MIME detectado corresponda a la extensión del archivo.
   * Para formatos basados en texto (que file-type no detecta), retorna valid: true.
   * @param {string} filePath
   * @returns {Promise<{valid: boolean, detectedMime?: string}>}
   */
  async validateMimeMatch(filePath) {
    const ext = this._getExtension(filePath);

    // Text-based formats cannot be detected by magic bytes, skip validation
    if (TEXT_BASED_EXTENSIONS.has(ext)) {
      return { valid: true };
    }

    const detected = await this.detectMimeType(filePath);

    // If file-type cannot determine MIME (e.g., unknown format), skip validation
    if (!detected) {
      return { valid: true };
    }

    const acceptedMimes = SUPPORTED_FORMATS[ext];
    if (!acceptedMimes) {
      return { valid: false, detectedMime: detected.mime };
    }

    const isValid = acceptedMimes.includes(detected.mime);
    return isValid ? { valid: true } : { valid: false, detectedMime: detected.mime };
  }

  /**
   * Detecta secuencias de path traversal.
   * Busca '../' o '..\' en la ruta cruda, y verifica que la ruta resuelta
   * no escape del directorio padre.
   * @param {string} filePath
   * @returns {boolean}
   */
  hasPathTraversal(filePath) {
    // Check raw path for traversal sequences
    if (filePath.includes('../') || filePath.includes('..\\')) {
      return true;
    }

    // Check if the resolved path escapes the parent directory
    const resolved = path.resolve(filePath);
    const dir = path.dirname(filePath);
    const resolvedDir = path.resolve(dir);

    // If the path contains '..' that resolves outside the logical parent
    if (resolved !== path.resolve(resolvedDir, path.basename(filePath))) {
      return true;
    }

    return false;
  }

  /**
   * Verifica que el tamaño del archivo no exceda 500 MB.
   * @param {string} filePath
   * @returns {Promise<boolean>}
   */
  async isWithinSizeLimit(filePath) {
    try {
      const stats = await fs.promises.stat(filePath);
      return stats.size <= LIMITS.MAX_FILE_SIZE;
    } catch {
      return false;
    }
  }

  /**
   * Validates a single file through all checks.
   * @private
   * @param {string} filePath
   * @param {string[]} normalizedExisting - Already resolved existing paths
   * @returns {Promise<ValidationResult>}
   */
  async _validateSingleFile(filePath, normalizedExisting) {
    const fileName = path.basename(filePath);
    const baseResult = { path: filePath, fileName, valid: false };

    // 1. Path traversal check
    if (this.hasPathTraversal(filePath)) {
      return { ...baseResult, error: ERROR_CODES.PATH_TRAVERSAL };
    }

    // 2. Duplicate check
    const normalizedPath = path.resolve(filePath);
    if (normalizedExisting.includes(normalizedPath)) {
      return { ...baseResult, error: ERROR_CODES.DUPLICATE };
    }

    // 3. Extension check
    if (!this.isSupportedExtension(filePath)) {
      return { ...baseResult, error: ERROR_CODES.UNSUPPORTED_EXTENSION };
    }

    // 4. File size check
    let fileSize;
    try {
      const stats = await fs.promises.stat(filePath);
      fileSize = stats.size;
    } catch {
      return { ...baseResult, error: ERROR_CODES.UNREADABLE };
    }

    if (fileSize > LIMITS.MAX_FILE_SIZE) {
      return { ...baseResult, error: ERROR_CODES.TOO_LARGE, fileSize };
    }

    // 5. MIME match check
    const mimeResult = await this.validateMimeMatch(filePath);
    if (!mimeResult.valid) {
      return {
        ...baseResult,
        error: ERROR_CODES.MIME_MISMATCH,
        fileSize,
        detectedMime: mimeResult.detectedMime,
      };
    }

    // All checks passed
    return { path: filePath, fileName, valid: true, fileSize };
  }

  /**
   * Extracts the file extension in lowercase (without the dot).
   * @private
   * @param {string} filePath
   * @returns {string}
   */
  _getExtension(filePath) {
    const ext = path.extname(filePath);
    return ext ? ext.slice(1).toLowerCase() : '';
  }
}

module.exports = { FileValidator };
