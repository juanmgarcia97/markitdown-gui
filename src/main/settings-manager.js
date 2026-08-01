'use strict';

/**
 * Persiste preferencias del usuario entre sesiones usando electron-store.
 * Gestiona la configuración del directorio de salida personalizado.
 */
class SettingsManager {
  constructor() {
    this._store = null;
    this._storePromise = null;
  }

  /**
   * Lazily initializes the electron-store instance.
   * Uses dynamic import since electron-store v11 is ESM-only.
   * @returns {Promise<object>} The store instance
   * @private
   */
  async _getStore() {
    if (this._store) {
      return this._store;
    }
    if (!this._storePromise) {
      this._storePromise = import('electron-store').then(({ default: Store }) => {
        this._store = new Store({
          name: 'markitdown-gui-settings',
          defaults: {
            outputDir: null,
          },
        });
        return this._store;
      });
    }
    return this._storePromise;
  }

  /**
   * Obtiene el directorio de salida personalizado.
   * @returns {Promise<string|null>} La ruta del directorio o null si no está configurado
   */
  async getOutputDir() {
    const store = await this._getStore();
    return store.get('outputDir') || null;
  }

  /**
   * Establece el directorio de salida personalizado.
   * @param {string|null} dirPath - La ruta del directorio, o null para limpiar la configuración
   */
  async setOutputDir(dirPath) {
    const store = await this._getStore();
    if (dirPath === null || dirPath === undefined) {
      store.delete('outputDir');
    } else {
      store.set('outputDir', dirPath);
    }
  }
}

module.exports = { SettingsManager };
