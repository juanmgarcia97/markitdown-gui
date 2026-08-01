import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { OutputManager } from '../../src/main/output-manager.js';
import { LIMITS, ERROR_CODES } from '../../src/shared/constants.js';

describe('OutputManager', () => {
  let manager;
  let tmpDir;

  beforeEach(async () => {
    manager = new OutputManager();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'output-manager-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('resolveOutputPath', () => {
    it('should generate .md filename without conflict when no file exists', async () => {
      const inputFile = path.join(tmpDir, 'document.pdf');
      const result = await manager.resolveOutputPath(inputFile, null);

      expect(result).toBe(path.join(tmpDir, 'document.md'));
    });

    it('should use customOutputDir when provided', async () => {
      const inputFile = '/some/path/document.pdf';
      const customDir = tmpDir;
      const result = await manager.resolveOutputPath(inputFile, customDir);

      expect(result).toBe(path.join(tmpDir, 'document.md'));
    });

    it('should use the original directory when customOutputDir is null', async () => {
      const inputFile = path.join(tmpDir, 'report.docx');
      const result = await manager.resolveOutputPath(inputFile, null);

      expect(result).toBe(path.join(tmpDir, 'report.md'));
    });

    it('should add suffix _1 when base filename already exists', async () => {
      const inputFile = path.join(tmpDir, 'document.pdf');
      // Create the conflicting file
      await fs.writeFile(path.join(tmpDir, 'document.md'), 'existing');

      const result = await manager.resolveOutputPath(inputFile, null);
      expect(result).toBe(path.join(tmpDir, 'document_1.md'));
    });

    it('should increment suffix when multiple conflicts exist', async () => {
      const inputFile = path.join(tmpDir, 'document.pdf');
      // Create conflicting files
      await fs.writeFile(path.join(tmpDir, 'document.md'), 'existing');
      await fs.writeFile(path.join(tmpDir, 'document_1.md'), 'existing');
      await fs.writeFile(path.join(tmpDir, 'document_2.md'), 'existing');

      const result = await manager.resolveOutputPath(inputFile, null);
      expect(result).toBe(path.join(tmpDir, 'document_3.md'));
    });

    it('should throw error with SUFFIX_LIMIT code when all 99 suffixes are taken', async () => {
      const inputFile = path.join(tmpDir, 'document.pdf');
      // Create the base file and all 99 suffixes
      await fs.writeFile(path.join(tmpDir, 'document.md'), 'existing');
      for (let i = 1; i <= LIMITS.MAX_SUFFIX; i++) {
        await fs.writeFile(path.join(tmpDir, `document_${i}.md`), 'existing');
      }

      await expect(manager.resolveOutputPath(inputFile, null)).rejects.toMatchObject({
        code: ERROR_CODES.SUFFIX_LIMIT,
      });
    });

    it('should handle filenames with multiple dots correctly', async () => {
      const inputFile = path.join(tmpDir, 'my.report.v2.pdf');
      const result = await manager.resolveOutputPath(inputFile, null);

      expect(result).toBe(path.join(tmpDir, 'my.report.v2.md'));
    });
  });

  describe('isWritable', () => {
    it('should return true for a writable directory', async () => {
      const result = await manager.isWritable(tmpDir);
      expect(result).toBe(true);
    });

    it('should return false for a non-existent directory', async () => {
      const result = await manager.isWritable(path.join(tmpDir, 'nonexistent'));
      expect(result).toBe(false);
    });

    it('should return false for a directory without write permissions', async () => {
      const readOnlyDir = path.join(tmpDir, 'readonly');
      await fs.mkdir(readOnlyDir);
      await fs.chmod(readOnlyDir, 0o444);

      const result = await manager.isWritable(readOnlyDir);
      expect(result).toBe(false);

      // Restore permissions for cleanup
      await fs.chmod(readOnlyDir, 0o755);
    });
  });

  describe('writeOutput', () => {
    it('should write content to the specified path', async () => {
      const outputPath = path.join(tmpDir, 'output.md');
      const content = '# Hello World\n\nThis is markdown content.';

      await manager.writeOutput(outputPath, content);

      const written = await fs.readFile(outputPath, 'utf-8');
      expect(written).toBe(content);
    });

    it('should create directories recursively if they do not exist', async () => {
      const outputPath = path.join(tmpDir, 'nested', 'deep', 'output.md');
      const content = '# Nested content';

      await manager.writeOutput(outputPath, content);

      const written = await fs.readFile(outputPath, 'utf-8');
      expect(written).toBe(content);
    });

    it('should overwrite existing file content', async () => {
      const outputPath = path.join(tmpDir, 'output.md');
      await fs.writeFile(outputPath, 'old content');

      const newContent = '# New content';
      await manager.writeOutput(outputPath, newContent);

      const written = await fs.readFile(outputPath, 'utf-8');
      expect(written).toBe(newContent);
    });
  });
});
