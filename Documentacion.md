# Documentación del panel de cámaras OVR

## Propósito

Aplicación local para consultar inspecciones de cámaras OVR almacenadas en `PrensasOvrPrueba.dbo.Autoraking`. Permite explorar resultados por fecha, línea y cámara, revisar conteos diarios y consultar las imágenes asociadas a cada registro. La interfaz está en español y utiliza un tema oscuro.

La aplicación es de solo lectura: no inserta ni modifica registros de producción. La tabla no registra la causa de un resultado bueno o malo; el panel presenta únicamente el estado reportado.

## Organización del proyecto

```text
CamarasOvr/
├── backend/
│   ├── src/server.js       API HTTP, consultas de lectura y entrega controlada de fotos
│   ├── test/               Pruebas automatizadas del backend
│   └── package.json        Dependencias y comandos del servidor
├── frontend/
│   └── public/
│       ├── index.html      Estructura y componentes de la interfaz
│       ├── styles.css      Tema oscuro, diseño adaptable y gráfica
│       └── app.js          Filtros, llamadas API, visualizaciones y galería
├── .env.example            Plantilla de configuración local
├── Documentacion.md        Referencia de funcionamiento
├── memoria.md              Historial técnico y decisiones del proyecto
└── package.json            Comandos de nivel raíz y workspace npm
```

El frontend es HTML, CSS y JavaScript nativo, servido como archivos estáticos por Express. El backend sirve el frontend y proporciona la API JSON. No se requiere un proceso de desarrollo frontend independiente ni un empaquetador.

## Requisitos e inicio

- Node.js 24 o posterior.
- Acceso a la API corporativa usada por `SCRAPDashboard`.
- Permiso de lectura sobre `PrensasOvrPrueba.dbo.Autoraking`.
- Acceso de lectura desde la cuenta de Windows del servidor a la carpeta donde están las fotos.

Desde la raíz del proyecto:

```powershell
npm install
npm start
```

Visita `http://127.0.0.1:3000`. Para desarrollo con reinicio al detectar cambios:

```powershell
npm run dev
```

Pruebas automatizadas:

```powershell
npm test
```

## Conexión a datos

El backend envía consultas `SELECT` mediante HTTPS a `POST /api/Utility/executeSQLCommand`, siguiendo el mecanismo de conexión de `SCRAPDashboard`. No se conecta directamente a SQL Server y no necesita duplicar las credenciales de otro servicio.

Por defecto, el servidor intenta leer `DB_API_BASE_URL`, `DB_SERVER` y `DB_API_TIMEOUT` desde `..\SCRAPDashboard\BaseDeDatos\.env`. En otro despliegue, se puede indicar `SCRAP_DB_CONFIG_PATH` o definir las variables de conexión en `.env`. La base consultada es `PrensasOvrPrueba`; la configuración de base de datos puede cambiarse con `DB_DATABASE`.

El backend usa el almacén de certificados confiables de Windows (`--use-system-ca`), exige HTTPS, aplica un timeout y solo permite enviar consultas de lectura de una instrucción. Los valores de filtro se validan y escapan antes de formar la consulta; los valores `page` y `limit` son enteros con límite de tamaño.

## API

| Ruta | Función |
|---|---|
| `GET /api/options` | Devuelve las líneas y cámaras disponibles. |
| `GET /api/summary` | Devuelve los totales y el agrupamiento diario para los filtros recibidos. |
| `GET /api/models` | Agrupa los registros por `Modelo` y devuelve conteos por estado para la relación de recetas y números de parte. Acepta los mismos filtros de fecha, línea y cámara. |
| `GET /api/photos` | Devuelve una página de registros con metadatos de imagen; admite los filtros `from`, `to`, `line`, `camera`, `result`, `model`, `search`, `page` y `limit`. |
| `GET /api/photos/:id/image` | Busca la ruta asociada al registro y transmite la foto si está permitida y accesible. |

Los filtros `from` y `to` usan `FechaFoto` e incluyen ambos días completos. `line` y `camera` comparan `Linea` y `Camara`. `result` acepta `good`, `bad` o `unknown`.

## Datos y clasificación

El panel presenta los campos `ID`, `FechaFoto`, `FechaCopiado`, `Linea`, `Camara`, `IP_Camara`, `Estado`, `Status`, `Modelo`, `NombreImagen`, `Ruta`, `RutaCompleta` y `TamanoBytes`.

`Status = 1` se interpreta como buena y `Status = 0` como mala. Si `Status` no es reconocible, `Estado` se usa como respaldo para valores conocidos como `Buena`, `Mala`, `Good`, `Bad`, `No Good`, `1` y `0`. Otros valores se contabilizan como “sin clasificación”. El panel no infiere una causa para el resultado.

La tarjeta **Fotos analizadas** muestra el tamaño del periodo seleccionado y el consumo total de todas las fechas en el mismo cuadro. El consumo total no aplica filtros de fecha, pero respeta los filtros de línea y cámara. La quinta tarjeta, **FTQ**, muestra la proporción de fotos buenas respecto a todas las fotos analizadas en el periodo, junto con el conteo de buenas sobre total. Las tarjetas de fotos buenas, malas y sin clasificación muestran sus conteos y tamaños del periodo. Los tamaños se calculan desde `TamanoBytes` y se presentan en bytes, KB, MB, GB o TB (unidades de 1024); valores nulos o no numéricos cuentan como cero.

## Relación de modelos y números de parte

La sección **Relación** presenta cada valor único de `Modelo` con su conteo de fotos, buenas y malas, y porcentajes buenos/malos respecto al total de fotos de ese modelo (incluidas las no clasificadas en el denominador). Según los valores consultados, el formato es `####_PARTE1_PARTE2...`: los primeros cuatro dígitos son la receta y cada segmento numérico posterior, separado por `_`, representa un número de parte. Se conserva el cero inicial; por ejemplo, `0039_08035004_08035005` se muestra como receta `0039` y números de parte `08035004`, `08035005`.

La búsqueda de la sección encuentra texto en el modelo, la receta o cualquiera de sus números de parte. La relación consulta el backend usando los filtros globales de fecha, línea y cámara; no se calcula solo a partir de las fotos de la página visible. Los botones con icono de ojo en los conteos de fotos abren la galería ya filtrada por ese modelo y por todas, buenas o malas, según la columna elegida.

La galería permite buscar una parte del nombre de imagen en la base de datos. La búsqueda se combina con los filtros de fecha, línea, cámara, modelo y resultado; la paginación cuenta solo los resultados coincidentes.

## Gráfica

“Actividad por día” presenta barras separadas para resultados buenos, malos y sin clasificación, y una línea naranja uniforme con el porcentaje de fotos buenas de cada día sobre su total. La línea usa un eje derecho de 0 a 100%; las barras comparten un eje vertical lineal de cantidades. La posición horizontal de cada fecha respeta los días naturales transcurridos, de modo que las fechas separadas por días sin capturas no se dibujen como consecutivas. Cada barra y punto tiene un detalle emergente con su valor.

Debajo de la gráfica se presenta una tabla por fecha con el total de fotos, cantidad de buenas y malas, porcentajes de buenas y malas respecto al total de fotos tomadas ese día, y peso total/de buenas/de malas. Los porcentajes se muestran con hasta un decimal; los pesos usan bytes, KB, MB, GB o TB (unidades de 1024) desde `TamanoBytes`. Así, las cifras exactas siguen disponibles en pantallas pequeñas, periodos extensos o valores cercanos que sean difíciles de comparar visualmente.

La tabla diaria se puede filtrar localmente por el mínimo y máximo de fotos capturadas por día; las fechas se muestran como datos y no hay filtros de fecha adicionales dentro de esta sección.

Al seleccionar una fecha desde una fila de la tabla o desde una etiqueta visible de la gráfica, la galería carga las fotos de ese día y muestra la fecha seleccionada. Se conservan los filtros generales de línea/cámara; el control de la galería permite quitar el filtro de fecha.

La consulta agrupa por fechas con registros; no inventa filas para fechas sin actividad.

Durante las consultas, las tarjetas de métricas, la gráfica, la relación y la galería muestran placeholders skeleton con brillo animado, inspirados en SCRAPDashboard; desaparecen al completar la consulta. La interfaz también incorpora entradas suaves y escalonadas para métricas, filas, fotos y barras, además de elevación discreta al pasar el cursor sobre tarjetas. Todo se implementa en CSS/JS nativo, sin dependencias adicionales, y respeta la preferencia del sistema para reducir movimiento.

## Imágenes

El backend busca la foto en `RutaCompleta`; si no está disponible, intenta combinar `Ruta` y `NombreImagen`. Para proteger el equipo, solo transmite archivos dentro de `IMAGE_ROOT`, luego de verificar la ruta canónica y los enlaces simbólicos.

Configura `IMAGE_ROOT` en el `.env` de la raíz del proyecto con la carpeta que contiene las imágenes. Para una carpeta compartida, utiliza la ruta UNC correspondiente y concede permisos de lectura a la **misma cuenta de Windows que inicia `npm start`**. Tener conexión de red o permiso para explorar la carpeta en otra sesión no garantiza que el proceso Node.js tenga acceso.

Si la tarjeta indica que la imagen no está disponible, verifica que `IMAGE_ROOT` incluya la raíz real de las rutas guardadas en SQL Server y que la carpeta esté montada y accesible para el proceso. El backend no omite la restricción de directorio para intentar acceder a una ruta no permitida.

## Seguridad y operación

- El servidor escucha en `127.0.0.1` por defecto. No lo publiques directamente en Internet.
- No copies contraseñas de Windows, API o SQL al repositorio.
- El `.env` local está excluido de Git.
- Las rutas API rechazan orígenes de otras páginas y solicitudes marcadas como `cross-site`.
- Las rutas de imagen se restringen a `IMAGE_ROOT`.
- Las consultas no modifican la base de datos.
- El reporte del escaneo automatizado de seguridad se encuentra en `SECURITY-REPORT.md`.
