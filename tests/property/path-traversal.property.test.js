import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { FileValidator } from '../../src/main/file-validator.js';

/**
 * Feature: markitdown-gui, Property 3: Path traversal detection
 *
 * For any file path string containing the sequences `../`, `..\`, or resolved
 * absolute paths pointing outside the working scope, `hasPathTraversal` SHALL
 * return `true`. Conversely, for any path that does not contain such sequences
 * and resolves within allowed directories, it SHALL return `false`.
 *
 * **Validates: Requirements 8.3**
 */
describe('Property 3: Path traversal detection', () => {
  const validator = new FileValidator();

  /**
   * Arbitrary: generates path segments that are safe (no traversal sequences).
   * Segments are alphanumeric with optional hyphens/underscores.
   */
  const safeSegment = fc.stringMatching(/^[a-zA-Z0-9_-]{1,12}$/);

  const safeExtension = fc.constantFrom('pdf', 'docx', 'txt', 'md', 'png', 'html', 'csv');

  /**
   * Arbitrary: generates safe file paths without any traversal sequences.
   * Format: /dir1/dir2/.../filename.ext
   */
  const safePath = fc
    .tuple(
      fc.array(safeSegment, { minLength: 1, maxLength: 4 }),
      safeSegment,
      safeExtension
    )
    .map(([dirs, name, ext]) => '/' + dirs.join('/') + '/' + name + '.' + ext);

  /**
   * Arbitrary: generates paths that contain ../ traversal sequences.
   */
  const pathWithForwardTraversal = fc
    .tuple(
      safeSegment,
      fc.array(safeSegment, { minLength: 0, maxLength: 2 }),
      safeSegment,
      safeExtension
    )
    .map(([prefix, middle, name, ext]) => {
      const midPath = middle.length > 0 ? middle.join('/') + '/' : '';
      return prefix + '/' + midPath + '../' + name + '.' + ext;
    });

  /**
   * Arbitrary: generates paths that contain ..\ traversal sequences (Windows-style).
   */
  const pathWithBackslashTraversal = fc
    .tuple(
      safeSegment,
      fc.array(safeSegment, { minLength: 0, maxLength: 2 }),
      safeSegment,
      safeExtension
    )
    .map(([prefix, middle, name, ext]) => {
      const midPath = middle.length > 0 ? middle.join('\\') + '\\' : '';
      return prefix + '\\' + midPath + '..\\' + name + '.' + ext;
    });

  /**
   * Arbitrary: generates dangerous traversal paths (multiple levels of ../).
   */
  const deepTraversalPath = fc
    .tuple(
      safeSegment,
      fc.integer({ min: 2, max: 5 }),
      safeSegment,
      safeExtension
    )
    .map(([prefix, depth, name, ext]) => {
      const traversal = '../'.repeat(depth);
      return prefix + '/' + traversal + name + '.' + ext;
    });

  it('should return true for paths containing ../ sequences', () => {
    fc.assert(
      fc.property(pathWithForwardTraversal, (filePath) => {
        expect(validator.hasPathTraversal(filePath)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should return true for paths containing ..\\ sequences', () => {
    fc.assert(
      fc.property(pathWithBackslashTraversal, (filePath) => {
        expect(validator.hasPathTraversal(filePath)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should return true for deep traversal paths (multiple ../)', () => {
    fc.assert(
      fc.property(deepTraversalPath, (filePath) => {
        expect(validator.hasPathTraversal(filePath)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should return false for safe paths without traversal sequences', () => {
    fc.assert(
      fc.property(safePath, (filePath) => {
        expect(validator.hasPathTraversal(filePath)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});
