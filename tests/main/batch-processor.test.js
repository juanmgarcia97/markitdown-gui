import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BatchProcessor } from '../../src/main/batch-processor.js';

vi.mock('../../src/main/logger', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    getLogPath: vi.fn().mockReturnValue('/tmp/markitdown-gui.log'),
  },
}));

/**
 * Creates a mock PythonBridge instance.
 * @param {Object} [overrides] - Methods to override
 * @returns {Object} Mock PythonBridge
 */
function createMockPythonBridge(overrides = {}) {
  return {
    convert: vi.fn().mockResolvedValue({ success: true, markdown: '# Converted' }),
    ...overrides,
  };
}

/**
 * Creates a mock OutputManager instance.
 * @param {Object} [overrides] - Methods to override
 * @returns {Object} Mock OutputManager
 */
function createMockOutputManager(overrides = {}) {
  return {
    resolveOutputPath: vi.fn().mockImplementation((inputPath, outputDir) => {
      const name = inputPath.split('/').pop().replace(/\.[^.]+$/, '.md');
      return Promise.resolve(`/output/${name}`);
    }),
    writeOutput: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/**
 * Creates sample file items for testing.
 * @param {number} count - Number of files to create
 * @returns {Array} Array of FileItem objects
 */
function createFiles(count) {
  const files = [];
  for (let i = 0; i < count; i++) {
    files.push({
      path: `/input/file${i}.pdf`,
      name: `file${i}.pdf`,
      extension: 'pdf',
      size: 1024 * (i + 1),
      status: 'pending',
    });
  }
  return files;
}

describe('BatchProcessor', () => {
  let processor;
  let mockBridge;
  let mockOutput;

  beforeEach(() => {
    mockBridge = createMockPythonBridge();
    mockOutput = createMockOutputManager();
    processor = new BatchProcessor(mockBridge, mockOutput);
  });

  describe('process', () => {
    it('should process all files sequentially and return correct counts', async () => {
      const files = createFiles(3);
      const onProgress = vi.fn();

      const result = await processor.process(files, '/output', onProgress);

      expect(result.successful).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.cancelled).toBe(0);
      expect(result.results).toHaveLength(3);
      expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should call pythonBridge.convert for each file', async () => {
      const files = createFiles(2);

      await processor.process(files, '/output', vi.fn());

      expect(mockBridge.convert).toHaveBeenCalledTimes(2);
      expect(mockBridge.convert).toHaveBeenCalledWith('/input/file0.pdf', expect.any(String));
      expect(mockBridge.convert).toHaveBeenCalledWith('/input/file1.pdf', expect.any(String));
    });

    it('should call outputManager.resolveOutputPath and writeOutput on success', async () => {
      const files = createFiles(1);

      await processor.process(files, '/custom-output', vi.fn());

      expect(mockOutput.resolveOutputPath).toHaveBeenCalledWith('/input/file0.pdf', '/custom-output');
      expect(mockOutput.writeOutput).toHaveBeenCalledWith('/output/file0.md', '# Converted');
    });

    it('should continue processing after an individual file failure', async () => {
      const files = createFiles(3);
      mockBridge.convert = vi.fn()
        .mockResolvedValueOnce({ success: true, markdown: '# File 0' })
        .mockRejectedValueOnce(new Error('Conversion failed'))
        .mockResolvedValueOnce({ success: true, markdown: '# File 2' });

      const result = await processor.process(files, '/output', vi.fn());

      expect(result.successful).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.cancelled).toBe(0);
      expect(result.results).toHaveLength(3);
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toBe('Conversion failed');
    });

    it('should handle response with success:false as a failure', async () => {
      const files = createFiles(1);
      mockBridge.convert.mockResolvedValue({ success: false, error: 'Unsupported format' });

      const result = await processor.process(files, '/output', vi.fn());

      expect(result.successful).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toBe('Unsupported format');
    });

    it('should emit progress before and after each file', async () => {
      const files = createFiles(2);
      const onProgress = vi.fn();

      await processor.process(files, '/output', onProgress);

      // Before file 0: percentage=0, after file 0: percentage=50
      // Before file 1: percentage=50, after file 1: percentage=100
      expect(onProgress).toHaveBeenCalledTimes(4);

      // Before processing file 0
      expect(onProgress).toHaveBeenNthCalledWith(1, {
        percentage: 0,
        currentFile: 'file0.pdf',
        currentIndex: 1,
        totalFiles: 2,
      });

      // After processing file 0
      expect(onProgress).toHaveBeenNthCalledWith(2, {
        percentage: 50,
        currentFile: 'file0.pdf',
        currentIndex: 1,
        totalFiles: 2,
      });

      // Before processing file 1
      expect(onProgress).toHaveBeenNthCalledWith(3, {
        percentage: 50,
        currentFile: 'file1.pdf',
        currentIndex: 2,
        totalFiles: 2,
      });

      // After processing file 1
      expect(onProgress).toHaveBeenNthCalledWith(4, {
        percentage: 100,
        currentFile: 'file1.pdf',
        currentIndex: 2,
        totalFiles: 2,
      });
    });

    it('should report percentage as Math.round((i/totalFiles)*100) after processing', async () => {
      const files = createFiles(3);
      const onProgress = vi.fn();

      await processor.process(files, '/output', onProgress);

      // After file 0: Math.round(1/3 * 100) = 33
      // After file 1: Math.round(2/3 * 100) = 67
      // After file 2: Math.round(3/3 * 100) = 100
      const afterCalls = onProgress.mock.calls.filter((_, idx) => idx % 2 === 1);
      expect(afterCalls[0][0].percentage).toBe(33);
      expect(afterCalls[1][0].percentage).toBe(67);
      expect(afterCalls[2][0].percentage).toBe(100);
    });

    it('should work without onProgress callback', async () => {
      const files = createFiles(2);

      const result = await processor.process(files, '/output', null);

      expect(result.successful).toBe(2);
    });

    it('should include totalTimeMs in the result', async () => {
      const files = createFiles(1);

      const result = await processor.process(files, '/output', vi.fn());

      expect(typeof result.totalTimeMs).toBe('number');
      expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should include outputPath in successful results', async () => {
      const files = createFiles(1);

      const result = await processor.process(files, '/output', vi.fn());

      expect(result.results[0].outputPath).toBe('/output/file0.md');
    });

    it('should handle outputManager errors as file failures', async () => {
      const files = createFiles(2);
      mockOutput.resolveOutputPath = vi.fn()
        .mockRejectedValueOnce(new Error('Suffix limit reached'))
        .mockResolvedValueOnce('/output/file1.md');

      const result = await processor.process(files, '/output', vi.fn());

      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.results[0].error).toBe('Suffix limit reached');
    });
  });

  describe('cancel', () => {
    it('should stop processing remaining files after cancel is called', async () => {
      const files = createFiles(5);
      const onProgress = vi.fn();

      // Make the second convert call trigger cancellation
      let callCount = 0;
      mockBridge.convert = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          processor.cancel();
        }
        return Promise.resolve({ success: true, markdown: '# Content' });
      });

      const result = await processor.process(files, '/output', onProgress);

      // 2 files processed successfully, 3 cancelled
      expect(result.successful).toBe(2);
      expect(result.cancelled).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.successful + result.failed + result.cancelled).toBe(5);
    });

    it('should complete the current file before stopping', async () => {
      const files = createFiles(3);

      // Cancel during first file - the first file should still complete
      mockBridge.convert = vi.fn().mockImplementation(() => {
        processor.cancel();
        return Promise.resolve({ success: true, markdown: '# Done' });
      });

      const result = await processor.process(files, '/output', vi.fn());

      expect(result.successful).toBe(1);
      expect(result.cancelled).toBe(2);
      expect(mockBridge.convert).toHaveBeenCalledTimes(1);
    });

    it('should mark remaining files as cancelled in results', async () => {
      const files = createFiles(3);

      mockBridge.convert = vi.fn()
        .mockImplementationOnce(() => Promise.resolve({ success: true, markdown: '# OK' }))
        .mockImplementationOnce(() => {
          processor.cancel();
          return Promise.resolve({ success: true, markdown: '# OK2' });
        });

      const result = await processor.process(files, '/output', vi.fn());

      expect(result.results[2].success).toBe(false);
      expect(result.results[2].error).toBe('Cancelled by user');
    });
  });

  describe('isProcessing', () => {
    it('should return false initially', () => {
      expect(processor.isProcessing()).toBe(false);
    });

    it('should return true while processing', async () => {
      const files = createFiles(1);
      let duringProcessing = false;

      mockBridge.convert = vi.fn().mockImplementation(() => {
        duringProcessing = processor.isProcessing();
        return Promise.resolve({ success: true, markdown: '# Content' });
      });

      await processor.process(files, '/output', vi.fn());

      expect(duringProcessing).toBe(true);
    });

    it('should return false after processing completes', async () => {
      const files = createFiles(1);

      await processor.process(files, '/output', vi.fn());

      expect(processor.isProcessing()).toBe(false);
    });

    it('should return false after processing is cancelled', async () => {
      const files = createFiles(3);

      mockBridge.convert = vi.fn().mockImplementation(() => {
        processor.cancel();
        return Promise.resolve({ success: true, markdown: '# Content' });
      });

      await processor.process(files, '/output', vi.fn());

      expect(processor.isProcessing()).toBe(false);
    });
  });

  describe('empty file list', () => {
    it('should handle empty file list gracefully and return zero counts', async () => {
      const files = [];
      const onProgress = vi.fn();

      const result = await processor.process(files, '/output', onProgress);

      expect(result.successful).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.cancelled).toBe(0);
      expect(result.results).toHaveLength(0);
      expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
      expect(onProgress).not.toHaveBeenCalled();
      expect(mockBridge.convert).not.toHaveBeenCalled();
    });
  });

  describe('fault tolerance', () => {
    it('should handle mixed successes and failures correctly', async () => {
      const files = createFiles(5);
      mockBridge.convert = vi.fn()
        .mockResolvedValueOnce({ success: true, markdown: '# OK' })
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({ success: true, markdown: '# OK' })
        .mockResolvedValueOnce({ success: false, error: 'Bad format' })
        .mockResolvedValueOnce({ success: true, markdown: '# OK' });

      const result = await processor.process(files, '/output', vi.fn());

      expect(result.successful).toBe(3);
      expect(result.failed).toBe(2);
      expect(result.cancelled).toBe(0);
      expect(result.successful + result.failed + result.cancelled).toBe(5);
    });

    it('should continue after all types of errors', async () => {
      const files = createFiles(3);
      mockBridge.convert = vi.fn()
        .mockRejectedValueOnce(new Error('Process crash'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({ success: true, markdown: '# Finally' });

      const result = await processor.process(files, '/output', vi.fn());

      expect(result.successful).toBe(1);
      expect(result.failed).toBe(2);
      expect(mockBridge.convert).toHaveBeenCalledTimes(3);
    });

    it('should ensure successful + failed + cancelled equals total files', async () => {
      const files = createFiles(4);
      mockBridge.convert = vi.fn()
        .mockResolvedValueOnce({ success: true, markdown: '# OK' })
        .mockRejectedValueOnce(new Error('Error'))
        .mockImplementationOnce(() => {
          processor.cancel();
          return Promise.resolve({ success: true, markdown: '# OK' });
        });

      const result = await processor.process(files, '/output', vi.fn());

      expect(result.successful + result.failed + result.cancelled).toBe(4);
    });
  });
});
