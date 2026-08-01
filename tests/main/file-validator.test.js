import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { FileValidator } from '../../src/main/file-validator.js';
import { LIMITS, ERROR_CODES } from '../../src/shared/constants.js';

describe('FileValidator', () => {
  let validator;
  let tmpDir;

  beforeEach(async () => {
    validator = new FileValidator();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-validator-test-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('Archivo aceptado con extensión y MIME válidos', () => {
    it('should accept a valid PNG file with correct magic bytes', async () => {
      // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      // Add minimal IHDR chunk to make file-type recognize it
      const ihdrChunk = Buffer.alloc(25, 0);
      const pngContent = Buffer.concat([pngHeader, ihdrChunk]);

      const filePath = path.join(tmpDir, 'test-image.png');
      await fs.writeFile(filePath, pngContent);

      const results = await validator.validate([filePath]);

      expect(results).toHaveLength(1);
      expect(results[0].valid).toBe(true);
      expect(results[0].path).toBe(filePath);
      expect(results[0].fileName).toBe('test-image.png');
    });
  });

  describe('Archivo rechazado por extensión no compatible', () => {
    it('should reject a file with unsupported extension .xyz', async () => {
      const filePath = path.join(tmpDir, 'document.xyz');
      await fs.writeFile(filePath, 'some content');

      const results = await validator.validate([filePath]);

      expect(results).toHaveLength(1);
      expect(results[0].valid).toBe(false);
      expect(results[0].error).toBe(ERROR_CODES.UNSUPPORTED_EXTENSION);
    });
  });

  describe('Archivo rechazado por MIME mismatch', () => {
    it('should reject a file with .png extension but JPEG magic bytes', async () => {
      // JPEG magic bytes: FF D8 FF
      const jpegContent = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
      const filePath = path.join(tmpDir, 'fake-image.png');
      await fs.writeFile(filePath, jpegContent);

      const results = await validator.validate([filePath]);

      expect(results).toHaveLength(1);
      expect(results[0].valid).toBe(false);
      expect(results[0].error).toBe(ERROR_CODES.MIME_MISMATCH);
      expect(results[0].detectedMime).toBe('image/jpeg');
    });
  });

  describe('Archivo rechazado por path traversal', () => {
    it('should reject a path containing traversal sequences', async () => {
      const maliciousPath = '../../../etc/passwd.pdf';

      const results = await validator.validate([maliciousPath]);

      expect(results).toHaveLength(1);
      expect(results[0].valid).toBe(false);
      expect(results[0].error).toBe(ERROR_CODES.PATH_TRAVERSAL);
    });
  });

  describe('Archivo rechazado por exceder 500 MB', () => {
    it('should reject a file that exceeds the 500 MB size limit', async () => {
      const filePath = path.join(tmpDir, 'large-file.txt');
      await fs.writeFile(filePath, 'content');

      // Mock fs.promises.stat to return a size exceeding 500 MB
      const originalStat = fs.stat;
      vi.spyOn(fs, 'stat').mockImplementation(async (p) => {
        if (p === filePath) {
          return { size: LIMITS.MAX_FILE_SIZE + 1 };
        }
        return originalStat(p);
      });

      const results = await validator.validate([filePath]);

      expect(results).toHaveLength(1);
      expect(results[0].valid).toBe(false);
      expect(results[0].error).toBe(ERROR_CODES.TOO_LARGE);
    });
  });

  describe('Archivo duplicado detectado correctamente', () => {
    it('should reject a file that already exists in existingPaths', async () => {
      const filePath = path.join(tmpDir, 'document.txt');
      await fs.writeFile(filePath, 'text content');

      const results = await validator.validate([filePath], [filePath]);

      expect(results).toHaveLength(1);
      expect(results[0].valid).toBe(false);
      expect(results[0].error).toBe(ERROR_CODES.DUPLICATE);
    });
  });
});
