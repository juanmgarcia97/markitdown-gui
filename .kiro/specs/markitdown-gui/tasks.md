# Implementation Plan: MarkItDown GUI

## Overview

Implementación incremental de MarkItDown GUI, una aplicación Electron que envuelve la librería markitdown de Microsoft. El plan construye desde los cimientos (scaffold del proyecto, Python bridge, validadores) hasta la UI y el empaquetado final. Se usa JavaScript con Electron Forge + Webpack, Vitest + fast-check para testing, y python-build-standalone para el entorno Python embebido.

## Tasks

- [x] 1. Scaffold del proyecto y configuración base
  - [x] 1.1 Inicializar proyecto con Electron Forge y Webpack
    - Ejecutar `npm init` y configurar `package.json` con metadata del proyecto (nombre, versión, descripción, autor, licencia)
    - Instalar dependencias core: `electron`, `@electron-forge/cli`, `@electron-forge/maker-squirrel`, `@electron-forge/maker-dmg`, `@electron-forge/plugin-webpack`
    - Crear `forge.config.js` con makers para Windows (.exe Squirrel) y macOS (.dmg universal)
    - Crear `webpack.main.config.js` y `webpack.renderer.config.js`
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 1.2 Crear estructura de directorios y archivos base
    - Crear estructura: `src/main/`, `src/renderer/`, `src/shared/`, `src/python/`, `tests/main/`, `tests/property/`, `assets/`
    - Crear `src/main/main.js` con BrowserWindow básico (contextIsolation: true, nodeIntegration: false)
    - Crear `src/main/preload.js` con contextBridge vacío
    - Crear `src/renderer/index.html` con shell HTML básico
    - Crear `src/renderer/renderer.js` como entry point del renderer
    - _Requirements: 8.4, 8.5_

  - [x] 1.3 Configurar Vitest y fast-check
    - Instalar `vitest`, `@vitest/coverage-v8`, `fast-check`
    - Crear `vitest.config.js` con configuración de cobertura (umbral 80% para módulos core)
    - Agregar scripts `test` y `test:coverage` en `package.json`
    - _Requirements: 9.6_

  - [x] 1.4 Crear constantes compartidas
    - Crear `src/shared/constants.js` con `SUPPORTED_FORMATS` (mapa extensión → MIME), límites (MAX_FILE_SIZE: 500MB, MAX_FILES: 100, MAX_SUFFIX: 99, CONVERSION_TIMEOUT: 120000), y códigos de error
    - _Requirements: 1.2, 8.6_

- [x] 2. Checkpoint - Verificar scaffold base
  - Asegurar que `npm start` lanza la ventana Electron vacía sin errores y que `vitest run` ejecuta correctamente. Preguntar al usuario si hay dudas.

- [x] 3. Implementar File Validator
  - [x] 3.1 Crear módulo file-validator.js
    - Implementar clase `FileValidator` con métodos: `validate(filePaths, existingPaths)`, `isSupportedExtension(filePath)`, `detectMimeType(filePath)`, `validateMimeMatch(filePath)`, `hasPathTraversal(filePath)`, `isWithinSizeLimit(filePath)`
    - Instalar dependencia `file-type` para detección de MIME por magic bytes
    - Validar extensión case-insensitive contra `SUPPORTED_FORMATS`
    - Validar MIME real vs extensión
    - Detectar path traversal (`../`, `..\`, rutas que resuelven fuera del ámbito)
    - Verificar tamaño ≤ 500 MB
    - Detectar duplicados contra `existingPaths`
    - Retornar `ValidationResult[]` con errores específicos por archivo
    - _Requirements: 1.2, 1.5, 1.6, 8.1, 8.3, 8.6_

  - [x] 3.2 Write property test: File extension validation consistency
    - **Property 2: File extension validation consistency**
    - **Validates: Requirements 1.2, 8.1**

  - [x] 3.3 Write property test: Path traversal detection
    - **Property 3: Path traversal detection**
    - **Validates: Requirements 8.3**

  - [x] 3.4 Write property test: Duplicate path detection
    - **Property 8: Duplicate path detection**
    - **Validates: Requirements 1.6**

  - [x] 3.5 Write unit tests for FileValidator
    - Archivo aceptado con extensión y MIME válidos
    - Archivo rechazado por extensión no compatible
    - Archivo rechazado por MIME mismatch
    - Archivo rechazado por path traversal
    - Archivo rechazado por exceder 500 MB
    - Archivo duplicado detectado correctamente
    - _Requirements: 9.1_

- [x] 4. Implementar Output Manager
  - [x] 4.1 Crear módulo output-manager.js
    - Implementar clase `OutputManager` con métodos: `resolveOutputPath(inputFilePath, customOutputDir)`, `isWritable(dirPath)`, `writeOutput(outputPath, content)`
    - Si `customOutputDir` es null, usar directorio del archivo original
    - Resolver conflictos de nombre con sufijos _1 a _99
    - Error si se alcanza límite de 99 sufijos
    - Verificar permisos de escritura en directorio destino
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 4.2 Write property test: Output filename suffix resolution
    - **Property 4: Output filename suffix resolution**
    - **Validates: Requirements 3.3, 3.4**

  - [x] 4.3 Write unit tests for OutputManager
    - Generación de nombre sin conflicto
    - Adición de sufijo incremental cuando existe conflicto
    - Uso del directorio original cuando no hay carpeta personalizada
    - Error al alcanzar límite de 99 sufijos
    - Detección de directorio sin permisos de escritura
    - _Requirements: 9.2_

- [x] 5. Implementar Python Bridge
  - [x] 5.1 Crear script worker.py
    - Crear `src/python/worker.py` que lee stdin línea por línea (JSON newline-delimited)
    - Implementar handlers para: `convert` (ejecuta markitdown.convert), `health` (verifica importación), `shutdown` (termina limpiamente)
    - Redirigir stderr para no contaminar stdout
    - Responder con JSON en stdout: `{"type":"result","id":"...","success":true/false,...}`
    - _Requirements: 5.4_

  - [x] 5.2 Crear módulo python-bridge.js
    - Implementar clase `PythonBridge` con métodos: `initialize()`, `convert(filePath, requestId)`, `healthCheck()`, `restart()`, `shutdown()`
    - Spawn del proceso Python con ruta según plataforma (win32: `python-env/python.exe`, darwin: `python-env/bin/python3`)
    - Comunicación stdin/stdout con JSON newline-delimited
    - Timeout de 120s por conversión
    - Health check con timeout de 10s en initialize
    - Auto-restart tras crash del proceso
    - Gestión de pending requests con Map<id, {resolve, reject, timer}>
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 5.3 Write property test: JSON protocol round-trip
    - **Property 1: JSON protocol round-trip**
    - **Validates: Requirements 5.4, 9.5**

  - [x] 5.4 Write unit tests for PythonBridge
    - Serialización de comandos convert/health/shutdown a JSON
    - Deserialización de respuestas exitosas
    - Deserialización de respuestas de error
    - Manejo de timeout a 120 segundos
    - Detección de terminación inesperada del proceso
    - Reinicio tras crash
    - _Requirements: 9.3_

- [x] 6. Implementar Batch Processor
  - [x] 6.1 Crear módulo batch-processor.js
    - Implementar clase `BatchProcessor` con métodos: `process(files, outputDir, onProgress)`, `cancel()`, `isProcessing()`
    - Procesamiento secuencial de archivos
    - Emisión de progreso con `{percentage, currentFile, currentIndex, totalFiles}` tras cada archivo
    - Soporte de cancelación (completar archivo actual, detener cola)
    - Tolerancia a fallos (continuar tras error individual)
    - Generar `BatchResult` con conteos de successful, failed, cancelled y totalTimeMs
    - _Requirements: 2.1, 2.3, 2.4, 2.6, 2.7, 2.8, 2.9_

  - [x] 6.2 Write property test: Batch progress reporting
    - **Property 6: Batch progress reporting**
    - **Validates: Requirements 2.3, 9.4**

  - [x] 6.3 Write property test: Batch fault tolerance
    - **Property 7: Batch fault tolerance**
    - **Validates: Requirements 2.6, 2.7, 9.4**

  - [x] 6.4 Write unit tests for BatchProcessor
    - Continuación tras fallo individual
    - Reporte de progreso por cada archivo
    - Resumen final con conteos correctos
    - Cancelación respeta archivo en proceso
    - _Requirements: 9.4_

- [x] 7. Checkpoint - Core modules completos
  - Asegurar que todos los tests pasan (`vitest run`) y la cobertura es ≥ 80% para file-validator, output-manager, python-bridge, batch-processor. Preguntar al usuario si hay dudas.

- [x] 8. Implementar Settings Manager y Preload API
  - [x] 8.1 Crear módulo settings-manager.js
    - Instalar `electron-store`
    - Implementar clase `SettingsManager` con métodos: `getOutputDir()`, `setOutputDir(dirPath)`
    - Persistir directorio de salida entre sesiones
    - _Requirements: 3.1_

  - [x] 8.2 Crear preload.js completo con contextBridge API
    - Exponer API `markitdownAPI` via `contextBridge.exposeInMainWorld`
    - Incluir: openFileDialog, validateFiles, extractFolderFiles, startConversion, cancelConversion, selectOutputDir, getOutputDir, openOutputFolder, readMarkdownFile, copyToClipboard
    - Incluir listeners: onProgressUpdate, onConversionComplete, onConversionError, removeAllListeners
    - _Requirements: 8.4, 8.5_

  - [x] 8.3 Crear ipc-handlers.js con registro de handlers
    - Registrar todos los handlers IPC que conectan preload API con módulos del main process
    - Integrar FileValidator, OutputManager, BatchProcessor, PythonBridge, SettingsManager
    - Implementar `open-file-dialog` con dialog.showOpenDialog filtrado por extensiones
    - Implementar `extract-folder-files` para leer primer nivel de carpeta
    - Implementar `read-markdown-file` y `copy-to-clipboard`
    - _Requirements: 1.3, 1.7, 4.3, 4.5_

- [x] 9. Implementar interfaz de usuario (Renderer)
  - [x] 9.1 Crear HTML base y estilos CSS
    - Crear `src/renderer/index.html` con estructura: header, drop zone, file list, control buttons, progress area, preview panel
    - Crear `src/renderer/styles.css` con diseño responsive, theming, estados visuales para drag-over
    - Aplicar Content Security Policy en meta tag (bloquear inline scripts, eval, recursos externos)
    - _Requirements: 8.4, 10.3_

  - [x] 9.2 Implementar drag-drop.js
    - Crear módulo que maneja eventos dragenter, dragover, dragleave, drop en la Drop_Zone
    - Indicación visual diferenciada durante drag-over (borde, texto indicativo)
    - Extraer rutas de archivos y carpetas del DataTransfer
    - Llamar a `markitdownAPI.validateFiles` y `markitdownAPI.extractFolderFiles`
    - _Requirements: 1.1, 1.7_

  - [x] 9.3 Implementar file-list.js
    - Renderizar lista de archivos con nombre, tamaño formateado (KB/MB/GB con un decimal), extensión y estado
    - Soporte de hasta 100 elementos con renderizado < 500ms
    - Virtualización o carga incremental para más de 100 archivos
    - Funciones para agregar, eliminar y actualizar estado de archivos
    - _Requirements: 1.4, 7.2, 7.5_

  - [x] 9.4 Write property test: File size formatting
    - **Property 5: File size formatting**
    - **Validates: Requirements 1.4**

  - [x] 9.5 Implementar progress.js
    - Mostrar barra de progreso con porcentaje (0-100)
    - Mostrar nombre del archivo actual e índice (ej: "3 de 10")
    - Subscribirse a `markitdownAPI.onProgressUpdate`
    - Gestionar estados: idle, processing, complete
    - _Requirements: 2.3_

  - [x] 9.6 Implementar markdown-preview.js
    - Instalar `marked` y `dompurify`
    - Renderizar Markdown como HTML sanitizado
    - Toggle entre vista renderizada y código fuente
    - Botón copiar código fuente al clipboard
    - Mensaje para resultado vacío
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 9.7 Implementar ui-controller.js
    - Coordinar todos los módulos del renderer
    - Manejar flujo: importar → validar → convertir → mostrar resultados
    - Gestionar botones: "Agregar archivos", "Convertir" (habilitar/deshabilitar), "Cancelar"
    - Mostrar notificaciones (toast temporal 5s, persistente para errores críticos)
    - Subscribirse a eventos de conversión completa y error
    - Mostrar resumen al finalizar (exitosos, fallidos, tiempo total)
    - Opción de abrir carpeta de salida
    - _Requirements: 2.2, 2.4, 2.7, 3.6, 7.1_

- [x] 10. Checkpoint - Aplicación funcional
  - Asegurar que todos los tests pasan, la aplicación se lanza correctamente con `npm start`, el flujo completo funciona (importar → convertir → preview). Preguntar al usuario si hay dudas.

- [x] 11. Documentación y ayuda
  - [x] 11.1 Crear README.md
    - Secciones: descripción, requisitos del sistema, instalación, guía de uso con ejemplos, formatos soportados, instrucciones de desarrollo (build, test, empaquetado)
    - _Requirements: 10.1_

  - [x] 11.2 Implementar sección de ayuda en la aplicación
    - Agregar menú "Ayuda" con ítem que muestra ventana/panel de ayuda
    - Listar formatos soportados con extensiones
    - Describir flujo de conversión
    - Contenido offline (sin requerir internet)
    - Agregar tooltips a elementos interactivos (Drop_Zone, botones, selector de carpeta)
    - _Requirements: 10.2, 10.3, 10.4_

- [x] 12. Empaquetado y distribución
  - [x] 12.1 Configurar inclusión de Python embebido en el build
    - Configurar forge.config.js para incluir `python-env/` en el paquete
    - Crear script de setup que descarga python-build-standalone para la plataforma target
    - Instalar markitdown en el entorno embebido (`pip install markitdown`)
    - Verificar que las rutas del PythonBridge funcionen en el paquete final
    - _Requirements: 5.1_

  - [x] 12.2 Configurar makers para instaladores multiplataforma
    - Configurar maker-squirrel para Windows: ícono, shortcuts (menú inicio + opción escritorio)
    - Configurar maker-dmg para macOS: ícono, universal binary (x64 + ARM64)
    - Agregar iconos personalizados en `assets/` (icon.ico, icon.png, icon.icns)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 12.3 Configurar firma y notarización para macOS
    - Configurar `osxSign` en forge.config.js con identidad de desarrollador
    - Configurar `osxNotarize` con credenciales de Apple Developer
    - Verificar que el .dmg pase Gatekeeper sin advertencias
    - _Requirements: 6.6_

- [x] 13. Final checkpoint - Release ready
  - Asegurar que todos los tests pasan, los instaladores se generan correctamente (`npm run make`), y la aplicación funciona en paquete final. Preguntar al usuario si hay dudas.

## Notes

- Tasks marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido
- Cada task referencia requirements específicos para trazabilidad
- Los checkpoints aseguran validación incremental
- Property tests validan propiedades universales de corrección
- Unit tests validan escenarios específicos y edge cases
- El orden prioriza: scaffold → módulos core (validators, bridge) → UI → empaquetado
- Para el entorno Python embebido, descargar python-build-standalone desde https://github.com/astral-sh/python-build-standalone

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.4"] },
    { "id": 3, "tasks": ["3.1", "4.1", "5.1"] },
    { "id": 4, "tasks": ["3.2", "3.3", "3.4", "3.5", "4.2", "4.3", "5.2"] },
    { "id": 5, "tasks": ["5.3", "5.4", "6.1"] },
    { "id": 6, "tasks": ["6.2", "6.3", "6.4", "8.1"] },
    { "id": 7, "tasks": ["8.2", "8.3"] },
    { "id": 8, "tasks": ["9.1"] },
    { "id": 9, "tasks": ["9.2", "9.3", "9.5", "9.6"] },
    { "id": 10, "tasks": ["9.4", "9.7"] },
    { "id": 11, "tasks": ["11.1", "11.2"] },
    { "id": 12, "tasks": ["12.1", "12.2"] },
    { "id": 13, "tasks": ["12.3"] }
  ]
}
```
