# MarkItDown GUI

Aplicación de escritorio para convertir archivos a Markdown usando la librería [markitdown](https://github.com/microsoft/markitdown) de Microsoft. Interfaz gráfica construida con Electron que permite convertir múltiples archivos de diversos formatos mediante drag-and-drop o selección de archivos.

## Requisitos del sistema

- **Windows**: Windows 10 o superior (x64)
- **macOS**: macOS 11 (Big Sur) o superior (x64 y ARM64)
- No requiere instalación externa de Python (el entorno Python viene embebido en la aplicación)

## Instalación

1. Descargar el instalador correspondiente a tu sistema operativo:
   - Windows: archivo `.exe`
   - macOS: archivo `.dmg`
2. Ejecutar el instalador y seguir los pasos de instalación estándar del sistema operativo.
3. La aplicación estará disponible desde el menú de inicio (Windows) o la carpeta Aplicaciones (macOS).

## Guía de uso

### Agregar archivos

Hay dos formas de agregar archivos para convertir:

- **Drag-and-drop**: Arrastra archivos directamente sobre la zona de soltar (drop zone) de la aplicación. También puedes arrastrar carpetas y se extraerán los archivos del primer nivel.
- **Botón "Agregar archivos"**: Haz clic en el botón para abrir el diálogo de selección de archivos del sistema operativo.

### Seleccionar directorio de salida (opcional)

Usa el selector de carpeta de salida para elegir dónde se guardarán los archivos `.md` convertidos. Si no se selecciona una carpeta, los archivos se guardarán en el mismo directorio donde reside cada archivo original.

### Convertir

1. Haz clic en el botón **"Convertir"** para iniciar la conversión de todos los archivos de la lista.
2. Durante la conversión se mostrará el progreso (porcentaje, archivo actual e índice).
3. Puedes cancelar la conversión en cualquier momento con el botón **"Cancelar"**.
4. Al finalizar se muestra un resumen con archivos convertidos, fallidos y tiempo total.

### Vista previa y copia

- Selecciona un archivo convertido en la lista de resultados para ver la vista previa del Markdown renderizado en el panel derecho.
- Usa el toggle para alternar entre vista renderizada y código fuente.
- Haz clic en el botón de copiar para copiar el Markdown al portapapeles.
- Usa el botón para abrir la carpeta de salida en el explorador de archivos.

## Formatos soportados

| Categoría  | Extensiones                        |
|------------|------------------------------------|
| Documentos | PDF, DOCX, PPTX, XLSX, XLS        |
| Web        | HTML, HTM                          |
| Datos      | CSV, JSON, JSONL, XML, RSS, Atom   |
| Texto      | TXT, MD                            |
| Imágenes   | JPG, JPEG, PNG                     |
| Audio      | WAV, MP3, M4A, MP4                 |
| Otros      | EPUB, IPYNB, MSG, ZIP              |

## Desarrollo

### Requisitos previos

- Node.js (v18 o superior recomendado)
- npm

### Instalación de dependencias

```bash
npm install
```

### Ejecutar en modo desarrollo

```bash
npm start
```

### Ejecutar tests

```bash
npm test
```

### Ejecutar tests con cobertura

```bash
npm run test:coverage
```

### Construir instaladores

```bash
npm run make
```

## Licencia

MIT
