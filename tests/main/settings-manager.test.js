import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron-store as an ESM default export
vi.mock('electron-store', () => {
  const store = new Map();
  const MockStore = class {
    constructor(opts) {
      this.defaults = opts?.defaults || {};
      // Initialize defaults
      for (const [key, value] of Object.entries(this.defaults)) {
        if (!store.has(key)) {
          store.set(key, value);
        }
      }
    }
    get(key) {
      if (store.has(key)) {
        return store.get(key);
      }
      return this.defaults[key];
    }
    set(key, value) {
      store.set(key, value);
    }
    delete(key) {
      store.delete(key);
    }
  };
  // Expose the internal store for test resets
  MockStore._store = store;
  return { default: MockStore };
});

// Get reference to mock store for resetting between tests
let mockStoreMap;
beforeEach(async () => {
  const mod = await import('electron-store');
  mockStoreMap = mod.default._store;
  mockStoreMap.clear();
});

describe('SettingsManager', () => {
  let SettingsManager;

  beforeEach(async () => {
    // Reset module cache for fresh SettingsManager instances
    vi.resetModules();
    // Re-mock after reset
    vi.doMock('electron-store', () => {
      const store = new Map();
      const MockStore = class {
        constructor(opts) {
          this.defaults = opts?.defaults || {};
          for (const [key, value] of Object.entries(this.defaults)) {
            if (!store.has(key)) {
              store.set(key, value);
            }
          }
        }
        get(key) {
          if (store.has(key)) {
            return store.get(key);
          }
          return this.defaults[key];
        }
        set(key, value) {
          store.set(key, value);
        }
        delete(key) {
          store.delete(key);
        }
      };
      MockStore._store = store;
      return { default: MockStore };
    });

    const mod = await import('../../src/main/settings-manager.js');
    SettingsManager = mod.SettingsManager;
  });

  describe('getOutputDir()', () => {
    it('returns null when no output directory is set', async () => {
      const manager = new SettingsManager();
      const result = await manager.getOutputDir();
      expect(result).toBeNull();
    });

    it('returns the stored directory path after setOutputDir', async () => {
      const manager = new SettingsManager();
      await manager.setOutputDir('/Users/test/output');
      const result = await manager.getOutputDir();
      expect(result).toBe('/Users/test/output');
    });
  });

  describe('setOutputDir()', () => {
    it('persists a directory path', async () => {
      const manager = new SettingsManager();
      await manager.setOutputDir('/home/user/documents');
      const result = await manager.getOutputDir();
      expect(result).toBe('/home/user/documents');
    });

    it('clears the setting when null is passed', async () => {
      const manager = new SettingsManager();
      await manager.setOutputDir('/some/path');
      await manager.setOutputDir(null);
      const result = await manager.getOutputDir();
      expect(result).toBeNull();
    });

    it('clears the setting when undefined is passed', async () => {
      const manager = new SettingsManager();
      await manager.setOutputDir('/some/path');
      await manager.setOutputDir(undefined);
      const result = await manager.getOutputDir();
      expect(result).toBeNull();
    });

    it('overwrites previously stored directory', async () => {
      const manager = new SettingsManager();
      await manager.setOutputDir('/first/path');
      await manager.setOutputDir('/second/path');
      const result = await manager.getOutputDir();
      expect(result).toBe('/second/path');
    });
  });
});
