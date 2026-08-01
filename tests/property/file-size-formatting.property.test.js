import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { formatFileSize } from '../../src/renderer/file-list.js';

/**
 * Feature: markitdown-gui, Property 5: File size formatting
 *
 * For any non-negative integer byte count, the formatting function SHALL produce a
 * human-readable string in the form `X.Y KB`, `X.Y MB`, or `X.Y GB` (one decimal)
 * where the unit is chosen so that X is between 0.1 and 999.9 when possible.
 *
 * Validates: Requirements 1.4
 */

// Upper bound: ~10 TB in bytes
const MAX_BYTES = 10 * 1024 * 1024 * 1024 * 1024;

// Arbitrary: non-negative integers from 0 to 10TB
const bytesArb = fc.integer({ min: 0, max: MAX_BYTES });

describe('Property 5: File size formatting', () => {
  it('SHALL always produce a string matching one of the valid patterns', () => {
    fc.assert(
      fc.property(bytesArb, (bytes) => {
        const result = formatFileSize(bytes);
        // Matches: "123 B", "1.5 KB", "25.3 MB", "1.2 GB"
        const pattern = /^(\d+ B|\d+\.\d KB|\d+\.\d MB|\d+\.\d GB)$/;
        expect(result).toMatch(pattern);
      }),
      { numRuns: 100 }
    );
  });

  it('SHALL format bytes < 1024 as exact integer with " B" suffix', () => {
    const smallBytesArb = fc.integer({ min: 0, max: 1023 });
    fc.assert(
      fc.property(smallBytesArb, (bytes) => {
        const result = formatFileSize(bytes);
        expect(result).toBe(`${bytes} B`);
      }),
      { numRuns: 100 }
    );
  });

  it('SHALL format bytes >= 1024 and < 1048576 as "X.Y KB"', () => {
    const kbArb = fc.integer({ min: 1024, max: 1048575 });
    fc.assert(
      fc.property(kbArb, (bytes) => {
        const result = formatFileSize(bytes);
        expect(result).toMatch(/^\d+\.\d KB$/);
      }),
      { numRuns: 100 }
    );
  });

  it('SHALL format bytes >= 1048576 and < 1073741824 as "X.Y MB"', () => {
    const mbArb = fc.integer({ min: 1048576, max: 1073741823 });
    fc.assert(
      fc.property(mbArb, (bytes) => {
        const result = formatFileSize(bytes);
        expect(result).toMatch(/^\d+\.\d MB$/);
      }),
      { numRuns: 100 }
    );
  });

  it('SHALL format bytes >= 1073741824 as "X.Y GB"', () => {
    const gbArb = fc.integer({ min: 1073741824, max: MAX_BYTES });
    fc.assert(
      fc.property(gbArb, (bytes) => {
        const result = formatFileSize(bytes);
        expect(result).toMatch(/^\d+\.\d GB$/);
      }),
      { numRuns: 100 }
    );
  });

  it('SHALL be deterministic (same input always produces same output)', () => {
    fc.assert(
      fc.property(bytesArb, (bytes) => {
        const result1 = formatFileSize(bytes);
        const result2 = formatFileSize(bytes);
        expect(result1).toBe(result2);
      }),
      { numRuns: 100 }
    );
  });
});
