/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock marked and dompurify before importing the module
vi.mock('marked', () => ({
  marked: {
    parse: vi.fn((md) => `<p>${md}</p>`),
  },
}));

vi.mock('dompurify', () => ({
  default: {
    sanitize: vi.fn((html) => html),
  },
}));

describe('MarkdownPreview', () => {
  let MarkdownPreview;
  let preview;

  beforeEach(async () => {
    // Setup DOM structure matching index.html
    document.body.innerHTML = `
      <div id="preview-content">
        <div class="preview-panel__empty">
          <p>Selecciona un archivo convertido para ver la vista previa</p>
        </div>
      </div>
      <button id="btn-view-rendered" class="toggle-btn toggle-btn--active" aria-pressed="true">Renderizado</button>
      <button id="btn-view-source" class="toggle-btn" aria-pressed="false">Código fuente</button>
      <button id="btn-copy">Copiar</button>
    `;

    // Mock window.markitdownAPI
    window.markitdownAPI = {
      copyToClipboard: vi.fn().mockResolvedValue(undefined),
    };

    // Re-import to get a fresh module
    vi.resetModules();
    const mod = await import('../../src/renderer/markdown-preview.js');
    MarkdownPreview = mod.MarkdownPreview;
    preview = new MarkdownPreview();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('showPreview', () => {
    it('should render markdown content in the preview panel', () => {
      preview.showPreview('# Hello World');

      const content = document.getElementById('preview-content');
      expect(content.querySelector('.markdown-body')).not.toBeNull();
      expect(content.innerHTML).toContain('<p>');
    });

    it('should show empty conversion message for null markdown (Req 4.4)', () => {
      preview.showPreview(null);

      const content = document.getElementById('preview-content');
      expect(content.innerHTML).toContain('La conversión no generó contenido');
      expect(content.querySelector('.preview-panel__empty')).not.toBeNull();
    });

    it('should show empty conversion message for empty string (Req 4.4)', () => {
      preview.showPreview('');

      const content = document.getElementById('preview-content');
      expect(content.innerHTML).toContain('La conversión no generó contenido');
    });

    it('should show empty conversion message for whitespace-only string (Req 4.4)', () => {
      preview.showPreview('   \n  \t  ');

      const content = document.getElementById('preview-content');
      expect(content.innerHTML).toContain('La conversión no generó contenido');
    });

    it('should store the markdown source internally', () => {
      preview.showPreview('# Test content');
      // Verify by switching to source view
      preview.setView('source');

      const content = document.getElementById('preview-content');
      const pre = content.querySelector('.preview-panel__source');
      expect(pre).not.toBeNull();
      expect(pre.textContent).toBe('# Test content');
    });
  });

  describe('clear', () => {
    it('should reset the preview to the default empty state', () => {
      preview.showPreview('# Some content');
      preview.clear();

      const content = document.getElementById('preview-content');
      expect(content.innerHTML).toContain('Selecciona un archivo convertido para ver la vista previa');
      expect(content.querySelector('.preview-panel__empty')).not.toBeNull();
    });

    it('should reset view mode to rendered', () => {
      preview.setView('source');
      preview.clear();

      expect(preview.getView()).toBe('rendered');
    });

    it('should update toggle buttons to rendered active state', () => {
      preview.setView('source');
      preview.clear();

      const btnRendered = document.getElementById('btn-view-rendered');
      const btnSource = document.getElementById('btn-view-source');
      expect(btnRendered.classList.contains('toggle-btn--active')).toBe(true);
      expect(btnRendered.getAttribute('aria-pressed')).toBe('true');
      expect(btnSource.classList.contains('toggle-btn--active')).toBe(false);
      expect(btnSource.getAttribute('aria-pressed')).toBe('false');
    });
  });

  describe('setView / getView', () => {
    it('should default to rendered view mode', () => {
      expect(preview.getView()).toBe('rendered');
    });

    it('should switch to source view (Req 4.2)', () => {
      preview.showPreview('# Content');
      preview.setView('source');

      expect(preview.getView()).toBe('source');
      const content = document.getElementById('preview-content');
      const pre = content.querySelector('.preview-panel__source');
      expect(pre).not.toBeNull();
      expect(pre.textContent).toBe('# Content');
    });

    it('should switch back to rendered view (Req 4.1)', () => {
      preview.showPreview('# Content');
      preview.setView('source');
      preview.setView('rendered');

      expect(preview.getView()).toBe('rendered');
      const content = document.getElementById('preview-content');
      expect(content.querySelector('.markdown-body')).not.toBeNull();
    });

    it('should ignore invalid view mode values', () => {
      preview.setView('invalid');
      expect(preview.getView()).toBe('rendered');
    });

    it('should update toggle button active states', () => {
      preview.showPreview('test');
      preview.setView('source');

      const btnRendered = document.getElementById('btn-view-rendered');
      const btnSource = document.getElementById('btn-view-source');

      expect(btnSource.classList.contains('toggle-btn--active')).toBe(true);
      expect(btnSource.getAttribute('aria-pressed')).toBe('true');
      expect(btnRendered.classList.contains('toggle-btn--active')).toBe(false);
      expect(btnRendered.getAttribute('aria-pressed')).toBe('false');
    });
  });

  describe('toggle button click events', () => {
    it('should switch to source view when source button is clicked', () => {
      preview.showPreview('# Content');
      const btnSource = document.getElementById('btn-view-source');
      btnSource.click();

      expect(preview.getView()).toBe('source');
    });

    it('should switch to rendered view when rendered button is clicked', () => {
      preview.showPreview('# Content');
      preview.setView('source');
      const btnRendered = document.getElementById('btn-view-rendered');
      btnRendered.click();

      expect(preview.getView()).toBe('rendered');
    });
  });

  describe('copy button (Req 4.3)', () => {
    it('should call copyToClipboard with current markdown source', async () => {
      preview.showPreview('# Copy me');
      const btnCopy = document.getElementById('btn-copy');
      btnCopy.click();

      // Wait for async
      await vi.waitFor(() => {
        expect(window.markitdownAPI.copyToClipboard).toHaveBeenCalledWith('# Copy me');
      });
    });

    it('should not call copyToClipboard when no markdown is loaded', () => {
      const btnCopy = document.getElementById('btn-copy');
      btnCopy.click();

      expect(window.markitdownAPI.copyToClipboard).not.toHaveBeenCalled();
    });

    it('should show "Copiado ✓" feedback for 3 seconds', async () => {
      vi.useFakeTimers();
      preview.showPreview('# Test');
      const btnCopy = document.getElementById('btn-copy');
      btnCopy.click();

      // Wait for the async copy to resolve
      await Promise.resolve();
      await Promise.resolve();

      expect(btnCopy.textContent).toBe('Copiado ✓');
      expect(btnCopy.disabled).toBe(true);

      vi.advanceTimersByTime(3000);

      expect(btnCopy.textContent).toBe('Copiar');
      expect(btnCopy.disabled).toBe(false);
    });
  });

  describe('sanitization', () => {
    it('should use DOMPurify to sanitize rendered HTML', async () => {
      const DOMPurify = (await import('dompurify')).default;
      preview.showPreview('# Safe content');

      expect(DOMPurify.sanitize).toHaveBeenCalled();
    });

    it('should use marked to parse markdown', async () => {
      const { marked } = await import('marked');
      preview.showPreview('# Parsed content');

      expect(marked.parse).toHaveBeenCalledWith('# Parsed content');
    });
  });
});
