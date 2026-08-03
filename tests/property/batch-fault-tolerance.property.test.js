import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { BatchProcessor } from '../../src/main/batch-processor.js';

import { vi } from 'vitest';
vi.mock('../../src/main/logger', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    getLogPath: vi.fn().mockReturnValue('/tmp/markitdown-gui.log'),
  },
}));

/**
 * Feature: markitdown-gui, Property 7: Batch fault tolerance
 *
 * For any list of files where some individual conversions fail (throw errors),
 * the Batch Processor SHALL continue processing the remaining files and produce
 * a BatchResult where `successful + failed + cancelled === totalFiles`.
 *
 * Validates: Requirements 2.6, 2.7, 9.4
 */

// --- Arbitraries ---

// Generate a file item with a realistic structure
const fileItemArb = fc.record({
  path: fc.tuple(
    fc.constantFrom('/home/user/', '/tmp/', '/data/', 'C:\\Users\\test\\'),
    fc.stringMatching(/^[a-zA-Z0-9_-]{1,20}$/),
    fc.constantFrom('.pdf', '.docx', '.xlsx', '.pptx', '.html', '.csv', '.txt', '.md')
  ).map(([dir, name, ext]) => `${dir}${name}${ext}`),
  name: fc.stringMatching(/^[a-zA-Z0-9_-]{1,20}$/).map((n) => `${n}.pdf`),
  extension: fc.constantFrom('pdf', 'docx', 'xlsx', 'pptx', 'html', 'csv', 'txt', 'md'),
  size: fc.integer({ min: 100, max: 500 * 1024 * 1024 }),
  status: fc.constant('pending'),
});

// Generate a list of files (1 to 30) with corresponding success/fail decisions
const batchInputArb = fc.integer({ min: 1, max: 30 }).chain((n) =>
  fc.tuple(
    fc.array(fileItemArb, { minLength: n, maxLength: n }),
    fc.array(fc.boolean(), { minLength: n, maxLength: n })
  )
);

describe('Property 7: Batch fault tolerance', () => {
  it('successful + failed + cancelled === totalFiles for any mix of successes and failures', async () => {
    await fc.assert(
      fc.asyncProperty(batchInputArb, async ([files, outcomes]) => {
        // Track which files were actually processed
        let processedCount = 0;

        // Mock PythonBridge: convert either succeeds or throws based on outcomes array
        const mockPythonBridge = {
          convert: async (filePath, requestId) => {
            const index = processedCount;
            processedCount++;
            if (outcomes[index]) {
              return { success: true, markdown: `# Converted ${filePath}` };
            } else {
              throw new Error(`Conversion failed for ${filePath}`);
            }
          },
        };

        // Mock OutputManager: always succeeds
        const mockOutputManager = {
          resolveOutputPath: async (inputPath, outputDir) => {
            return `/output/${inputPath.split('/').pop().replace(/\.[^.]+$/, '.md')}`;
          },
          writeOutput: async (outputPath, content) => {},
        };

        const processor = new BatchProcessor(mockPythonBridge, mockOutputManager);
        const result = await processor.process(files, null, () => {});

        const totalFiles = files.length;

        // Invariant: successful + failed + cancelled === totalFiles
        expect(result.successful + result.failed + result.cancelled).toBe(totalFiles);

        // All files should be processed (no early exit on failure)
        expect(result.results).toHaveLength(totalFiles);

        // Verify counts match outcomes
        const expectedSuccessful = outcomes.filter((o) => o).length;
        const expectedFailed = outcomes.filter((o) => !o).length;
        expect(result.successful).toBe(expectedSuccessful);
        expect(result.failed).toBe(expectedFailed);
        expect(result.cancelled).toBe(0);
      }),
      { numRuns: 100 }
    );
  });

  it('processing continues after failures - all files are attempted', async () => {
    await fc.assert(
      fc.asyncProperty(batchInputArb, async ([files, outcomes]) => {
        const attemptedFiles = [];

        // Mock PythonBridge: track which files were attempted
        const mockPythonBridge = {
          convert: async (filePath, requestId) => {
            attemptedFiles.push(filePath);
            const index = attemptedFiles.length - 1;
            if (outcomes[index]) {
              return { success: true, markdown: '# OK' };
            } else {
              throw new Error('fail');
            }
          },
        };

        const mockOutputManager = {
          resolveOutputPath: async (inputPath) => `/out/${inputPath}`,
          writeOutput: async () => {},
        };

        const processor = new BatchProcessor(mockPythonBridge, mockOutputManager);
        await processor.process(files, null, () => {});

        // Every file must have been attempted regardless of previous failures
        expect(attemptedFiles).toHaveLength(files.length);

        // Each file's path should appear in the attempted list
        for (let i = 0; i < files.length; i++) {
          expect(attemptedFiles[i]).toBe(files[i].path);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('results array has exactly N entries for N input files', async () => {
    await fc.assert(
      fc.asyncProperty(batchInputArb, async ([files, outcomes]) => {
        let processIndex = 0;

        const mockPythonBridge = {
          convert: async (filePath, requestId) => {
            const shouldSucceed = outcomes[processIndex];
            processIndex++;
            if (shouldSucceed) {
              return { success: true, markdown: '# Content' };
            } else {
              throw new Error('error');
            }
          },
        };

        const mockOutputManager = {
          resolveOutputPath: async () => '/output/file.md',
          writeOutput: async () => {},
        };

        const processor = new BatchProcessor(mockPythonBridge, mockOutputManager);
        const result = await processor.process(files, null, () => {});

        // Results array must have exactly N entries
        expect(result.results).toHaveLength(files.length);

        // Each result should have an id and success field
        for (const entry of result.results) {
          expect(entry).toHaveProperty('id');
          expect(typeof entry.success).toBe('boolean');
        }
      }),
      { numRuns: 100 }
    );
  });
});
