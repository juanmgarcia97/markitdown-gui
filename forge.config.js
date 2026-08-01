// macOS Code Signing & Notarization
// -----------------------------------
// The following environment variables must be set for macOS signing and notarization:
//   APPLE_ID              - Apple Developer account email (e.g., dev@example.com)
//   APPLE_ID_PASSWORD     - App-specific password generated at appleid.apple.com (NOT the account password)
//   APPLE_TEAM_ID         - Apple Developer Team ID (10-character alphanumeric, e.g., ABC1234DEF)
//
// The signing identity "Developer ID Application" must be installed in the macOS Keychain.
// To generate an app-specific password: https://support.apple.com/en-us/102654
//
// These are only required when building on macOS for distribution. Local development
// builds (electron-forge start) do not require signing.

const fs = require('fs');
const path = require('path');

// Only include extraResource entries that exist on disk.
// python-env is created by `npm run setup-python` and may not be present during dev builds.
const extraResource = ['./python-env', './src/python'].filter((p) =>
  fs.existsSync(path.resolve(__dirname, p))
);

module.exports = {
  packagerConfig: {
    asar: true,
    name: 'MarkItDown GUI',
    icon: './assets/icon',
    extraResource,
    osxUniversal: {
      x64ArchFiles: '*',
    },
    // macOS code signing and notarization (only when credentials are available)
    ...(process.platform === 'darwin' && process.env.APPLE_ID && process.env.APPLE_ID_PASSWORD && process.env.APPLE_TEAM_ID ? {
      osxSign: {
        optionsForFile: () => ({
          entitlements: './entitlements.plist',
          'entitlements-inherit': './entitlements.plist',
          'hardened-runtime': true,
        }),
      },
      osxNotarize: {
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_ID_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID,
      },
    } : {}),
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'markitdown-gui',
        authors: 'Juan Martin Garcia',
        setupExe: 'MarkItDown-GUI-Setup.exe',
        setupIcon: './assets/icon.ico',
        iconUrl: 'https://raw.githubusercontent.com/jmgarcia/markitdown-gui/main/assets/icon.ico',
        createDesktopShortcut: true,
      },
    },
    {
      name: '@electron-forge/maker-dmg',
      config: {
        name: 'MarkItDown GUI',
        icon: './assets/icon.icns',
        format: 'ULFO',
      },
      platforms: ['darwin'],
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-webpack',
      config: {
        mainConfig: './webpack.main.config.js',
        renderer: {
          config: './webpack.renderer.config.js',
          entryPoints: [
            {
              html: './src/renderer/index.html',
              js: './src/renderer/renderer.js',
              name: 'main_window',
              preload: {
                js: './src/main/preload.js',
              },
            },
          ],
        },
      },
    },
  ],
};
