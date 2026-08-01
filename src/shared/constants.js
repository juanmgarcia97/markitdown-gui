'use strict';

/**
 * Mapa de extensiones de archivo soportadas a sus tipos MIME válidos.
 * Cada clave es una extensión (sin punto) y el valor es un array de tipos MIME aceptados.
 */
const SUPPORTED_FORMATS = {
  // Documentos
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  xls: ['application/vnd.ms-excel'],
  // Web
  html: ['text/html'],
  htm: ['text/html'],
  // Datos
  csv: ['text/csv', 'text/plain'],
  json: ['application/json'],
  jsonl: ['application/json', 'text/plain'],
  xml: ['application/xml', 'text/xml'],
  rss: ['application/rss+xml', 'application/xml', 'text/xml'],
  atom: ['application/atom+xml', 'application/xml', 'text/xml'],
  // Texto
  txt: ['text/plain'],
  md: ['text/plain', 'text/markdown'],
  // Imágenes
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  // Audio
  wav: ['audio/wav', 'audio/x-wav'],
  mp3: ['audio/mpeg'],
  m4a: ['audio/mp4', 'audio/x-m4a'],
  mp4: ['video/mp4'],
  // Otros
  epub: ['application/epub+zip'],
  ipynb: ['application/json'],
  msg: ['application/vnd.ms-outlook'],
  zip: ['application/zip'],
};

/**
 * Límites operacionales de la aplicación.
 */
const LIMITS = {
  MAX_FILE_SIZE: 500 * 1024 * 1024, // 500 MB in bytes
  MAX_FILES: 100,
  MAX_SUFFIX: 99,
  CONVERSION_TIMEOUT: 120000, // 120 seconds in ms
  HEALTH_CHECK_TIMEOUT: 10000, // 10 seconds in ms
};

/**
 * Códigos de error utilizados para identificar fallos específicos de validación y ejecución.
 */
const ERROR_CODES = {
  UNSUPPORTED_EXTENSION: 'unsupported_extension',
  MIME_MISMATCH: 'mime_mismatch',
  PATH_TRAVERSAL: 'path_traversal',
  TOO_LARGE: 'too_large',
  DUPLICATE: 'duplicate',
  UNREADABLE: 'unreadable',
  WRITE_PERMISSION: 'write_permission',
  SUFFIX_LIMIT: 'suffix_limit',
  TIMEOUT: 'timeout',
  PROCESS_CRASH: 'process_crash',
  PYTHON_NOT_FOUND: 'python_not_found',
  HEALTH_CHECK_FAILED: 'health_check_failed',
};

module.exports = {
  SUPPORTED_FORMATS,
  LIMITS,
  ERROR_CODES,
};
