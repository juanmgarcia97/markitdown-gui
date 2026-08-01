#!/usr/bin/env node

/**
 * generate-icons.js
 *
 * Script de ayuda para generar los íconos de la aplicación a partir de un PNG fuente.
 *
 * Requisitos:
 *   - Un archivo PNG fuente de 1024x1024 píxeles (recomendado con transparencia)
 *   - Herramientas del sistema (ver instrucciones por plataforma)
 *
 * Uso:
 *   node scripts/generate-icons.js <ruta-al-png-fuente>
 *
 * Ejemplo:
 *   node scripts/generate-icons.js ./design/app-icon-1024.png
 *
 * === INSTRUCCIONES MANUALES ===
 *
 * Si prefieres generar los íconos manualmente:
 *
 * 1. icon.png (512x512 o 1024x1024)
 *    - Usa tu PNG fuente directamente o redimensiónalo a 512x512
 *    - Se usa como ícono genérico y para Linux
 *
 * 2. icon.ico (Windows)
 *    - Debe contener múltiples tamaños: 16x16, 32x32, 48x48, 64x64, 128x128, 256x256
 *    - Herramientas recomendadas:
 *      - macOS/Linux: `png2ico` o `icotool` (de icoutils)
 *      - Online: https://icoconvert.com/
 *      - ImageMagick: convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
 *
 * 3. icon.icns (macOS)
 *    - Debe contener tamaños: 16, 32, 64, 128, 256, 512, 1024 (con @2x variants)
 *    - En macOS, usa iconutil:
 *        mkdir icon.iconset
 *        sips -z 16 16 icon.png --out icon.iconset/icon_16x16.png
 *        sips -z 32 32 icon.png --out icon.iconset/icon_16x16@2x.png
 *        sips -z 32 32 icon.png --out icon.iconset/icon_32x32.png
 *        sips -z 64 64 icon.png --out icon.iconset/icon_32x32@2x.png
 *        sips -z 128 128 icon.png --out icon.iconset/icon_128x128.png
 *        sips -z 256 256 icon.png --out icon.iconset/icon_128x128@2x.png
 *        sips -z 256 256 icon.png --out icon.iconset/icon_256x256.png
 *        sips -z 512 512 icon.png --out icon.iconset/icon_256x256@2x.png
 *        sips -z 512 512 icon.png --out icon.iconset/icon_512x512.png
 *        sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png
 *        iconutil -c icns icon.iconset -o assets/icon.icns
 *        rm -rf icon.iconset
 *
 * === GENERACIÓN AUTOMÁTICA (solo macOS con sips + iconutil) ===
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.resolve(__dirname, '..', 'assets');

function main() {
  const sourcePng = process.argv[2];

  if (!sourcePng) {
    console.log('Uso: node scripts/generate-icons.js <ruta-al-png-fuente>');
    console.log('');
    console.log('El PNG fuente debe ser de al menos 1024x1024 píxeles.');
    console.log('');
    console.log('Actualmente los archivos en assets/ son placeholders.');
    console.log('Reemplázalos con íconos reales antes de hacer el build de producción.');
    process.exit(0);
  }

  const resolvedSource = path.resolve(sourcePng);

  if (!fs.existsSync(resolvedSource)) {
    console.error(`Error: No se encontró el archivo fuente: ${resolvedSource}`);
    process.exit(1);
  }

  console.log(`Generando íconos desde: ${resolvedSource}`);
  console.log(`Directorio de salida: ${ASSETS_DIR}`);
  console.log('');

  // Copy as icon.png
  fs.copyFileSync(resolvedSource, path.join(ASSETS_DIR, 'icon.png'));
  console.log('✓ Copiado icon.png');

  // Generate .icns (macOS only)
  if (process.platform === 'darwin') {
    try {
      generateIcns(resolvedSource);
      console.log('✓ Generado icon.icns');
    } catch (err) {
      console.warn('⚠ No se pudo generar icon.icns:', err.message);
      console.warn('  Genera manualmente siguiendo las instrucciones del script.');
    }
  } else {
    console.log('⚠ icon.icns: Solo se puede generar automáticamente en macOS.');
    console.log('  Usa iconutil en macOS o una herramienta online.');
  }

  // Generate .ico
  try {
    generateIco(resolvedSource);
    console.log('✓ Generado icon.ico');
  } catch (err) {
    console.warn('⚠ No se pudo generar icon.ico:', err.message);
    console.warn('  Instala ImageMagick o usa una herramienta online.');
  }

  console.log('');
  console.log('Generación completada. Verifica los archivos en assets/.');
}

function generateIcns(sourcePng) {
  const iconsetDir = path.join(ASSETS_DIR, 'icon.iconset');

  if (fs.existsSync(iconsetDir)) {
    fs.rmSync(iconsetDir, { recursive: true });
  }
  fs.mkdirSync(iconsetDir);

  const sizes = [
    { name: 'icon_16x16.png', size: 16 },
    { name: 'icon_16x16@2x.png', size: 32 },
    { name: 'icon_32x32.png', size: 32 },
    { name: 'icon_32x32@2x.png', size: 64 },
    { name: 'icon_128x128.png', size: 128 },
    { name: 'icon_128x128@2x.png', size: 256 },
    { name: 'icon_256x256.png', size: 256 },
    { name: 'icon_256x256@2x.png', size: 512 },
    { name: 'icon_512x512.png', size: 512 },
    { name: 'icon_512x512@2x.png', size: 1024 },
  ];

  for (const { name, size } of sizes) {
    const outPath = path.join(iconsetDir, name);
    execSync(`sips -z ${size} ${size} "${sourcePng}" --out "${outPath}"`, {
      stdio: 'pipe',
    });
  }

  const icnsPath = path.join(ASSETS_DIR, 'icon.icns');
  execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`, {
    stdio: 'pipe',
  });

  fs.rmSync(iconsetDir, { recursive: true });
}

function generateIco(sourcePng) {
  // Try ImageMagick (convert or magick command)
  const icoPath = path.join(ASSETS_DIR, 'icon.ico');
  const sizes = '256,128,64,48,32,16';

  try {
    execSync(
      `magick "${sourcePng}" -define icon:auto-resize=${sizes} "${icoPath}"`,
      { stdio: 'pipe' }
    );
  } catch {
    // Fallback to `convert` (older ImageMagick)
    execSync(
      `convert "${sourcePng}" -define icon:auto-resize=${sizes} "${icoPath}"`,
      { stdio: 'pipe' }
    );
  }
}

main();
