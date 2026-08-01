/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the markitdownAPI on window before importing the module
beforeEach(() => {
  // Set up minimal DOM
  document.body.innerHTML = `
    <div id="drop-zone"></div>
    <button id="btn-add-files"></button>
  `;

  window.markitdownAPI = {
    openFileDialog: vi.fn(),
    validateFiles: vi.fn(),
    extractFolderFiles: vi.fn(),
  };
});

afterEach(() => {
  document.body.innerHTML = '';
  delete window.markitdownAPI;
  vi.resetModules();
});

describe('drag-drop module', () => {
  describe('initDragDrop', () => {
    it('should add drag-over class on dragenter', async () => {
      const { initDragDrop } = await import('../../src/renderer/drag-drop.js');
      const onFilesValidated = vi.fn();
      const getExistingPaths = vi.fn(() => []);

      initDragDrop({ onFilesValidated, getExistingPaths });

      const dropZone = document.getElementById('drop-zone');
      const event = new Event('dragenter', { bubbles: true });
      event.preventDefault = vi.fn();
      event.stopPropagation = vi.fn();
      dropZone.dispatchEvent(event);

      expect(dropZone.classList.contains('drag-over')).toBe(true);
    });

    it('should keep drag-over class during dragover', async () => {
      const { initDragDrop } = await import('../../src/renderer/drag-drop.js');
      const onFilesValidated = vi.fn();
      const getExistingPaths = vi.fn(() => []);

      initDragDrop({ onFilesValidated, getExistingPaths });

      const dropZone = document.getElementById('drop-zone');

      // Simulate dragenter first
      const enterEvent = new Event('dragenter', { bubbles: true });
      enterEvent.preventDefault = vi.fn();
      enterEvent.stopPropagation = vi.fn();
      dropZone.dispatchEvent(enterEvent);

      // Then dragover
      const overEvent = new Event('dragover', { bubbles: true });
      overEvent.preventDefault = vi.fn();
      overEvent.stopPropagation = vi.fn();
      dropZone.dispatchEvent(overEvent);

      expect(dropZone.classList.contains('drag-over')).toBe(true);
    });

    it('should remove drag-over class on dragleave when counter reaches 0', async () => {
      const { initDragDrop } = await import('../../src/renderer/drag-drop.js');
      const onFilesValidated = vi.fn();
      const getExistingPaths = vi.fn(() => []);

      initDragDrop({ onFilesValidated, getExistingPaths });

      const dropZone = document.getElementById('drop-zone');

      // Enter
      const enterEvent = new Event('dragenter', { bubbles: true });
      enterEvent.preventDefault = vi.fn();
      enterEvent.stopPropagation = vi.fn();
      dropZone.dispatchEvent(enterEvent);

      expect(dropZone.classList.contains('drag-over')).toBe(true);

      // Leave
      const leaveEvent = new Event('dragleave', { bubbles: true });
      leaveEvent.preventDefault = vi.fn();
      leaveEvent.stopPropagation = vi.fn();
      dropZone.dispatchEvent(leaveEvent);

      expect(dropZone.classList.contains('drag-over')).toBe(false);
    });

    it('should not remove drag-over class when entering child elements (counter > 0)', async () => {
      const { initDragDrop } = await import('../../src/renderer/drag-drop.js');
      const onFilesValidated = vi.fn();
      const getExistingPaths = vi.fn(() => []);

      initDragDrop({ onFilesValidated, getExistingPaths });

      const dropZone = document.getElementById('drop-zone');

      // Enter parent
      const enterEvent1 = new Event('dragenter', { bubbles: true });
      enterEvent1.preventDefault = vi.fn();
      enterEvent1.stopPropagation = vi.fn();
      dropZone.dispatchEvent(enterEvent1);

      // Enter child (second dragenter)
      const enterEvent2 = new Event('dragenter', { bubbles: true });
      enterEvent2.preventDefault = vi.fn();
      enterEvent2.stopPropagation = vi.fn();
      dropZone.dispatchEvent(enterEvent2);

      // Leave child (first dragleave)
      const leaveEvent = new Event('dragleave', { bubbles: true });
      leaveEvent.preventDefault = vi.fn();
      leaveEvent.stopPropagation = vi.fn();
      dropZone.dispatchEvent(leaveEvent);

      // Should still have drag-over since counter is 1
      expect(dropZone.classList.contains('drag-over')).toBe(true);
    });

    it('should remove drag-over class on drop', async () => {
      const { initDragDrop } = await import('../../src/renderer/drag-drop.js');
      const onFilesValidated = vi.fn();
      const getExistingPaths = vi.fn(() => []);
      window.markitdownAPI.validateFiles.mockResolvedValue([]);

      initDragDrop({ onFilesValidated, getExistingPaths });

      const dropZone = document.getElementById('drop-zone');

      // Enter first
      const enterEvent = new Event('dragenter', { bubbles: true });
      enterEvent.preventDefault = vi.fn();
      enterEvent.stopPropagation = vi.fn();
      dropZone.dispatchEvent(enterEvent);

      // Drop
      const dropEvent = new Event('drop', { bubbles: true });
      dropEvent.preventDefault = vi.fn();
      dropEvent.stopPropagation = vi.fn();
      dropEvent.dataTransfer = {
        files: [],
        items: [],
      };
      dropZone.dispatchEvent(dropEvent);

      expect(dropZone.classList.contains('drag-over')).toBe(false);
    });

    it('should validate dropped files and call onFilesValidated', async () => {
      const { initDragDrop } = await import('../../src/renderer/drag-drop.js');
      const onFilesValidated = vi.fn();
      const getExistingPaths = vi.fn(() => ['/existing/file.pdf']);
      const mockResults = [{ path: '/test/doc.pdf', valid: true, fileName: 'doc.pdf' }];
      window.markitdownAPI.validateFiles.mockResolvedValue(mockResults);

      initDragDrop({ onFilesValidated, getExistingPaths });

      const dropZone = document.getElementById('drop-zone');

      const dropEvent = new Event('drop', { bubbles: true });
      dropEvent.preventDefault = vi.fn();
      dropEvent.stopPropagation = vi.fn();
      dropEvent.dataTransfer = {
        files: [{ path: '/test/doc.pdf', name: 'doc.pdf', type: 'application/pdf', size: 1024 }],
        items: [{ webkitGetAsEntry: () => ({ isDirectory: false, isFile: true }) }],
      };
      dropZone.dispatchEvent(dropEvent);

      // Wait for async processing
      await vi.waitFor(() => {
        expect(onFilesValidated).toHaveBeenCalledWith(mockResults);
      });

      expect(window.markitdownAPI.validateFiles).toHaveBeenCalledWith(
        ['/test/doc.pdf'],
        ['/existing/file.pdf']
      );
    });

    it('should extract folder files and validate all combined paths', async () => {
      const { initDragDrop } = await import('../../src/renderer/drag-drop.js');
      const onFilesValidated = vi.fn();
      const getExistingPaths = vi.fn(() => []);
      const mockResults = [
        { path: '/test/file.pdf', valid: true, fileName: 'file.pdf' },
        { path: '/folder/doc.docx', valid: true, fileName: 'doc.docx' },
      ];
      window.markitdownAPI.extractFolderFiles.mockResolvedValue(['/folder/doc.docx']);
      window.markitdownAPI.validateFiles.mockResolvedValue(mockResults);

      initDragDrop({ onFilesValidated, getExistingPaths });

      const dropZone = document.getElementById('drop-zone');

      const dropEvent = new Event('drop', { bubbles: true });
      dropEvent.preventDefault = vi.fn();
      dropEvent.stopPropagation = vi.fn();
      dropEvent.dataTransfer = {
        files: [
          { path: '/test/file.pdf', name: 'file.pdf', type: 'application/pdf', size: 1024 },
          { path: '/my/folder', name: 'folder', type: '', size: 0 },
        ],
        items: [
          { webkitGetAsEntry: () => ({ isDirectory: false, isFile: true }) },
          { webkitGetAsEntry: () => ({ isDirectory: true, isFile: false }) },
        ],
      };
      dropZone.dispatchEvent(dropEvent);

      await vi.waitFor(() => {
        expect(onFilesValidated).toHaveBeenCalledWith(mockResults);
      });

      expect(window.markitdownAPI.extractFolderFiles).toHaveBeenCalledWith('/my/folder');
      expect(window.markitdownAPI.validateFiles).toHaveBeenCalledWith(
        ['/test/file.pdf', '/folder/doc.docx'],
        []
      );
    });

    it('should not call onFilesValidated when no files are dropped', async () => {
      const { initDragDrop } = await import('../../src/renderer/drag-drop.js');
      const onFilesValidated = vi.fn();
      const getExistingPaths = vi.fn(() => []);

      initDragDrop({ onFilesValidated, getExistingPaths });

      const dropZone = document.getElementById('drop-zone');

      const dropEvent = new Event('drop', { bubbles: true });
      dropEvent.preventDefault = vi.fn();
      dropEvent.stopPropagation = vi.fn();
      dropEvent.dataTransfer = {
        files: [],
        items: [],
      };
      dropZone.dispatchEvent(dropEvent);

      // Give async a chance to resolve
      await new Promise((r) => setTimeout(r, 50));
      expect(onFilesValidated).not.toHaveBeenCalled();
    });
  });

  describe('btn-add-files button', () => {
    it('should open file dialog and validate selected files', async () => {
      const { initDragDrop } = await import('../../src/renderer/drag-drop.js');
      const onFilesValidated = vi.fn();
      const getExistingPaths = vi.fn(() => ['/existing.pdf']);
      const dialogResult = ['/new/file.docx', '/new/file2.xlsx'];
      const mockResults = [
        { path: '/new/file.docx', valid: true, fileName: 'file.docx' },
        { path: '/new/file2.xlsx', valid: true, fileName: 'file2.xlsx' },
      ];
      window.markitdownAPI.openFileDialog.mockResolvedValue(dialogResult);
      window.markitdownAPI.validateFiles.mockResolvedValue(mockResults);

      initDragDrop({ onFilesValidated, getExistingPaths });

      const btn = document.getElementById('btn-add-files');
      btn.click();

      await vi.waitFor(() => {
        expect(onFilesValidated).toHaveBeenCalledWith(mockResults);
      });

      expect(window.markitdownAPI.openFileDialog).toHaveBeenCalled();
      expect(window.markitdownAPI.validateFiles).toHaveBeenCalledWith(dialogResult, ['/existing.pdf']);
    });

    it('should not call onFilesValidated when dialog is cancelled', async () => {
      const { initDragDrop } = await import('../../src/renderer/drag-drop.js');
      const onFilesValidated = vi.fn();
      const getExistingPaths = vi.fn(() => []);
      window.markitdownAPI.openFileDialog.mockResolvedValue([]);

      initDragDrop({ onFilesValidated, getExistingPaths });

      const btn = document.getElementById('btn-add-files');
      btn.click();

      await new Promise((r) => setTimeout(r, 50));
      expect(onFilesValidated).not.toHaveBeenCalled();
    });

    it('should not call onFilesValidated when dialog returns null', async () => {
      const { initDragDrop } = await import('../../src/renderer/drag-drop.js');
      const onFilesValidated = vi.fn();
      const getExistingPaths = vi.fn(() => []);
      window.markitdownAPI.openFileDialog.mockResolvedValue(null);

      initDragDrop({ onFilesValidated, getExistingPaths });

      const btn = document.getElementById('btn-add-files');
      btn.click();

      await new Promise((r) => setTimeout(r, 50));
      expect(onFilesValidated).not.toHaveBeenCalled();
    });
  });
});
