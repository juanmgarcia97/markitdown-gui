import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import path from 'path';
import { promises as fs, mkdtempSync, writeFileSync, rmSync } from 'fs';
import os from 'os';
import { FileValidator } from '../../src/main/file-validator.js';
import { ERROR_CODES } from '../../src/shared/constants.js';

/**
 * Feature: markitdown-gui, Property 8: Duplicate path detection
 *
 * For any set of file paths where some paths are absolute-path duplicates of
 * already-imported files, the validation SHALL reject exactly the duplicate
 * paths and accept all non-duplicate valid paths.
 *
 * **Validates: Requirements 1.6**
 */
describe('Feature: markitdown-gui, Property 8: Duplicate path detection', () => {
  let validator;
  let tmpDir;

  beforeEach(() => {
    validator = new FileValidator();
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'dup-prop-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Helper: creates a real .txt file in tmpDir with the given name.
   * Returns the absolute path.
   */
  function createTempFile(name) {
    const filePath = path.join(tmpDir, name);
    writeFileSync(filePath, 'test content');
    return filePath;
  }

  it('paths present in existingPaths are rejected as duplicates while others pass the duplicate check', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate between 1 and 10 unique filenames (all .txt to pass extension check)
        fc.integer({ min: 1, max: 10 }).chain((totalFiles) =>
          fc.record({
            totalFiles: fc.constant(totalFiles),
            // How many of those files will be "existing" (duplicates)
            duplicateCount: fc.integer({ min: 0, max: totalFiles }),
          })
        ),
        async ({ totalFiles, duplicateCount }) => {
          // Create real temp files
          const allFiles = [];
          for (let i = 0; i < totalFiles; i++) {
            allFiles.push(createTempFile(`file_${i}.txt`));
          }

          // Pick the first `duplicateCount` files as already-existing paths
          const existingPaths = allFiles.slice(0, duplicateCount);
          // All files are submitted for validation
          const filesToValidate = [...allFiles];

          const results = await validator.validate(filesToValidate, existingPaths);

          expect(results).toHaveLength(totalFiles);

          for (let i = 0; i < totalFiles; i++) {
            const result = results[i];
            const resolvedPath = path.resolve(allFiles[i]);
            const isDuplicate = existingPaths
              .map((p) => path.resolve(p))
              .includes(resolvedPath);

            if (isDuplicate) {
              // Duplicate paths MUST be rejected with the DUPLICATE error
              expect(result.valid).toBe(false);
              expect(result.error).toBe(ERROR_CODES.DUPLICATE);
            } else {
              // Non-duplicate paths must NOT have a duplicate error
              // (they may still pass or fail for other reasons, but not duplicate)
              expect(result.error).not.toBe(ERROR_CODES.DUPLICATE);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('the same absolute path submitted multiple times with itself in existingPaths is always flagged as duplicate', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a number of repetitions for a single file
        fc.integer({ min: 1, max: 5 }),
        async (repetitions) => {
          const filePath = createTempFile('repeated.txt');
          const existingPaths = [filePath];
          const filesToValidate = Array(repetitions).fill(filePath);

          const results = await validator.validate(filesToValidate, existingPaths);

          expect(results).toHaveLength(repetitions);

          // Every submission of that path should be a duplicate
          for (const result of results) {
            expect(result.valid).toBe(false);
            expect(result.error).toBe(ERROR_CODES.DUPLICATE);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('when existingPaths is empty, no file is flagged as duplicate', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 8 }),
        async (fileCount) => {
          const allFiles = [];
          for (let i = 0; i < fileCount; i++) {
            allFiles.push(createTempFile(`nodupe_${i}.txt`));
          }

          const results = await validator.validate(allFiles, []);

          for (const result of results) {
            // No file should be marked as duplicate when existingPaths is empty
            expect(result.error).not.toBe(ERROR_CODES.DUPLICATE);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
