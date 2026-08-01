'use strict';

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependency modules that have their own complex requires
vi.mock('../../src/main/file-validator', () => ({
  FileValidator: vi.fn(),
}));
vi.mock('../../src/main/output-manager', () => ({
  OutputManager: vi.fn(),
}));
vi.mock('../../src/main/batch-processor', () => ({
  BatchProcessor: vi.fn(),
}));
vi.mock('../../src/main/python-bridge', () => ({
  PythonBridge: vi.fn(),
}));
vi.mock('../../src/main/settings-manager', () => ({
  SettingsManager: vi.fn(),
}));

import { registerIpcHandlers } from '../../src/main/ipc-handlers';

describe('ipc-handlers', () => {
  let mainWindow;
  let mockElectron;
  let mockFileValidator;
  let mockOutputManager;
  let mockPythonBridge;
  let mockBatchProcessor;
  let mockSettingsManager;
  let handlers;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock electron modules
    mockElectron = {
      ipcMain: { handle: vi.fn() },
      dialog: { showOpenDialog: vi.fn() },
      shell: { openPath: vi.fn() },
      clipboard: { writeText: vi.fn() },
    };

    // Collect registered handlers
    handlers = {};
    mockElectron.ipcMain.handle.mockImplementation((channel, handler) => {
      handlers[channel] = handler;
    });

    mainWindow = {
      isDestroyed: vi.fn().mockReturnValue(false),
      webContents: {
        send: vi.fn(),
      },
    };

    mockFileValidator = {
      validate: vi.fn().mockResolvedValue([]),
    };

    mockOutputManager = {
      resolveOutputPath: vi.fn(),
      writeOutput: vi.fn(),
    };

    mockPythonBridge = {
      convert: vi.fn(),
      initialize: vi.fn(),
      shutdown: vi.fn(),
    };

    mockBatchProcessor = {
      process: vi.fn().mockResolvedValue({ successful: 1, failed: 0, cancelled: 0, totalTimeMs: 100, results: [] }),
      cancel: vi.fn(),
      isProcessing: vi.fn().mockReturnValue(false),
    };

    mockSettingsManager = {
      getOutputDir: vi.fn().mockResolvedValue(null),
      setOutputDir: vi.fn().mockResolvedValue(undefined),
    };

    registerIpcHandlers(mainWindow, {
      electron: mockElectron,
      fileValidator: mockFileValidator,
      outputManager: mockOutputManager,
      pythonBridge: mockPythonBridge,
      batchProcessor: mockBatchProcessor,
      settingsManager: mockSettingsManager,
    });
  });

  describe('handler registration', () => {
    it('registers all expected IPC channels', () => {
      const expectedChannels = [
        'open-file-dialog',
        'validate-files',
        'extract-folder-files',
        'start-conversion',
        'cancel-conversion',
        'select-output-dir',
        'get-output-dir',
        'open-output-folder',
        'read-markdown-file',
        'copy-to-clipboard',
      ];

      for (const channel of expectedChannels) {
        expect(handlers[channel]).toBeDefined();
      }
    });
  });

  describe('open-file-dialog', () => {
    it('returns file paths when user selects files', async () => {
      mockElectron.dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path/to/file.pdf', '/path/to/file.docx'],
      });

      const result = await handlers['open-file-dialog']();

      expect(mockElectron.dialog.showOpenDialog).toHaveBeenCalledWith(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: expect.arrayContaining([
          expect.objectContaining({ name: 'Supported Files' }),
        ]),
      });
      expect(result).toEqual(['/path/to/file.pdf', '/path/to/file.docx']);
    });

    it('returns empty array when dialog is cancelled', async () => {
      mockElectron.dialog.showOpenDialog.mockResolvedValue({
        canceled: true,
        filePaths: [],
      });

      const result = await handlers['open-file-dialog']();
      expect(result).toEqual([]);
    });

    it('includes supported extensions in the dialog filter', async () => {
      mockElectron.dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
      await handlers['open-file-dialog']();

      const filters = mockElectron.dialog.showOpenDialog.mock.calls[0][1].filters;
      const supportedFilter = filters.find((f) => f.name === 'Supported Files');
      expect(supportedFilter.extensions).toContain('pdf');
      expect(supportedFilter.extensions).toContain('docx');
      expect(supportedFilter.extensions).toContain('png');
    });
  });

  describe('validate-files', () => {
    it('delegates to FileValidator.validate', async () => {
      const paths = ['/file1.pdf', '/file2.docx'];
      const existing = ['/existing.pdf'];
      const mockResult = [
        { path: '/file1.pdf', fileName: 'file1.pdf', valid: true },
        { path: '/file2.docx', fileName: 'file2.docx', valid: true },
      ];
      mockFileValidator.validate.mockResolvedValue(mockResult);

      const result = await handlers['validate-files']({}, paths, existing);

      expect(mockFileValidator.validate).toHaveBeenCalledWith(paths, existing);
      expect(result).toEqual(mockResult);
    });

    it('defaults existingPaths to empty array when not provided', async () => {
      await handlers['validate-files']({}, ['/file.pdf'], undefined);
      expect(mockFileValidator.validate).toHaveBeenCalledWith(['/file.pdf'], []);
    });
  });

  describe('extract-folder-files', () => {
    it('returns file paths from first level of folder', async () => {
      const { promises: fsPromises } = await import('fs');
      vi.spyOn(fsPromises, 'readdir').mockResolvedValue([
        { name: 'file1.pdf', isFile: () => true },
        { name: 'subfolder', isFile: () => false },
        { name: 'file2.docx', isFile: () => true },
      ]);

      const result = await handlers['extract-folder-files']({}, '/my/folder');

      expect(result).toEqual(['/my/folder/file1.pdf', '/my/folder/file2.docx']);

      fsPromises.readdir.mockRestore();
    });

    it('returns empty array on error', async () => {
      const { promises: fsPromises } = await import('fs');
      vi.spyOn(fsPromises, 'readdir').mockRejectedValue(new Error('ENOENT'));

      const result = await handlers['extract-folder-files']({}, '/nonexistent');
      expect(result).toEqual([]);

      fsPromises.readdir.mockRestore();
    });
  });

  describe('start-conversion', () => {
    it('calls batchProcessor.process with onProgress callback', async () => {
      const files = [{ path: '/file.pdf', name: 'file.pdf' }];
      const outputDir = '/output';

      await handlers['start-conversion']({}, files, outputDir);

      expect(mockBatchProcessor.process).toHaveBeenCalledWith(
        files,
        outputDir,
        expect.any(Function)
      );
    });

    it('sends progress-update to renderer via mainWindow', async () => {
      mockBatchProcessor.process.mockImplementation(async (files, dir, onProgress) => {
        onProgress({ percentage: 50, currentFile: 'file.pdf', currentIndex: 1, totalFiles: 2 });
        return { successful: 1, failed: 0, cancelled: 0, totalTimeMs: 50, results: [] };
      });

      await handlers['start-conversion']({}, [], null);

      expect(mainWindow.webContents.send).toHaveBeenCalledWith('progress-update', {
        percentage: 50,
        currentFile: 'file.pdf',
        currentIndex: 1,
        totalFiles: 2,
      });
    });

    it('sends conversion-complete event on success', async () => {
      const batchResult = { successful: 2, failed: 0, cancelled: 0, totalTimeMs: 200, results: [] };
      mockBatchProcessor.process.mockResolvedValue(batchResult);

      await handlers['start-conversion']({}, [], null);

      expect(mainWindow.webContents.send).toHaveBeenCalledWith('conversion-complete', batchResult);
    });

    it('sends conversion-error event on failure', async () => {
      const error = new Error('Process crashed');
      error.code = 'process_crash';
      mockBatchProcessor.process.mockRejectedValue(error);

      await expect(handlers['start-conversion']({}, [], null)).rejects.toThrow('Process crashed');

      expect(mainWindow.webContents.send).toHaveBeenCalledWith('conversion-error', {
        message: 'Process crashed',
        code: 'process_crash',
      });
    });

    it('does not send to destroyed window', async () => {
      mainWindow.isDestroyed.mockReturnValue(true);
      mockBatchProcessor.process.mockImplementation(async (files, dir, onProgress) => {
        onProgress({ percentage: 100 });
        return { successful: 1, failed: 0, cancelled: 0, totalTimeMs: 10, results: [] };
      });

      await handlers['start-conversion']({}, [], null);

      expect(mainWindow.webContents.send).not.toHaveBeenCalled();
    });
  });

  describe('cancel-conversion', () => {
    it('calls batchProcessor.cancel', () => {
      handlers['cancel-conversion']({});
      expect(mockBatchProcessor.cancel).toHaveBeenCalled();
    });
  });

  describe('select-output-dir', () => {
    it('returns selected directory and persists it', async () => {
      mockElectron.dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/selected/output'],
      });

      const result = await handlers['select-output-dir']();

      expect(mockElectron.dialog.showOpenDialog).toHaveBeenCalledWith(mainWindow, {
        properties: ['openDirectory', 'createDirectory'],
      });
      expect(mockSettingsManager.setOutputDir).toHaveBeenCalledWith('/selected/output');
      expect(result).toBe('/selected/output');
    });

    it('returns null when dialog is cancelled', async () => {
      mockElectron.dialog.showOpenDialog.mockResolvedValue({
        canceled: true,
        filePaths: [],
      });

      const result = await handlers['select-output-dir']();
      expect(result).toBeNull();
      expect(mockSettingsManager.setOutputDir).not.toHaveBeenCalled();
    });
  });

  describe('get-output-dir', () => {
    it('returns value from SettingsManager', async () => {
      mockSettingsManager.getOutputDir.mockResolvedValue('/custom/dir');
      const result = await handlers['get-output-dir']();
      expect(result).toBe('/custom/dir');
    });
  });

  describe('open-output-folder', () => {
    it('opens folder with shell.openPath', async () => {
      mockElectron.shell.openPath.mockResolvedValue('');
      await handlers['open-output-folder']({}, '/output/dir');
      expect(mockElectron.shell.openPath).toHaveBeenCalledWith('/output/dir');
    });
  });

  describe('read-markdown-file', () => {
    it('reads and returns file content', async () => {
      const { promises: fsPromises } = await import('fs');
      vi.spyOn(fsPromises, 'readFile').mockResolvedValue('# Hello World');

      const result = await handlers['read-markdown-file']({}, '/path/to/file.md');
      expect(fsPromises.readFile).toHaveBeenCalledWith('/path/to/file.md', 'utf-8');
      expect(result).toBe('# Hello World');

      fsPromises.readFile.mockRestore();
    });
  });

  describe('copy-to-clipboard', () => {
    it('copies text using clipboard.writeText', () => {
      handlers['copy-to-clipboard']({}, 'Hello clipboard');
      expect(mockElectron.clipboard.writeText).toHaveBeenCalledWith('Hello clipboard');
    });
  });
});
