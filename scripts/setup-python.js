'use strict';

/**
 * setup-python.js
 *
 * Downloads python-build-standalone from Astral and installs markitdown
 * into a local `python-env/` directory for embedding in the Electron app.
 *
 * Usage: node scripts/setup-python.js
 *
 * Environment variables:
 *   PYTHON_BUILD_STANDALONE_VERSION - Override the release tag (default: latest known)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { createWriteStream, mkdirSync, rmSync } = fs;

// Configuration
const PYTHON_VERSION = '3.12.8';
const RELEASE_TAG = process.env.PYTHON_BUILD_STANDALONE_VERSION || '20241219';
const BASE_URL = `https://github.com/astral-sh/python-build-standalone/releases/download/${RELEASE_TAG}`;
const PROJECT_ROOT = path.resolve(__dirname, '..');
const PYTHON_ENV_DIR = path.join(PROJECT_ROOT, 'python-env');

/**
 * Determines the correct download filename based on platform and architecture.
 * @returns {string} The filename to download
 */
function getDownloadFilename() {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'darwin') {
    if (arch === 'arm64') {
      return `cpython-${PYTHON_VERSION}+${RELEASE_TAG}-aarch64-apple-darwin-install_only.tar.gz`;
    }
    return `cpython-${PYTHON_VERSION}+${RELEASE_TAG}-x86_64-apple-darwin-install_only.tar.gz`;
  }

  if (platform === 'win32') {
    if (arch === 'arm64') {
      return `cpython-${PYTHON_VERSION}+${RELEASE_TAG}-aarch64-pc-windows-msvc-install_only.tar.gz`;
    }
    return `cpython-${PYTHON_VERSION}+${RELEASE_TAG}-x86_64-pc-windows-msvc-install_only.tar.gz`;
  }

  // Linux fallback (for CI/development)
  if (arch === 'arm64') {
    return `cpython-${PYTHON_VERSION}+${RELEASE_TAG}-aarch64-unknown-linux-gnu-install_only.tar.gz`;
  }
  return `cpython-${PYTHON_VERSION}+${RELEASE_TAG}-x86_64-unknown-linux-gnu-install_only.tar.gz`;
}

/**
 * Downloads a file from a URL, following redirects.
 * @param {string} url - URL to download
 * @param {string} destPath - Destination file path
 * @returns {Promise<void>}
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destPath);

    const request = (currentUrl) => {
      https.get(currentUrl, (response) => {
        // Follow redirects (GitHub releases use 302)
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (!redirectUrl) {
            reject(new Error('Redirect without location header'));
            return;
          }
          request(redirectUrl);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Download failed with status ${response.statusCode}: ${currentUrl}`));
          return;
        }

        const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;

        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (totalBytes > 0) {
            const percent = Math.round((downloadedBytes / totalBytes) * 100);
            process.stdout.write(`\r  Downloading... ${percent}% (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB)`);
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          process.stdout.write('\n');
          resolve();
        });

        file.on('error', (err) => {
          fs.unlinkSync(destPath);
          reject(err);
        });
      }).on('error', (err) => {
        fs.unlinkSync(destPath);
        reject(err);
      });
    };

    request(url);
  });
}

/**
 * Moves a directory cross-platform, handling cross-device scenarios.
 * @param {string} src - Source directory path
 * @param {string} dest - Destination directory path
 */
function moveDir(src, dest) {
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    // Cross-device move: copy then delete
    if (err.code === 'EXDEV') {
      if (process.platform === 'win32') {
        execSync(`xcopy "${src}" "${dest}" /E /I /H /Y`, { stdio: 'inherit' });
      } else {
        execSync(`cp -a "${src}" "${dest}"`, { stdio: 'inherit' });
      }
      rmSync(src, { recursive: true, force: true });
    } else {
      throw err;
    }
  }
}

/**
 * Extracts a tar.gz archive to the target directory.
 * Uses Node.js tar package on Windows (to avoid colon-in-path issues),
 * and native tar command on Unix systems (faster for large archives).
 * @param {string} archivePath - Path to the .tar.gz file
 * @param {string} destDir - Destination directory
 */
function extractArchive(archivePath, destDir) {
  const tempExtractDir = path.join(PROJECT_ROOT, '_python-extract-tmp');

  if (fs.existsSync(tempExtractDir)) {
    rmSync(tempExtractDir, { recursive: true, force: true });
  }
  mkdirSync(tempExtractDir, { recursive: true });

  console.log('  Extracting archive...');

  if (process.platform === 'win32') {
    // On Windows, use the Node.js tar package to avoid C: being interpreted
    // as a remote host by MSYS2/Git tar
    const tar = require('tar');
    tar.extract({
      file: archivePath,
      cwd: tempExtractDir,
      sync: true,
    });
  } else {
    execSync(`tar -xzf "${archivePath}" -C "${tempExtractDir}"`, { stdio: 'inherit' });
  }

  // The archive extracts to a "python/" subdirectory
  const extractedPythonDir = path.join(tempExtractDir, 'python');

  if (fs.existsSync(extractedPythonDir)) {
    moveDir(extractedPythonDir, destDir);
  } else {
    const entries = fs.readdirSync(tempExtractDir);
    if (entries.length === 1) {
      const singleDir = path.join(tempExtractDir, entries[0]);
      if (fs.statSync(singleDir).isDirectory()) {
        moveDir(singleDir, destDir);
      }
    } else {
      moveDir(tempExtractDir, destDir);
      return;
    }
  }

  if (fs.existsSync(tempExtractDir)) {
    rmSync(tempExtractDir, { recursive: true, force: true });
  }
}

/**
 * Gets the path to the Python executable within python-env.
 * @returns {string}
 */
function getPythonExecutable() {
  if (process.platform === 'win32') {
    return path.join(PYTHON_ENV_DIR, 'python.exe');
  }
  return path.join(PYTHON_ENV_DIR, 'bin', 'python3');
}

/**
 * Installs markitdown into the embedded Python environment.
 * Uses a two-step approach:
 * 1. Try markitdown[all] with --only-binary :all: (prebuilt wheels only, no source compilation)
 * 2. Fall back to core extras (pdf,docx,pptx,xlsx) if that fails (e.g., cryptography has no wheel)
 */
function installMarkitdown() {
  const pythonExe = getPythonExecutable();

  console.log('  Upgrading pip...');
  execSync(`"${pythonExe}" -m pip install --upgrade pip`, { stdio: 'inherit' });

  console.log('  Installing markitdown with all extras (prebuilt wheels only)...');
  try {
    execSync(`"${pythonExe}" -m pip install --only-binary :all: 'markitdown[all]'`, { stdio: 'inherit' });
    console.log('  markitdown[all] installed successfully.');
  } catch (err) {
    console.warn('  markitdown[all] failed (likely missing binary wheel for cryptography).');
    console.log('  Retrying with core extras only (pdf, docx, pptx, xlsx)...');
    execSync(`"${pythonExe}" -m pip install 'markitdown[pdf,docx,pptx,xlsx]'`, { stdio: 'inherit' });
    console.log('  markitdown with core extras installed successfully.');
  }
}

/**
 * Verifies the installation by importing markitdown.
 */
function verifyInstallation() {
  const pythonExe = getPythonExecutable();

  console.log('  Verifying installation...');
  try {
    execSync(`"${pythonExe}" -c "from markitdown import MarkItDown; print('markitdown OK')"`, {
      stdio: 'pipe',
    });
    console.log('  Verification passed: markitdown is importable.');
  } catch (err) {
    console.error('  Verification FAILED: markitdown could not be imported.');
    process.exit(1);
  }
}

/**
 * Main setup flow.
 */
async function main() {
  console.log('=== MarkItDown GUI - Python Environment Setup ===\n');
  console.log(`Platform: ${process.platform} (${process.arch})`);
  console.log(`Python version: ${PYTHON_VERSION}`);
  console.log(`Release tag: ${RELEASE_TAG}`);
  console.log(`Destination: ${PYTHON_ENV_DIR}\n`);

  // Step 1: Clean existing python-env if present
  if (fs.existsSync(PYTHON_ENV_DIR)) {
    console.log('[1/4] Removing existing python-env...');
    rmSync(PYTHON_ENV_DIR, { recursive: true, force: true });
  } else {
    console.log('[1/4] No existing python-env found.');
  }

  // Step 2: Download python-build-standalone
  const filename = getDownloadFilename();
  const downloadUrl = `${BASE_URL}/${filename}`;
  const archivePath = path.join(PROJECT_ROOT, filename);

  console.log(`[2/4] Downloading ${filename}...`);
  console.log(`  URL: ${downloadUrl}`);

  try {
    await downloadFile(downloadUrl, archivePath);
    console.log('  Download complete.');
  } catch (err) {
    console.error(`  Download failed: ${err.message}`);
    process.exit(1);
  }

  // Step 3: Extract to python-env/
  console.log('[3/4] Extracting Python distribution...');
  try {
    extractArchive(archivePath, PYTHON_ENV_DIR);
    console.log(`  Extracted to ${PYTHON_ENV_DIR}`);
  } catch (err) {
    console.error(`  Extraction failed: ${err.message}`);
    process.exit(1);
  }

  // Cleanup downloaded archive
  if (fs.existsSync(archivePath)) {
    fs.unlinkSync(archivePath);
  }

  // Step 4: Install markitdown
  console.log('[4/4] Installing markitdown package...');
  try {
    installMarkitdown();
    verifyInstallation();
  } catch (err) {
    console.error(`  Installation failed: ${err.message}`);
    process.exit(1);
  }

  console.log('\n=== Setup complete! ===');
  console.log(`Python environment ready at: ${PYTHON_ENV_DIR}`);
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
