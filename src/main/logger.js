'use strict';

const fs = require('fs');
const path = require('path');

const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * Resolves the log directory path.
 * Uses electron's app.getPath('userData') when available,
 * falls back to os.tmpdir() for test environments or before app is ready.
 */
function resolveLogDir() {
  try {
    const { app } = require('electron');
    if (app && app.isReady()) {
      return app.getPath('userData');
    }
    // App not ready yet — try getPath anyway (works in some Electron versions)
    try {
      return app.getPath('userData');
    } catch {
      // Fall through to fallback
    }
  } catch {
    // electron not available (test environment)
  }
  const os = require('os');
  return os.tmpdir();
}

let _logFilePath = null;

/**
 * Returns the path to the log file, creating the directory if needed.
 * @returns {string}
 */
function getLogFilePath() {
  if (_logFilePath) return _logFilePath;
  const dir = resolveLogDir();
  _logFilePath = path.join(dir, 'markitdown-gui.log');
  return _logFilePath;
}

/**
 * Truncates the log file from the beginning if it exceeds MAX_LOG_SIZE.
 * Keeps roughly the last half of the file.
 */
function rotateIfNeeded(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_LOG_SIZE) {
      const content = fs.readFileSync(filePath, 'utf-8');
      // Keep the last ~60% of content
      const keepFrom = Math.floor(content.length * 0.4);
      const newlineIdx = content.indexOf('\n', keepFrom);
      const truncated = newlineIdx !== -1 ? content.slice(newlineIdx + 1) : content.slice(keepFrom);
      fs.writeFileSync(filePath, truncated, 'utf-8');
    }
  } catch {
    // File may not exist yet or other I/O issue — ignore
  }
}

/**
 * Formats a log line.
 * @param {'INFO'|'WARN'|'ERROR'} level
 * @param {string} message
 * @param {any[]} args
 * @returns {string}
 */
function formatLine(level, message, args) {
  const timestamp = new Date().toISOString();
  const extra = args.length > 0
    ? ' ' + args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
    : '';
  return `[${timestamp}] [${level}] ${message}${extra}\n`;
}

/**
 * Writes a log line to file and console.
 * @param {'INFO'|'WARN'|'ERROR'} level
 * @param {string} message
 * @param {any[]} args
 */
function write(level, message, args) {
  const line = formatLine(level, message, args);

  // Console output
  if (level === 'ERROR') {
    console.error(line.trimEnd());
  } else if (level === 'WARN') {
    console.warn(line.trimEnd());
  } else {
    console.log(line.trimEnd());
  }

  // File output
  try {
    const filePath = getLogFilePath();
    rotateIfNeeded(filePath);
    fs.appendFileSync(filePath, line, 'utf-8');
  } catch {
    // Silently fail file writes — don't crash the app over logging
  }
}

const log = {
  info(message, ...args) {
    write('INFO', message, args);
  },
  warn(message, ...args) {
    write('WARN', message, args);
  },
  error(message, ...args) {
    write('ERROR', message, args);
  },
  /**
   * Returns the resolved log file path.
   * @returns {string}
   */
  getLogPath() {
    return getLogFilePath();
  },
};

module.exports = { log };
