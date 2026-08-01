import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { FileValidator } = require('../../src/main/file-validator');
const { SUPPORTED_FORMATS } = require('../../src/shared/constants');

/**
 * Feature: markitdown-gui, Property 2: File extension validation consistency
 *
 * For any file path string, `isSupportedExtension` SHALL return `true` if and only if
 * the file's extension (case-insensitive) is present in the `SUPPORTED_FORMATS` map.
 *
 * Validates: Requirements 1.2, 8.1
 */

const supportedExtensions = Object.keys(SUPPORTED_FORMATS);

// Arbitrary: generates a random file basename (alphanumeric, 1-20 chars)
const fileBaseName = fc.stringMatching(/^[a-zA-Z0-9_-]{1,20}$/);

// Arbitrary: generates a random directory path prefix
const dirPrefix = fc.constantFrom(
  '/home/user/documents/',
  '/tmp/',
  'C:\\Users\\test\\files\\',
  '/var/data/',
  './relative/path/',
  ''
);

// Arbitrary: generates a supported extension with random casing
const supportedExtArb = fc.constantFrom(...supportedExtensions).chain((ext) =>
  fc.constantFrom(
    ext.toLowerCase(),
    ext.toUpperCase(),
    ext.charAt(0).toUpperCase() + ext.slice(1).toLowerCase()
  )
);

// Arbitrary: generates an unsupported extension (not in SUPPORTED_FORMATS)
const unsupportedExtArb = fc
  .stringMatching(/^[a-zA-Z]{1,6}$/)
  .filter((ext) => !supportedExtensions.includes(ext.toLowerCase()));

describe('Property 2: File extension validation consistency', () => {
  const validator = new FileValidator();

  it('SHALL return true for any file path with a supported extension (case-insensitive)', () => {
    fc.assert(
      fc.property(dirPrefix, fileBaseName, supportedExtArb, (dir, name, ext) => {
        const filePath = `${dir}${name}.${ext}`;
        expect(validator.isSupportedExtension(filePath)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('SHALL return false for any file path with an unsupported extension', () => {
    fc.assert(
      fc.property(dirPrefix, fileBaseName, unsupportedExtArb, (dir, name, ext) => {
        const filePath = `${dir}${name}.${ext}`;
        expect(validator.isSupportedExtension(filePath)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('SHALL treat extensions case-insensitively (upper, lower, mixed)', () => {
    fc.assert(
      fc.property(
        fileBaseName,
        fc.constantFrom(...supportedExtensions),
        fc.constantFrom('upper', 'lower', 'mixed'),
        (name, ext, casing) => {
          let casedExt;
          switch (casing) {
            case 'upper':
              casedExt = ext.toUpperCase();
              break;
            case 'lower':
              casedExt = ext.toLowerCase();
              break;
            case 'mixed':
              casedExt = ext
                .split('')
                .map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()))
                .join('');
              break;
          }
          const filePath = `/test/${name}.${casedExt}`;
          expect(validator.isSupportedExtension(filePath)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('SHALL return false for file paths without any extension', () => {
    fc.assert(
      fc.property(dirPrefix, fileBaseName, (dir, name) => {
        const filePath = `${dir}${name}`;
        expect(validator.isSupportedExtension(filePath)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});
