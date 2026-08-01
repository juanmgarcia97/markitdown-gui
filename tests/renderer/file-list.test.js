import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Read the source file and set up module in DOM context
const fileListSource = readFileSync(
  resolve(__dirname, '../../src/renderer/file-list.js'),
  'utf-8'
);

// We'll test formatFileSize as a pure function first, then FileList with DOM
// Import formatFileSize directly - it's a pure function
const formatFileSizeModule = await import('../../src/renderer/file-list.js');
const { formatFileSize } = formatFileSizeModule;

describe('formatFileSize', () => {
  it('formats bytes (< 1024) correctly', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(1)).toBe('1 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1023)).toBe('1023 B');
  });

  it('formats kilobytes (1024 <= x < 1048576) correctly', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(10240)).toBe('10.0 KB');
    expect(formatFileSize(1048575)).toBe('1024.0 KB');
  });

  it('formats megabytes (1048576 <= x < 1073741824) correctly', () => {
    expect(formatFileSize(1048576)).toBe('1.0 MB');
    expect(formatFileSize(26541465)).toBe('25.3 MB');
    expect(formatFileSize(524288000)).toBe('500.0 MB');
  });

  it('formats gigabytes (>= 1073741824) correctly', () => {
    expect(formatFileSize(1073741824)).toBe('1.0 GB');
    expect(formatFileSize(1288490189)).toBe('1.2 GB');
    expect(formatFileSize(5368709120)).toBe('5.0 GB');
  });
});

describe('FileList', () => {
  let dom;
  let document;
  let FileList;

  beforeEach(() => {
    // Set up a minimal DOM that mimics the app's index.html structure
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
      <body>
        <section id="file-list" class="file-list">
          <div class="file-list__header">
            <h2 class="file-list__title">Archivos importados</h2>
            <span id="file-count" class="file-list__count">0 archivos</span>
          </div>
          <div class="file-list__container" role="list">
            <div class="file-list__empty">
              <p>No hay archivos importados</p>
            </div>
          </div>
        </section>
      </body>
      </html>
    `, { url: 'http://localhost' });

    document = dom.window.document;

    // Patch global document/window for the FileList class
    global.document = document;
    global.window = dom.window;
    global.CSS = { escape: (str) => str.replace(/([^\w-])/g, '\\$1') };

    // Re-import FileList with fresh DOM context
    // We use a dynamic approach: re-instantiate the class
    const { FileList: FL } = formatFileSizeModule;
    FileList = FL;
  });

  function createFileList() {
    return new FileList();
  }

  it('starts with empty file list', () => {
    const fl = createFileList();
    expect(fl.getFiles()).toEqual([]);
    expect(fl.getFilePaths()).toEqual([]);
    expect(fl.getSelectedFile()).toBeNull();
  });

  it('addFiles adds only valid files', () => {
    const fl = createFileList();
    fl.addFiles([
      { path: '/home/user/doc.pdf', fileName: 'doc.pdf', valid: true, fileSize: 1024 },
      { path: '/home/user/bad.xyz', fileName: 'bad.xyz', valid: false },
      { path: '/home/user/img.png', fileName: 'img.png', valid: true, fileSize: 2048 },
    ]);

    const files = fl.getFiles();
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe('/home/user/doc.pdf');
    expect(files[0].name).toBe('doc.pdf');
    expect(files[0].extension).toBe('pdf');
    expect(files[0].size).toBe(1024);
    expect(files[0].status).toBe('pending');
    expect(files[1].path).toBe('/home/user/img.png');
  });

  it('addFiles prevents duplicates', () => {
    const fl = createFileList();
    fl.addFiles([
      { path: '/home/user/doc.pdf', fileName: 'doc.pdf', valid: true, fileSize: 1024 },
    ]);
    fl.addFiles([
      { path: '/home/user/doc.pdf', fileName: 'doc.pdf', valid: true, fileSize: 1024 },
      { path: '/home/user/img.png', fileName: 'img.png', valid: true, fileSize: 2048 },
    ]);

    expect(fl.getFiles()).toHaveLength(2);
    expect(fl.getFilePaths()).toContain('/home/user/doc.pdf');
    expect(fl.getFilePaths()).toContain('/home/user/img.png');
  });

  it('removeFile removes a file and updates DOM', () => {
    const fl = createFileList();
    fl.addFiles([
      { path: '/home/user/doc.pdf', fileName: 'doc.pdf', valid: true, fileSize: 1024 },
      { path: '/home/user/img.png', fileName: 'img.png', valid: true, fileSize: 2048 },
    ]);

    fl.removeFile('/home/user/doc.pdf');

    const files = fl.getFiles();
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('/home/user/img.png');
  });

  it('removeFile deselects file if it was selected', () => {
    const fl = createFileList();
    let selectionEvent = null;
    fl.onSelectionChange((file) => { selectionEvent = file; });

    fl.addFiles([
      { path: '/home/user/doc.pdf', fileName: 'doc.pdf', valid: true, fileSize: 1024 },
    ]);
    fl.selectFile('/home/user/doc.pdf');
    fl.removeFile('/home/user/doc.pdf');

    expect(fl.getSelectedFile()).toBeNull();
    expect(selectionEvent).toBeNull();
  });

  it('updateFileStatus updates file status', () => {
    const fl = createFileList();
    fl.addFiles([
      { path: '/home/user/doc.pdf', fileName: 'doc.pdf', valid: true, fileSize: 1024 },
    ]);

    fl.updateFileStatus('/home/user/doc.pdf', 'converting');
    expect(fl.getFiles()[0].status).toBe('converting');

    fl.updateFileStatus('/home/user/doc.pdf', 'done');
    expect(fl.getFiles()[0].status).toBe('done');
  });

  it('selectFile marks a file as selected', () => {
    const fl = createFileList();
    let selectedFile = null;
    fl.onSelectionChange((file) => { selectedFile = file; });

    fl.addFiles([
      { path: '/home/user/doc.pdf', fileName: 'doc.pdf', valid: true, fileSize: 1024 },
      { path: '/home/user/img.png', fileName: 'img.png', valid: true, fileSize: 2048 },
    ]);

    fl.selectFile('/home/user/img.png');

    expect(fl.getSelectedFile().path).toBe('/home/user/img.png');
    expect(selectedFile.path).toBe('/home/user/img.png');
  });

  it('clear removes all files', () => {
    const fl = createFileList();
    fl.addFiles([
      { path: '/home/user/doc.pdf', fileName: 'doc.pdf', valid: true, fileSize: 1024 },
      { path: '/home/user/img.png', fileName: 'img.png', valid: true, fileSize: 2048 },
    ]);

    fl.clear();

    expect(fl.getFiles()).toEqual([]);
    expect(fl.getFilePaths()).toEqual([]);
    expect(fl.getSelectedFile()).toBeNull();
  });

  it('updates file count display', () => {
    const fl = createFileList();
    const countEl = document.getElementById('file-count');

    fl.addFiles([
      { path: '/home/user/doc.pdf', fileName: 'doc.pdf', valid: true, fileSize: 1024 },
    ]);
    expect(countEl.textContent).toBe('1 archivo');

    fl.addFiles([
      { path: '/home/user/img.png', fileName: 'img.png', valid: true, fileSize: 2048 },
    ]);
    expect(countEl.textContent).toBe('2 archivos');

    fl.clear();
    expect(countEl.textContent).toBe('0 archivos');
  });

  it('hides empty message when files exist', () => {
    const fl = createFileList();
    const emptyEl = document.querySelector('.file-list__empty');

    expect(emptyEl.style.display).toBe('');

    fl.addFiles([
      { path: '/home/user/doc.pdf', fileName: 'doc.pdf', valid: true, fileSize: 1024 },
    ]);
    expect(emptyEl.style.display).toBe('none');

    fl.clear();
    expect(emptyEl.style.display).toBe('');
  });

  it('renders file items in the container', () => {
    const fl = createFileList();

    fl.addFiles([
      { path: '/home/user/doc.pdf', fileName: 'doc.pdf', valid: true, fileSize: 1536 },
    ]);

    const container = document.querySelector('.file-list__container');
    const fileItem = container.querySelector('.file-item');
    expect(fileItem).not.toBeNull();
    expect(fileItem.querySelector('.file-item__name').textContent).toBe('doc.pdf');
    expect(fileItem.querySelector('.file-item__size').textContent).toBe('1.5 KB');
    expect(fileItem.querySelector('.file-item__ext').textContent).toBe('pdf');
    expect(fileItem.querySelector('.file-item__status').textContent).toBe('Pendiente');
    expect(fileItem.querySelector('.file-item__remove')).not.toBeNull();
  });

  it('getFilePaths returns only paths', () => {
    const fl = createFileList();
    fl.addFiles([
      { path: '/a/b.pdf', fileName: 'b.pdf', valid: true, fileSize: 100 },
      { path: '/c/d.docx', fileName: 'd.docx', valid: true, fileSize: 200 },
    ]);

    expect(fl.getFilePaths()).toEqual(['/a/b.pdf', '/c/d.docx']);
  });

  it('handles file with no extension', () => {
    const fl = createFileList();
    fl.addFiles([
      { path: '/home/user/Makefile', fileName: 'Makefile', valid: true, fileSize: 100 },
    ]);

    const files = fl.getFiles();
    expect(files[0].extension).toBe('');
  });

  it('handles Windows-style paths', () => {
    const fl = createFileList();
    fl.addFiles([
      { path: 'C:\\Users\\user\\doc.pdf', fileName: 'doc.pdf', valid: true, fileSize: 1024 },
    ]);

    const files = fl.getFiles();
    expect(files[0].name).toBe('doc.pdf');
    expect(files[0].extension).toBe('pdf');
  });
});
