'use strict';

const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { EventEmitter } = require('events');

const { LIMITS, ERROR_CODES } = require('../shared/constants');
const { log } = require('./logger');

/**
 * PythonBridge gestiona el ciclo de vida del proceso Python embebido
 * y la comunicación mediante JSON delimitado por newline (stdin/stdout).
 */
class PythonBridge extends EventEmitter {
  /**
   * @param {Object} [options]
   * @param {string} [options.pythonPath] - Ruta explícita al ejecutable Python (para testing)
   * @param {string} [options.workerPath] - Ruta explícita al worker.py (para testing)
   * @param {number} [options.conversionTimeout] - Timeout de conversión en ms (default 120000)
   * @param {number} [options.healthCheckTimeout] - Timeout de health check en ms (default 10000)
   */
  constructor(options = {}) {
    super();

    this._options = options;
    this._conversionTimeout = options.conversionTimeout || LIMITS.CONVERSION_TIMEOUT;
    this._healthCheckTimeout = options.healthCheckTimeout || LIMITS.HEALTH_CHECK_TIMEOUT;

    /** @type {import('child_process').ChildProcess|null} */
    this._process = null;

    /** @type {Map<string, {resolve: Function, reject: Function, timer: NodeJS.Timeout}>} */
    this._pendingRequests = new Map();

    /** @type {readline.Interface|null} */
    this._lineReader = null;

    this._initialized = false;
    this._shuttingDown = false;
    this._restarting = false;
  }

  /**
   * Inicia el proceso Python embebido y verifica su disponibilidad.
   * @returns {Promise<void>}
   * @throws {Error} si el ejecutable no existe o no responde en 10s
   */
  async initialize() {
    const pythonPath = this._resolvePythonPath();
    const workerPath = this._resolveWorkerPath();

    log.info('PythonBridge initializing', { pythonPath, workerPath });

    this._spawnProcess(pythonPath, workerPath);
    this._setupLineReader();
    this._setupProcessListeners();

    const healthy = await this.healthCheck();
    if (!healthy) {
      log.error('PythonBridge health check failed during initialization');
      this._killProcess();
      const error = new Error(
        'Python environment is not available or markitdown failed to load. ' +
        'Please reinstall the application.'
      );
      error.code = ERROR_CODES.HEALTH_CHECK_FAILED;
      throw error;
    }

    log.info('PythonBridge initialized successfully');
    this._initialized = true;
  }

  /**
   * Envía un comando de conversión y espera la respuesta.
   * @param {string} filePath - Ruta absoluta del archivo a convertir
   * @param {string} [requestId] - UUID identificador de la solicitud
   * @returns {Promise<{id: string, success: boolean, markdown?: string, error?: string}>}
   */
  async convert(filePath, requestId) {
    const id = requestId || crypto.randomUUID();

    log.info(`Converting file: ${filePath} (request: ${id})`);

    const command = {
      type: 'convert',
      id,
      filePath,
    };

    const response = await this._sendCommand(command, this._conversionTimeout);
    if (response.success) {
      log.info(`Conversion succeeded: ${filePath} (request: ${id})`);
    } else {
      log.error(`Conversion failed: ${filePath} (request: ${id})`, response.error || 'unknown error');
    }
    return response;
  }

  /**
   * Envía un comando de prueba para verificar disponibilidad.
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    const id = crypto.randomUUID();
    const command = { type: 'health', id };

    try {
      const response = await this._sendCommand(command, this._healthCheckTimeout);
      const ok = response.status === 'ok';
      log.info(`Health check result: ${ok ? 'OK' : 'FAILED'}`);
      return ok;
    } catch (err) {
      log.error('Health check error:', err.message);
      return false;
    }
  }

  /**
   * Reinicia el proceso Python tras un crash.
   * @returns {Promise<void>}
   */
  async restart() {
    this._restarting = true;
    this._killProcess();

    const pythonPath = this._resolvePythonPath();
    const workerPath = this._resolveWorkerPath();

    this._spawnProcess(pythonPath, workerPath);
    this._setupLineReader();
    this._setupProcessListeners();
    this._restarting = false;

    const healthy = await this.healthCheck();
    if (!healthy) {
      this._killProcess();
      const error = new Error(
        'Failed to restart Python process. Health check failed.'
      );
      error.code = ERROR_CODES.HEALTH_CHECK_FAILED;
      throw error;
    }

    this._initialized = true;
  }

  /**
   * Termina el proceso Python de forma limpia.
   * @returns {Promise<void>}
   */
  async shutdown() {
    if (!this._process || this._shuttingDown) {
      return;
    }

    this._shuttingDown = true;
    const id = crypto.randomUUID();
    const command = { type: 'shutdown', id };

    try {
      await this._sendCommand(command, 5000);
    } catch {
      // If shutdown command fails, force kill
    }

    // Give the process a brief moment to exit, then force kill
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this._killProcess();
        resolve();
      }, 1000);

      if (this._process) {
        this._process.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      } else {
        clearTimeout(timeout);
        resolve();
      }
    });

    this._cleanup();
  }

  // ─── Internal Methods ───────────────────────────────────────────────

  /**
   * Determina la ruta al ejecutable Python según plataforma y modo (dev/packaged).
   * @returns {string}
   */
  _resolvePythonPath() {
    if (this._options.pythonPath) {
      return this._options.pythonPath;
    }

    const isPackaged = this._isPackaged();
    const basePath = isPackaged ? this._getPackagedBasePath() : this._getDevBasePath();

    if (process.platform === 'win32') {
      return path.join(basePath, 'python-env', 'python.exe');
    }
    return path.join(basePath, 'python-env', 'bin', 'python3');
  }

  /**
   * Determina la ruta al script worker.py.
   * @returns {string}
   */
  _resolveWorkerPath() {
    if (this._options.workerPath) {
      return this._options.workerPath;
    }

    const isPackaged = this._isPackaged();
    if (isPackaged) {
      // In packaged mode, src/python is an extraResource in the Resources folder
      return path.join(this._getPackagedBasePath(), 'python', 'worker.py');
    }
    return path.join(this._getDevBasePath(), 'src', 'python', 'worker.py');
  }

  /**
   * Determina si la aplicación está empaquetada.
   * @returns {boolean}
   */
  _isPackaged() {
    try {
      const { app } = require('electron');
      return app.isPackaged;
    } catch {
      return false;
    }
  }

  /**
   * Obtiene la ruta base en modo empaquetado.
   * Uses process.resourcesPath to locate extraResource files.
   * @returns {string}
   */
  _getPackagedBasePath() {
    // extraResource items are placed directly inside the Resources directory
    // accessible via process.resourcesPath
    if (process.resourcesPath) {
      return process.resourcesPath;
    }
    try {
      const { app } = require('electron');
      return path.join(path.dirname(app.getPath('exe')), 'Resources');
    } catch {
      return process.cwd();
    }
  }

  /**
   * Obtiene la ruta base en modo desarrollo (raíz del proyecto).
   * @returns {string}
   */
  _getDevBasePath() {
    return path.resolve(__dirname, '..', '..');
  }

  /**
   * Inicia el proceso Python.
   * @param {string} pythonPath
   * @param {string} workerPath
   */
  _spawnProcess(pythonPath, workerPath) {
    log.info(`Spawning Python process: ${pythonPath} ${workerPath}`);
    this._process = spawn(pythonPath, [workerPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    log.info(`Python process spawned (pid: ${this._process.pid})`);
  }

  /**
   * Configura la lectura línea por línea del stdout del proceso.
   */
  _setupLineReader() {
    if (this._lineReader) {
      this._lineReader.close();
    }

    this._lineReader = readline.createInterface({
      input: this._process.stdout,
      crlfDelay: Infinity,
    });

    this._lineReader.on('line', (line) => {
      this._handleLine(line);
    });
  }

  /**
   * Configura listeners de eventos del proceso (exit, error).
   */
  _setupProcessListeners() {
    this._process.on('exit', (code, signal) => {
      log.warn(`Python process exited (code: ${code}, signal: ${signal})`);
      if (!this._shuttingDown) {
        this._handleProcessExit(code, signal);
      }
    });

    this._process.on('error', (err) => {
      log.error(`Python process error: ${err.message}`);
      if (!this._shuttingDown) {
        this._handleProcessError(err);
      }
    });
  }

  /**
   * Procesa una línea recibida del stdout del proceso Python.
   * @param {string} line
   */
  _handleLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return;

    let response;
    try {
      response = JSON.parse(trimmed);
    } catch {
      // Ignore non-JSON output
      return;
    }

    const id = response.id;
    if (!id) return;

    const pending = this._pendingRequests.get(id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this._pendingRequests.delete(id);
    pending.resolve(response);
  }

  /**
   * Maneja la terminación inesperada del proceso Python.
   * @param {number|null} code
   * @param {string|null} signal
   */
  _handleProcessExit(code, signal) {
    // Reject all pending requests with PROCESS_CRASH error
    for (const [id, pending] of this._pendingRequests) {
      clearTimeout(pending.timer);
      const error = new Error(
        `Python process terminated unexpectedly (code: ${code}, signal: ${signal})`
      );
      error.code = ERROR_CODES.PROCESS_CRASH;
      pending.reject(error);
    }
    this._pendingRequests.clear();

    this.emit('process-exit', { code, signal });

    // Auto-restart after crash (but not during explicit restart or shutdown)
    if (this._initialized && !this._shuttingDown && !this._restarting) {
      this.restart().catch((err) => {
        this.emit('restart-failed', err);
      });
    }
  }

  /**
   * Maneja errores del proceso (e.g., ejecutable no encontrado).
   * @param {Error} err
   */
  _handleProcessError(err) {
    // Reject all pending requests
    for (const [id, pending] of this._pendingRequests) {
      clearTimeout(pending.timer);
      const error = new Error(`Python process error: ${err.message}`);
      error.code = ERROR_CODES.PYTHON_NOT_FOUND;
      pending.reject(error);
    }
    this._pendingRequests.clear();

    this.emit('process-error', err);
  }

  /**
   * Envía un comando JSON al proceso Python y espera la respuesta.
   * @param {Object} command - Comando a enviar
   * @param {number} timeout - Timeout en ms
   * @returns {Promise<Object>}
   */
  _sendCommand(command, timeout) {
    return new Promise((resolve, reject) => {
      if (!this._process || !this._process.stdin || !this._process.stdin.writable) {
        const error = new Error('Python process is not running');
        error.code = ERROR_CODES.PROCESS_CRASH;
        return reject(error);
      }

      const id = command.id;

      const timer = setTimeout(() => {
        this._pendingRequests.delete(id);
        const error = new Error(
          `Operation timed out after ${timeout}ms for request ${id}`
        );
        error.code = ERROR_CODES.TIMEOUT;
        reject(error);

        // Kill process on conversion timeout to prevent stuck state
        if (timeout === this._conversionTimeout) {
          this._killProcess();
        }
      }, timeout);

      this._pendingRequests.set(id, { resolve, reject, timer });

      const json = JSON.stringify(command) + '\n';
      this._process.stdin.write(json, (err) => {
        if (err) {
          clearTimeout(timer);
          this._pendingRequests.delete(id);
          const writeError = new Error(`Failed to write to Python process: ${err.message}`);
          writeError.code = ERROR_CODES.PROCESS_CRASH;
          reject(writeError);
        }
      });
    });
  }

  /**
   * Mata el proceso Python de forma inmediata.
   */
  _killProcess() {
    if (this._process) {
      // Remove all listeners to prevent ghost events from dead process
      this._process.removeAllListeners();
      if (this._process.stdout) {
        this._process.stdout.removeAllListeners();
      }
      if (this._process.stderr) {
        this._process.stderr.removeAllListeners();
      }
      try {
        this._process.kill('SIGTERM');
      } catch {
        // Process may already be dead
      }
      this._process = null;
    }

    if (this._lineReader) {
      this._lineReader.close();
      this._lineReader = null;
    }
  }

  /**
   * Limpieza final de recursos.
   */
  _cleanup() {
    // Clear all pending requests
    for (const [id, pending] of this._pendingRequests) {
      clearTimeout(pending.timer);
    }
    this._pendingRequests.clear();

    this._killProcess();
    this._initialized = false;
    this._shuttingDown = false;
    this._restarting = false;
  }
}

module.exports = { PythonBridge };
