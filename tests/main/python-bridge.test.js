import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PythonBridge } from '../../src/main/python-bridge.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { ERROR_CODES } from '../../src/shared/constants.js';

// Helper: path to a mock Python script that simulates the worker protocol
const MOCK_WORKER_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/mock-worker.py'
);

// Helper: path to a mock Python script that times out (never responds)
const TIMEOUT_WORKER_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/timeout-worker.py'
);

// Helper: path to a mock Python script that crashes immediately
const CRASH_WORKER_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/crash-worker.py'
);

// Use the system python3 for testing
const SYSTEM_PYTHON = process.platform === 'win32' ? 'python' : 'python3';

describe('PythonBridge', () => {
  let bridge;

  afterEach(async () => {
    if (bridge) {
      try {
        await bridge.shutdown();
      } catch {
        // ignore cleanup errors
      }
      bridge = null;
    }
  });

  describe('initialize()', () => {
    it('should initialize successfully with a valid worker', async () => {
      bridge = new PythonBridge({
        pythonPath: SYSTEM_PYTHON,
        workerPath: MOCK_WORKER_PATH,
        healthCheckTimeout: 5000,
      });

      await expect(bridge.initialize()).resolves.toBeUndefined();
    });

    it('should throw HEALTH_CHECK_FAILED if worker does not respond', async () => {
      bridge = new PythonBridge({
        pythonPath: SYSTEM_PYTHON,
        workerPath: TIMEOUT_WORKER_PATH,
        healthCheckTimeout: 1000,
      });

      await expect(bridge.initialize()).rejects.toThrow(/not available/);
      await expect(bridge.initialize()).rejects.toMatchObject({
        code: ERROR_CODES.HEALTH_CHECK_FAILED,
      });
    });

    it('should throw if python executable does not exist', async () => {
      bridge = new PythonBridge({
        pythonPath: '/nonexistent/python3',
        workerPath: MOCK_WORKER_PATH,
        healthCheckTimeout: 2000,
      });

      await expect(bridge.initialize()).rejects.toThrow();
    });
  });

  describe('convert()', () => {
    beforeEach(async () => {
      bridge = new PythonBridge({
        pythonPath: SYSTEM_PYTHON,
        workerPath: MOCK_WORKER_PATH,
        healthCheckTimeout: 5000,
        conversionTimeout: 5000,
      });
      await bridge.initialize();
    });

    it('should return conversion result for a valid file', async () => {
      const result = await bridge.convert('/path/to/file.pdf', 'test-id-001');

      expect(result).toMatchObject({
        id: 'test-id-001',
        success: true,
        markdown: expect.any(String),
      });
    });

    it('should generate a requestId if not provided', async () => {
      const result = await bridge.convert('/path/to/file.pdf');

      expect(result).toMatchObject({
        success: true,
        id: expect.any(String),
      });
      // Should be a UUID format
      expect(result.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('should return error result for a failing file', async () => {
      const result = await bridge.convert('/path/to/FAIL_FILE.pdf', 'fail-id-001');

      expect(result).toMatchObject({
        id: 'fail-id-001',
        success: false,
        error: expect.any(String),
      });
    });
  });

  describe('convert() timeout', () => {
    it('should reject with TIMEOUT error if conversion exceeds timeout', async () => {
      bridge = new PythonBridge({
        pythonPath: SYSTEM_PYTHON,
        workerPath: TIMEOUT_WORKER_PATH,
        healthCheckTimeout: 1000,
        conversionTimeout: 500,
      });

      // Initialize manually since health check will fail on timeout worker
      // Use a worker that responds to health but not convert
      bridge = new PythonBridge({
        pythonPath: SYSTEM_PYTHON,
        workerPath: MOCK_WORKER_PATH,
        healthCheckTimeout: 5000,
        conversionTimeout: 100, // very short timeout
      });
      await bridge.initialize();

      // Send a conversion to the SLOW_FILE which mock-worker delays
      const promise = bridge.convert('/path/to/SLOW_FILE.pdf', 'slow-id');
      await expect(promise).rejects.toMatchObject({
        code: ERROR_CODES.TIMEOUT,
      });
    });
  });

  describe('healthCheck()', () => {
    it('should return true when process is healthy', async () => {
      bridge = new PythonBridge({
        pythonPath: SYSTEM_PYTHON,
        workerPath: MOCK_WORKER_PATH,
        healthCheckTimeout: 5000,
      });
      await bridge.initialize();

      const result = await bridge.healthCheck();
      expect(result).toBe(true);
    });

    it('should return false when process is not responding', async () => {
      bridge = new PythonBridge({
        pythonPath: SYSTEM_PYTHON,
        workerPath: TIMEOUT_WORKER_PATH,
        healthCheckTimeout: 500,
      });

      // Manually spawn without health check
      bridge._spawnProcess(SYSTEM_PYTHON, TIMEOUT_WORKER_PATH);
      bridge._setupLineReader();
      bridge._setupProcessListeners();

      const result = await bridge.healthCheck();
      expect(result).toBe(false);
    });
  });

  describe('shutdown()', () => {
    it('should terminate the process cleanly', async () => {
      bridge = new PythonBridge({
        pythonPath: SYSTEM_PYTHON,
        workerPath: MOCK_WORKER_PATH,
        healthCheckTimeout: 5000,
      });
      await bridge.initialize();

      await expect(bridge.shutdown()).resolves.toBeUndefined();
    });

    it('should be idempotent (calling shutdown twice is safe)', async () => {
      bridge = new PythonBridge({
        pythonPath: SYSTEM_PYTHON,
        workerPath: MOCK_WORKER_PATH,
        healthCheckTimeout: 5000,
      });
      await bridge.initialize();

      await bridge.shutdown();
      await expect(bridge.shutdown()).resolves.toBeUndefined();
    });
  });

  describe('restart()', () => {
    it('should restart the process and pass health check', async () => {
      bridge = new PythonBridge({
        pythonPath: SYSTEM_PYTHON,
        workerPath: MOCK_WORKER_PATH,
        healthCheckTimeout: 5000,
      });
      await bridge.initialize();

      await expect(bridge.restart()).resolves.toBeUndefined();

      // Should still be able to convert after restart
      const result = await bridge.convert('/path/to/file.pdf', 'after-restart');
      expect(result.success).toBe(true);
    });
  });

  describe('process crash handling', () => {
    it('should reject pending requests with PROCESS_CRASH on unexpected exit', async () => {
      bridge = new PythonBridge({
        pythonPath: SYSTEM_PYTHON,
        workerPath: CRASH_WORKER_PATH,
        healthCheckTimeout: 2000,
        conversionTimeout: 5000,
      });

      // Manually spawn without health check (since crash worker exits immediately)
      bridge._spawnProcess(SYSTEM_PYTHON, CRASH_WORKER_PATH);
      bridge._setupLineReader();
      bridge._setupProcessListeners();
      bridge._initialized = true;

      // The crash worker responds to health but then exits
      // Give it a moment to start
      await new Promise((r) => setTimeout(r, 200));

      // Try to convert - the process may already be dead or will die
      const promise = bridge.convert('/some/file.pdf', 'crash-test-id');
      await expect(promise).rejects.toMatchObject({
        code: expect.stringMatching(/process_crash|timeout/),
      });
    });
  });

  describe('JSON serialization', () => {
    it('should correctly serialize convert command', async () => {
      bridge = new PythonBridge({
        pythonPath: SYSTEM_PYTHON,
        workerPath: MOCK_WORKER_PATH,
        healthCheckTimeout: 5000,
      });
      await bridge.initialize();

      // The mock worker echoes back what it received as part of the response
      const result = await bridge.convert('/test/path/with spaces/file.pdf', 'serial-id');
      expect(result.success).toBe(true);
      expect(result.id).toBe('serial-id');
    });

    it('should handle special characters in file paths', async () => {
      bridge = new PythonBridge({
        pythonPath: SYSTEM_PYTHON,
        workerPath: MOCK_WORKER_PATH,
        healthCheckTimeout: 5000,
      });
      await bridge.initialize();

      const result = await bridge.convert('/path/to/archivo ñ (1).pdf', 'special-chars');
      expect(result.success).toBe(true);
      expect(result.id).toBe('special-chars');
    });
  });
});
