import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

/**
 * Feature: markitdown-gui, Property 1: JSON protocol round-trip
 *
 * For any valid `BridgeCommand` object conforming to the protocol schema (with fields
 * `type`, `id`, and optionally `filePath`), serializing it to a JSON string
 * (newline-delimited) and then parsing it back SHALL produce an object with identical
 * properties and values (deep equality).
 *
 * Validates: Requirements 5.4, 9.5
 */

// --- Arbitraries for BridgeCommand ---

// UUID-like id generator (standard UUID v4 format)
const uuidArb = fc.uuid();

// File paths with various characters including unicode, spaces, special chars
const filePathArb = fc.oneof(
  // Standard paths
  fc.constantFrom(
    '/home/user/document.pdf',
    '/tmp/file.docx',
    'C:\\Users\\test\\file.xlsx',
    '/var/data/report.pptx'
  ),
  // Paths with spaces
  fc.tuple(
    fc.constantFrom('/home/user/', '/tmp/', 'C:\\Users\\', '/var/data/'),
    fc.stringMatching(/^[a-zA-Z0-9 _-]{1,30}$/),
    fc.constantFrom('.pdf', '.docx', '.xlsx', '.html', '.md')
  ).map(([dir, name, ext]) => `${dir}${name}${ext}`),
  // Paths with unicode characters
  fc.tuple(
    fc.constantFrom('/home/', '/tmp/', '/data/'),
    fc.string({ minLength: 1, maxLength: 20 }),
    fc.constantFrom('.pdf', '.txt', '.md')
  ).map(([dir, name, ext]) => `${dir}${name}${ext}`),
  // Paths with special characters
  fc.tuple(
    fc.constantFrom('/home/user/', '/tmp/files/'),
    fc.stringMatching(/^[a-zA-Z0-9!@#$%^&()+=\[\]{}'~`,. -]{1,25}$/),
    fc.constantFrom('.pdf', '.docx', '.csv')
  ).map(([dir, name, ext]) => `${dir}${name}${ext}`)
);

// BridgeCommand: convert type (has filePath)
const convertCommandArb = fc.record({
  type: fc.constant('convert'),
  id: uuidArb,
  filePath: filePathArb,
});

// BridgeCommand: health type (no filePath)
const healthCommandArb = fc.record({
  type: fc.constant('health'),
  id: uuidArb,
});

// BridgeCommand: shutdown type (no filePath)
const shutdownCommandArb = fc.record({
  type: fc.constant('shutdown'),
  id: uuidArb,
});

// Any valid BridgeCommand
const bridgeCommandArb = fc.oneof(convertCommandArb, healthCommandArb, shutdownCommandArb);

// --- Arbitraries for BridgeResponse ---

// Successful result response
const successResultArb = fc.record({
  type: fc.constant('result'),
  id: uuidArb,
  success: fc.constant(true),
  markdown: fc.string({ minLength: 0, maxLength: 500 }),
});

// Error result response
const errorResultArb = fc.record({
  type: fc.constant('result'),
  id: uuidArb,
  success: fc.constant(false),
  error: fc.stringMatching(/^[a-zA-Z0-9 :_\-.,!()]{1,100}$/),
});

// Health response
const healthResponseArb = fc.record({
  type: fc.constant('health'),
  id: uuidArb,
  status: fc.constant('ok'),
  version: fc.stringMatching(/^\d+\.\d+\.\d+$/),
});

// Any valid BridgeResponse
const bridgeResponseArb = fc.oneof(successResultArb, errorResultArb, healthResponseArb);

describe('Property 1: JSON protocol round-trip', () => {
  it('BridgeCommand: serialize to JSON and parse back SHALL produce deep equal object', () => {
    fc.assert(
      fc.property(bridgeCommandArb, (command) => {
        const serialized = JSON.stringify(command);
        const parsed = JSON.parse(serialized);

        // Verify all properties and values are identical (deep equality)
        expect(parsed).toEqual(command);

        // Also verify the parsed object has the exact same keys
        expect(Object.keys(parsed).sort()).toEqual(Object.keys(command).sort());
      }),
      { numRuns: 100 }
    );
  });

  it('BridgeResponse: serialize to JSON and parse back SHALL produce deep equal object', () => {
    fc.assert(
      fc.property(bridgeResponseArb, (response) => {
        const serialized = JSON.stringify(response);
        const parsed = JSON.parse(serialized);

        // Verify all properties and values are identical (deep equality)
        expect(parsed).toEqual(response);

        // Also verify the parsed object has the exact same keys
        expect(Object.keys(parsed).sort()).toEqual(Object.keys(response).sort());
      }),
      { numRuns: 100 }
    );
  });

  it('Newline-delimited format: JSON.stringify(cmd) + newline split and parsed yields original', () => {
    fc.assert(
      fc.property(bridgeCommandArb, (command) => {
        // Serialize with newline delimiter (as used in the protocol)
        const delimited = JSON.stringify(command) + '\n';

        // Split by newline and parse non-empty lines
        const lines = delimited.split('\n').filter((line) => line.trim().length > 0);

        expect(lines).toHaveLength(1);

        const parsed = JSON.parse(lines[0]);
        expect(parsed).toEqual(command);
      }),
      { numRuns: 100 }
    );
  });
});
