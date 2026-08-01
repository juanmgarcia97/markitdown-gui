# Requirements Document

## Introduction

MarkItDown GUI es una aplicación de escritorio que proporciona una interfaz gráfica para la librería [markitdown](https://github.com/microsoft/markitdown) de Microsoft. Permite a los usuarios convertir múltiples archivos de diversos formatos (PDF, Word, Excel, PowerPoint, imágenes, audio, HTML, CSV, JSON, etc.) a Markdown de forma sencilla mediante drag-and-drop o selección de archivos. La aplicación está construida con Electron y empaqueta un entorno Python embebido para ejecutar markitdown sin requerir instalación externa de Python.

## Glossary

- **App**: La aplicación de escritorio MarkItDown GUI construida con Electron
- **Converter**: El módulo que invoca la librería markitdown de Python para transformar archivos a Markdown
- **File_List**: El componente de interfaz que muestra los archivos añadidos por el usuario para conversión
- **Drop_Zone**: El área de la interfaz donde el usuario puede arrastrar y soltar archivos
- **Output_Manager**: El módulo encargado de gestionar la ubicación y escritura de los archivos Markdown resultantes
- **Progress_Indicator**: El componente visual que muestra el estado de progreso de las conversiones
- **File_Validator**: El módulo que verifica que los archivos seleccionados sean de formatos compatibles
- **Python_Bridge**: El módulo que gestiona la comunicación entre Electron (Node.js) y el proceso Python que ejecuta markitdown
- **Batch_Processor**: El módulo que gestiona la conversión de múltiples archivos en paralelo o secuencial
- **Settings_Manager**: El módulo que gestiona las preferencias del usuario

## Requirements

### Requirement 1: Importación de archivos

**User Story:** Como usuario, quiero poder agregar archivos a la aplicación mediante drag-and-drop o selección de archivos, para poder convertirlos a Markdown fácilmente.

#### Acceptance Criteria

1. WHEN el usuario arrastra archivos sobre la Drop_Zone, THE App SHALL mostrar una indicación visual diferenciada en la Drop_Zone (cambio de borde y texto indicativo) de que los archivos pueden ser soltados
2. WHEN el usuario suelta archivos sobre la Drop_Zone, THE File_Validator SHALL verificar que cada archivo tenga una extensión compatible (pdf, docx, pptx, xlsx, xls, html, htm, csv, json, jsonl, txt, md, jpg, jpeg, png, wav, mp3, m4a, mp4, epub, ipynb, msg, xml, rss, atom, zip), procesando un máximo de 100 archivos por operación de importación
3. WHEN el usuario hace clic en el botón "Agregar archivos", THE App SHALL abrir un diálogo de selección múltiple de archivos del sistema operativo filtrado por extensiones compatibles
4. WHEN archivos válidos son importados, THE File_List SHALL mostrar el nombre, tamaño en formato legible (KB, MB, GB con un decimal) y tipo (extensión) de cada archivo añadido
5. IF un archivo tiene una extensión no compatible, THEN THE App SHALL mostrar una notificación indicando el nombre del archivo y los formatos aceptados, visible hasta que el usuario la descarte o durante 5 segundos
6. WHEN archivos duplicados (mismo path absoluto) son importados, THE App SHALL ignorar los duplicados y notificar al usuario indicando cuántos archivos fueron omitidos
7. IF el usuario suelta una carpeta sobre la Drop_Zone, THEN THE App SHALL extraer los archivos contenidos en el primer nivel de la carpeta y aplicar la validación de extensión a cada uno individualmente

### Requirement 2: Conversión de archivos a Markdown

**User Story:** Como usuario, quiero convertir uno o más archivos a formato Markdown, para poder usar el contenido en herramientas compatibles con Markdown.

#### Acceptance Criteria

1. WHEN el usuario presiona el botón "Convertir" y la File_List contiene al menos un archivo, THE Batch_Processor SHALL iniciar la conversión de todos los archivos en la File_List
2. IF el usuario presiona el botón "Convertir" y la File_List está vacía, THEN THE App SHALL mostrar una notificación indicando que se deben agregar archivos antes de convertir
3. WHILE la conversión está en progreso, THE Progress_Indicator SHALL mostrar el porcentaje de avance como entero de 0 a 100, el nombre del archivo actualmente en proceso y el índice del archivo actual respecto al total (ejemplo: "3 de 10")
4. WHILE la conversión está en progreso, THE App SHALL deshabilitar el botón "Convertir" y mostrar un botón "Cancelar" que permita detener la conversión después del archivo en proceso actual
5. WHEN un archivo es convertido exitosamente, THE Converter SHALL generar un archivo .md con el contenido extraído por la librería markitdown, preservando la estructura del documento original (encabezados, listas, tablas, enlaces)
6. IF un archivo falla durante la conversión, THEN THE App SHALL agregar el error a una lista visible en la interfaz con el nombre del archivo y la descripción del fallo, y continuar con el siguiente archivo
7. WHEN la conversión de todos los archivos finaliza, THE App SHALL mostrar un resumen con la cantidad de archivos convertidos exitosamente, la cantidad que fallaron y el tiempo total de conversión
8. THE Batch_Processor SHALL procesar archivos de forma secuencial, uno a la vez, para evitar sobrecarga de recursos del sistema
9. IF el usuario presiona "Cancelar" durante la conversión, THEN THE Batch_Processor SHALL completar el archivo en proceso actual, detener la cola restante y mostrar el resumen parcial con archivos completados, cancelados y fallidos

### Requirement 3: Gestión de la salida

**User Story:** Como usuario, quiero elegir dónde guardar los archivos Markdown convertidos, para mantener organizados mis documentos.

#### Acceptance Criteria

1. THE App SHALL proporcionar un selector de directorio para elegir la carpeta de salida, y SHALL persistir la selección entre sesiones de la aplicación hasta que el usuario la cambie manualmente
2. IF no se ha seleccionado una carpeta de salida, THEN THE Output_Manager SHALL usar la misma carpeta donde reside cada archivo original como destino de escritura
3. IF un archivo de salida ya existe en la carpeta destino, THEN THE Output_Manager SHALL renombrar el nuevo archivo agregando un sufijo numérico incremental comenzando en _1 y hasta un máximo de 99 intentos (ejemplo: archivo_1.md, archivo_2.md, ..., archivo_99.md)
4. IF el Output_Manager alcanza el límite de 99 sufijos para un mismo nombre base, THEN THE Output_Manager SHALL reportar un error para ese archivo y continuar con el siguiente archivo de la cola
5. IF la carpeta de salida seleccionada no tiene permisos de escritura o no es accesible, THEN THE Output_Manager SHALL notificar al usuario con un mensaje indicando la carpeta problemática y SHALL no iniciar la conversión hasta que se seleccione una carpeta válida
6. WHEN la conversión finaliza exitosamente, THE App SHALL ofrecer la opción de abrir la carpeta de salida en el explorador de archivos del sistema, abriendo la carpeta personalizada si fue seleccionada o la carpeta del último archivo convertido si se usó la ubicación por defecto

### Requirement 4: Vista previa de Markdown

**User Story:** Como usuario, quiero poder ver una vista previa del Markdown generado, para verificar que la conversión fue correcta antes de usar el archivo.

#### Acceptance Criteria

1. WHEN el usuario selecciona un archivo convertido de la lista de resultados, THE App SHALL mostrar una vista previa del contenido Markdown renderizado como HTML en un panel con scroll vertical
2. THE App SHALL proporcionar un toggle para alternar entre vista renderizada (HTML) y código fuente Markdown en texto plano
3. WHEN el usuario presiona el botón de copiar en la vista previa, THE App SHALL copiar el código fuente Markdown (texto plano, no el HTML renderizado) al portapapeles del sistema y mostrar una confirmación visual durante 3 segundos indicando que el contenido fue copiado
4. IF el usuario selecciona un archivo cuya conversión produjo un resultado vacío, THEN THE App SHALL mostrar un mensaje indicando que la conversión no generó contenido
5. IF la operación de copiar al portapapeles falla, THEN THE App SHALL mostrar una notificación de error indicando que no se pudo copiar el contenido

### Requirement 5: Bridge Python-Electron

**User Story:** Como desarrollador, quiero que la aplicación gestione la comunicación con Python de forma transparente, para que el usuario no necesite instalar Python manualmente.

#### Acceptance Criteria

1. THE Python_Bridge SHALL empaquetar un entorno Python embebido con la librería markitdown y sus dependencias dentro del instalador de la aplicación
2. WHEN la App inicia, THE Python_Bridge SHALL verificar la disponibilidad del entorno Python embebido confirmando que el ejecutable Python existe en la ruta esperada y que responde correctamente a un comando de prueba de importación de markitdown en un máximo de 10 segundos
3. IF el entorno Python embebido no está disponible porque el ejecutable no se encuentra en la ruta esperada, o está corrupto porque el comando de prueba de importación falla o no responde dentro del tiempo límite, THEN THE Python_Bridge SHALL mostrar un mensaje de error al usuario indicando la causa específica de la falla y proporcionando instrucciones de reinstalación de la aplicación
4. THE Python_Bridge SHALL comunicarse con el proceso Python mediante stdin/stdout usando mensajes JSON delimitados por salto de línea, donde cada mensaje contiene al menos un campo de tipo de operación y un identificador de solicitud
5. WHEN un proceso de conversión excede 120 segundos, THE Python_Bridge SHALL terminar el proceso y reportar un error de timeout al usuario
6. IF el proceso Python termina inesperadamente durante una conversión, THEN THE Python_Bridge SHALL detectar la terminación, reportar un error al usuario indicando que el proceso falló, y reiniciar el proceso Python para permitir conversiones posteriores

### Requirement 6: Instaladores multiplataforma

**User Story:** Como usuario, quiero poder instalar la aplicación en Windows o macOS mediante un instalador estándar, para tener una experiencia de instalación familiar.

#### Acceptance Criteria

1. THE App SHALL generar un instalador .exe (Squirrel) para Windows 10 o superior (x64)
2. THE App SHALL generar un instalador .dmg para macOS 11 (Big Sur) o superior
3. THE App SHALL soportar arquitecturas x64 y ARM64 en macOS (universal binary)
4. WHEN la aplicación se instala en Windows, THE App SHALL crear un acceso directo en el menú inicio y presentar una opción durante la instalación para crear un acceso directo en el escritorio
5. THE App SHALL incluir un ícono de aplicación personalizado (distinto al ícono predeterminado de Electron) visible en el instalador, accesos directos y barra de tareas en ambas plataformas
6. THE App SHALL firmar el instalador de macOS y completar el proceso de notarización de Apple para que la aplicación pueda instalarse sin advertencias de Gatekeeper
7. WHEN el usuario ejecuta la desinstalación mediante el mecanismo estándar del sistema operativo (Agregar/Quitar Programas en Windows, mover a Papelera en macOS), THE App SHALL eliminar los archivos de la aplicación y los accesos directos creados durante la instalación

### Requirement 7: Rendimiento y optimización

**User Story:** Como usuario, quiero que la aplicación responda de forma fluida, para poder trabajar eficientemente con múltiples archivos.

#### Acceptance Criteria

1. WHILE una conversión está en progreso, THE App SHALL responder a interacciones del usuario (clics, scroll, arrastrar archivos) en menos de 200 milisegundos ejecutando el proceso Python de forma asíncrona respecto al proceso de renderizado
2. WHEN el usuario agrega archivos, THE File_List SHALL renderizar la lista en menos de 500 milisegundos para hasta 100 archivos
3. WHEN la conversión y la vista previa de un archivo han sido completadas, THE App SHALL liberar los buffers de datos del archivo fuente en memoria
4. WHEN la aplicación inicia, THE App SHALL mostrar la interfaz con la Drop_Zone activa y todos los controles habilitados en menos de 5 segundos
5. IF el usuario agrega más de 100 archivos en una sola operación, THEN THE File_List SHALL renderizar los primeros 100 elementos visibles y cargar los restantes de forma incremental sin bloquear la interfaz

### Requirement 8: Seguridad

**User Story:** Como usuario, quiero que la aplicación sea segura y proteja mi sistema, para poder procesar archivos de cualquier origen sin riesgos.

#### Acceptance Criteria

1. THE File_Validator SHALL validar el tipo MIME real del archivo además de la extensión para prevenir spoofing de extensiones; IF el tipo MIME detectado no corresponde a la extensión del archivo, THEN THE File_Validator SHALL rechazar el archivo y mostrar una notificación indicando la discrepancia entre extensión y tipo real
2. THE Python_Bridge SHALL ejecutar el proceso Python con permisos de sistema de archivos limitados exclusivamente al directorio de entrada y al directorio de salida configurados; IF el proceso Python intenta acceder a rutas fuera de los directorios permitidos, THEN THE Python_Bridge SHALL terminar el proceso y reportar un error de violación de seguridad al usuario
3. IF una ruta de archivo contiene secuencias de path traversal (../, ..\, o referencias a directorios fuera del ámbito de trabajo), THEN THE App SHALL rechazar la ruta, descartar el archivo de la operación y notificar al usuario que la ruta es inválida
4. THE App SHALL aplicar Content Security Policy en el proceso renderer que bloquee scripts inline, ejecución de eval(), y carga de recursos externos no autorizados (scripts, estilos, frames de dominios distintos a la propia aplicación)
5. THE App SHALL deshabilitar nodeIntegration y habilitar contextIsolation en todas las ventanas del renderer
6. IF un archivo excede 500 MB de tamaño, THEN THE File_Validator SHALL rechazar el archivo y notificar al usuario del límite de tamaño

### Requirement 9: Testing

**User Story:** Como desarrollador, quiero que las funciones principales estén cubiertas por tests unitarios, para garantizar la estabilidad del código.

#### Acceptance Criteria

1. THE App SHALL incluir tests unitarios para el File_Validator que verifiquen al menos los siguientes escenarios: aceptación de archivo con extensión compatible y tipo MIME válido, rechazo de archivo con extensión no compatible, y rechazo de archivo con extensión compatible pero tipo MIME no coincidente
2. THE App SHALL incluir tests unitarios para el Output_Manager que verifiquen la generación de nombres de archivo cuando no existe conflicto, la adición del sufijo numérico incremental cuando el archivo destino ya existe, y el uso del directorio original cuando no se ha seleccionado carpeta de salida
3. THE App SHALL incluir tests unitarios para el Python_Bridge que verifiquen la serialización de comandos de conversión a JSON, la deserialización de respuestas exitosas y de errores, y el manejo del timeout de 120 segundos
4. THE App SHALL incluir tests unitarios para el Batch_Processor que verifiquen la continuación del procesamiento cuando un archivo individual falla, el reporte de progreso por cada archivo procesado, y la generación del resumen final con conteos de éxitos y fallos
5. THE App SHALL incluir tests que verifiquen la propiedad round-trip: para todo mensaje JSON válido conforme al protocolo del Python_Bridge, serializar y deserializar SHALL producir un objeto con propiedades y valores idénticos al original (igualdad profunda)
6. WHEN se ejecuta la suite de tests, THE App SHALL completar todos los tests sin fallos y alcanzar una cobertura mínima del 80% en líneas de código para los módulos File_Validator, Output_Manager, Python_Bridge y Batch_Processor

### Requirement 10: Documentación

**User Story:** Como usuario, quiero tener documentación clara sobre cómo usar la aplicación, para poder aprovechar todas sus funcionalidades.

#### Acceptance Criteria

1. THE App SHALL incluir un archivo README.md con las siguientes secciones: descripción del proyecto, requisitos del sistema, instrucciones de instalación paso a paso, guía de uso con ejemplos, lista de formatos soportados, e instrucciones de desarrollo (build, test, empaquetado)
2. THE App SHALL incluir una sección de ayuda accesible desde el menú de la aplicación que liste todos los formatos de archivo soportados con sus extensiones y describa el flujo de conversión desde la importación hasta la obtención del archivo Markdown
3. WHEN el usuario posiciona el cursor sobre la Drop_Zone, el botón "Convertir", el botón "Agregar archivos", o el selector de carpeta de salida, THE App SHALL mostrar un tooltip que describa la función del elemento en un máximo de 2 segundos tras la interacción
4. IF el usuario accede a la sección de ayuda, THEN THE App SHALL mostrar el contenido sin requerir conexión a internet

