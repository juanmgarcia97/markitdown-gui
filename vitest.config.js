import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js', 'tests/**/*.property.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        perFile: false,
        'src/main/file-validator.js': {
          lines: 80,
        },
        'src/main/output-manager.js': {
          lines: 80,
        },
        'src/main/python-bridge.js': {
          lines: 80,
        },
        'src/main/batch-processor.js': {
          lines: 80,
        },
      },
    },
  },
});
