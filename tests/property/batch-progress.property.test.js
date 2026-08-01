import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { BatchProcessor } from '../../src/main/batch-processor.js';

/**
 * Feature: markitdown-gui, Property 6: Batch progress reporting
 *
 * For any list of N files (where N ≥ 1), after processing the i-th file,
 * the Batch Processor SHALL emit a progress update with `percentage` equal to
 * `Math.round((i / N) * 100)`, `currentIndex` equal to `i`, and `totalFiles` equal to `N`.
 *
 * Validates: Requirements 2.3, 9.4
 */

// --- Arbitrary for file lists (1 to 50 files) ---

const fileItemArb = fc.record({
  path: fc.tuple(
    fc.constantFrom('/home/user/', '/tmp/files/', '/data/docs/', 'C:\\Users\\docs\\'),
    fc.stringMatching(/^[a-zA-Z0-9_-]{1,20}$/),
    fc.constantFrom('.pdf', '.docx', '.xlsx', '.pptx', '.html', '.csv', '.txt', '.md')
  ).map(([dir, name, ext]) => ({
    path: `${dir}${name}${ext}`,
    name: `${name}${ext}`,
    extension: ext.slice(1),
    size: 1024,
    status: 'pending',
  })),
}).map(({ path }) => path);

const fileListArb = fc.array(fileItemArb, { minLength: 1, maxLength: 50 });

// --- Helper: create mocks ---

function createMockPythonBridge() {
  return {
    convert: vi.fn().mockResolvedValue({ success: true, markdown: '# Converted' }),
  };
}

function createMockOutputManager() {
  return {
    resolveOutputPath: vi.fn().mockImplementation((inputPath) => {
      const name = inputPath.split(/[/\\]/).pop().replace(/\.[^.]+$/, '.md');
      return Promise.resolve(`/output/${name}`);
    }),
    writeOutput: vi.fn().mockResolvedValue(undefined),
  };
}

describe('Property 6: Batch progress reporting', () => {
  it('after processing the i-th file, percentage === Math.round((i / N) * 100), currentIndex === i, totalFiles === N', async () => {
    await fc.assert(
      fc.asyncProperty(fileListArb, async (files) => {
        const mockBridge = createMockPythonBridge();
        const mockOutput = createMockOutputManager();
        const processor = new BatchProcessor(mockBridge, mockOutput);
        const onProgress = vi.fn();

        await processor.process(files, '/output', onProgress);

        const N = files.length;

        // Total progress calls should be 2 * N (before + after each file)
        expect(onProgress).toHaveBeenCalledTimes(2 * N);

        // Verify "after" progress calls (even-indexed: 1, 3, 5, ...)
        for (let i = 1; i <= N; i++) {
          // The "after" call for the i-th file is at call index (2*i - 1) (0-based)
          const afterCallIndex = 2 * i - 1;
          const call = onProgress.mock.calls[afterCallIndex][0];

          const expectedPercentage = Math.round((i / N) * 100);

          expect(call.percentage).toBe(expectedPercentage);
          expect(call.currentIndex).toBe(i);
          expect(call.totalFiles).toBe(N);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('total number of progress calls is exactly 2 * N (before + after each file)', async () => {
    await fc.assert(
      fc.asyncProperty(fileListArb, async (files) => {
        const mockBridge = createMockPythonBridge();
        const mockOutput = createMockOutputManager();
        const processor = new BatchProcessor(mockBridge, mockOutput);
        const onProgress = vi.fn();

        await processor.process(files, '/output', onProgress);

        expect(onProgress).toHaveBeenCalledTimes(2 * files.length);
      }),
      { numRuns: 100 }
    );
  });
});
