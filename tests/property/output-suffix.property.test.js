import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import os from 'os';

const require = createRequire(import.meta.url);
const { OutputManager } = require('../../src/main/output-manager');
const { LIMITS } = require('../../src/shared/constants');

/**
 * Feature: markitdown-gui, Property 4: Output filename suffix resolution
 *
 * For any base filename and a set of existing files in the output directory,
 * `resolveOutputPath` SHALL produce a filename that does not collide with any
 * existing file, using incremental numeric suffixes `_1` through `_99`.
 * The resulting filename SHALL always end in `.md`.
 *
 * Validates: Requirements 3.3, 3.4
 */

// Arbitrary: generates a random alphanumeric filename base (1-15 chars)
const fileBaseName = fc.stringMatching(/^[a-zA-Z0-9]{1,15}$/);

// Arbitrary: generates a random file extension (non-.md, to simulate input files)
const inputExtension = fc.constantFrom('pdf', 'docx', 'pptx', 'xlsx', 'html', 'txt', 'csv', 'json');

// Arbitrary: generates a number of existing conflicting files (0 to 98)
const conflictCount = fc.integer({ min: 0, max: 98 });

describe('Property 4: Output filename suffix resolution', () => {
  const outputManager = new OutputManager();
  let tempDir;

  beforeEach(() => {
    // Use realpathSync to resolve macOS /var -> /private/var symlinks
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'markitdown-suffix-test-')));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('SHALL produce a non-colliding .md path in the correct output directory for 0-98 existing conflicts', async () => {
    await fc.assert(
      fc.asyncProperty(fileBaseName, inputExtension, conflictCount, async (baseName, ext, numConflicts) => {
        // Clean the temp dir for this iteration
        const files = fs.readdirSync(tempDir);
        for (const f of files) {
          fs.unlinkSync(path.join(tempDir, f));
        }

        // Create the base .md file if numConflicts > 0
        const existingFiles = [];
        if (numConflicts > 0) {
          const baseFile = path.join(tempDir, `${baseName}.md`);
          fs.writeFileSync(baseFile, '');
          existingFiles.push(baseFile);
        }

        // Create suffixed files _1 through _(numConflicts - 1)
        for (let i = 1; i < numConflicts; i++) {
          const suffixedFile = path.join(tempDir, `${baseName}_${i}.md`);
          fs.writeFileSync(suffixedFile, '');
          existingFiles.push(suffixedFile);
        }

        // Build input file path (simulated)
        const inputFilePath = path.join('/tmp/inputs', `${baseName}.${ext}`);

        // Call resolveOutputPath
        const resolvedPath = await outputManager.resolveOutputPath(inputFilePath, tempDir);

        // 1. Result must end in .md
        expect(resolvedPath).toMatch(/\.md$/);

        // 2. Result must be in the correct output directory
        expect(path.dirname(resolvedPath)).toBe(tempDir);

        // 3. Result must not collide with any existing file
        const existingSet = new Set(existingFiles.map((f) => path.resolve(f)));
        expect(existingSet.has(path.resolve(resolvedPath))).toBe(false);

        // 4. The file should not exist on disk
        expect(fs.existsSync(resolvedPath)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('SHALL throw an error when all 99 suffixes plus base are taken (100 files exist)', async () => {
    await fc.assert(
      fc.asyncProperty(fileBaseName, inputExtension, async (baseName, ext) => {
        // Clean the temp dir for this iteration
        const files = fs.readdirSync(tempDir);
        for (const f of files) {
          fs.unlinkSync(path.join(tempDir, f));
        }

        // Create the base .md file
        fs.writeFileSync(path.join(tempDir, `${baseName}.md`), '');

        // Create all suffixed files _1 through _99
        for (let i = 1; i <= LIMITS.MAX_SUFFIX; i++) {
          fs.writeFileSync(path.join(tempDir, `${baseName}_${i}.md`), '');
        }

        // Build input file path
        const inputFilePath = path.join('/tmp/inputs', `${baseName}.${ext}`);

        // resolveOutputPath should throw
        await expect(
          outputManager.resolveOutputPath(inputFilePath, tempDir)
        ).rejects.toThrow();
      }),
      { numRuns: 100 }
    );
  });
});
