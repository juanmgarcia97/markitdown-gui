import { marked } from 'marked';
import DOMPurify from 'dompurify';

/**
 * MarkdownPreview - Manages the markdown preview panel.
 * Renders markdown as sanitized HTML, supports toggle between rendered/source views,
 * copy to clipboard, and empty state messages.
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4
 */
class MarkdownPreview {
  constructor() {
    this._currentMarkdown = null;
    this._viewMode = 'rendered'; // 'rendered' | 'source'

    // DOM references
    this._previewContent = document.getElementById('preview-content');
    this._btnRendered = document.getElementById('btn-view-rendered');
    this._btnSource = document.getElementById('btn-view-source');
    this._btnCopy = document.getElementById('btn-copy');

    this._bindEvents();
  }

  /**
   * Bind click events for toggle buttons and copy button.
   */
  _bindEvents() {
    this._btnRendered.addEventListener('click', () => {
      this.setView('rendered');
    });

    this._btnSource.addEventListener('click', () => {
      this.setView('source');
    });

    this._btnCopy.addEventListener('click', () => {
      this._copyToClipboard();
    });
  }

  /**
   * Show a preview of the given markdown content.
   * If markdown is null/empty, shows the empty conversion message (Req 4.4).
   * @param {string|null} markdown - The markdown source to render
   */
  showPreview(markdown) {
    if (!markdown || markdown.trim() === '') {
      this._currentMarkdown = null;
      this._showEmptyConversion();
      return;
    }

    this._currentMarkdown = markdown;
    this._render();
  }

  /**
   * Clear the preview and show the default empty state message.
   */
  clear() {
    this._currentMarkdown = null;
    this._viewMode = 'rendered';
    this._updateToggleButtons();
    this._previewContent.innerHTML = `
      <div class="preview-panel__empty">
        <p>Selecciona un archivo convertido para ver la vista previa</p>
      </div>
    `;
  }

  /**
   * Switch between 'rendered' and 'source' view modes.
   * @param {'rendered'|'source'} mode
   */
  setView(mode) {
    if (mode !== 'rendered' && mode !== 'source') return;
    this._viewMode = mode;
    this._updateToggleButtons();
    this._render();
  }

  /**
   * Return the current view mode.
   * @returns {'rendered'|'source'}
   */
  getView() {
    return this._viewMode;
  }

  /**
   * Update toggle button active states and aria-pressed attributes.
   */
  _updateToggleButtons() {
    if (this._viewMode === 'rendered') {
      this._btnRendered.classList.add('toggle-btn--active');
      this._btnRendered.setAttribute('aria-pressed', 'true');
      this._btnSource.classList.remove('toggle-btn--active');
      this._btnSource.setAttribute('aria-pressed', 'false');
    } else {
      this._btnSource.classList.add('toggle-btn--active');
      this._btnSource.setAttribute('aria-pressed', 'true');
      this._btnRendered.classList.remove('toggle-btn--active');
      this._btnRendered.setAttribute('aria-pressed', 'false');
    }
  }

  /**
   * Render the current markdown according to the active view mode.
   */
  _render() {
    if (this._currentMarkdown === null) {
      this._showEmptyConversion();
      return;
    }

    if (this._viewMode === 'rendered') {
      this._renderHTML();
    } else {
      this._renderSource();
    }
  }

  /**
   * Render markdown as sanitized HTML (Req 4.1).
   */
  _renderHTML() {
    const rawHTML = marked.parse(this._currentMarkdown);
    const cleanHTML = DOMPurify.sanitize(rawHTML);
    this._previewContent.innerHTML = `<div class="markdown-body">${cleanHTML}</div>`;
  }

  /**
   * Render markdown as plain text source in a <pre> element (Req 4.2).
   */
  _renderSource() {
    const pre = document.createElement('pre');
    pre.className = 'preview-panel__source';
    pre.textContent = this._currentMarkdown;
    this._previewContent.innerHTML = '';
    this._previewContent.appendChild(pre);
  }

  /**
   * Show empty conversion message when markdown is null/empty (Req 4.4).
   */
  _showEmptyConversion() {
    this._previewContent.innerHTML = `
      <div class="preview-panel__empty">
        <p>La conversión no generó contenido</p>
      </div>
    `;
  }

  /**
   * Copy source markdown to clipboard and show visual feedback (Req 4.3).
   */
  async _copyToClipboard() {
    if (!this._currentMarkdown) return;

    try {
      await window.markitdownAPI.copyToClipboard(this._currentMarkdown);
      this._showCopyFeedback();
    } catch (err) {
      // Error is handled by the caller or toast notification system
      console.error('Failed to copy to clipboard:', err);
    }
  }

  /**
   * Show brief visual feedback on the copy button for 3 seconds.
   */
  _showCopyFeedback() {
    const originalText = this._btnCopy.textContent;
    this._btnCopy.textContent = 'Copiado ✓';
    this._btnCopy.disabled = true;

    setTimeout(() => {
      this._btnCopy.textContent = originalText;
      this._btnCopy.disabled = false;
    }, 3000);
  }
}

export { MarkdownPreview };
