# Memoria técnica del proyecto

## Estado actual

Panel web en español para explorar resultados de inspección de la tabla `PrensasOvrPrueba.dbo.Autoraking`. La aplicación está separada en carpetas `frontend` y `backend`, utiliza tema oscuro y representa los conteos diarios con escala numérica común y tabla de cifras exactas.

## Construcción y arquitectura

- **Frontend:** HTML, CSS y JavaScript nativo en `frontend/public`. Renderiza filtros, métricas, tabla diaria, barras SVG, galería paginada y vista ampliada de foto.
- **Backend:** Express en `backend/src/server.js`. Sirve los recursos estáticos, valida filtros, envía consultas de lectura a la API corporativa y transmite imágenes disponibles.
- **Pruebas:** `node:test` en `backend/test`. El workspace npm deja `npm install`, `npm start`, `npm run dev` y `npm test` disponibles desde la raíz.
- **Datos:** se reutilizan las variables de conexión de `SCRAPDashboard\BaseDeDatos\.env` cuando ese proyecto está en la ruta hermana esperada. No se copian secretos.
- **Imágenes:** `IMAGE_ROOT` limita la raíz de archivos permitida. `RutaCompleta`, `Ruta` y `NombreImagen` provienen de la fila consultada.

## Reglas de datos y presentación

1. Los filtros de fechas aplican a `FechaFoto` e incluyen los dos días solicitados.
2. `Status` determina primero el estado: `1` buena, `0` mala. Si falta o no es reconocible, se evalúan los valores de texto admitidos en `Estado`.
3. Los estados que no coinciden con esos valores se contabilizan aparte como no clasificados; no se supone que sean buenos o malos.
4. El resumen SQL agrupa por fecha y devuelve los conteos exactos. La gráfica convierte esos conteos en barras lineales que comparten un máximo y un eje con marcas numéricas.
5. Se agrega una tabla con total, buenas, malas y no clasificadas por día para que los números exactos no dependan de estimar el alto de las barras.
6. La consulta solo devuelve fechas que contienen fotos; no simula actividad en días vacíos.
7. El usuario ve todos los campos operativos de la fila, incluida la ruta y el nombre de imagen. No se almacena el archivo dentro de SQL Server.
8. No existe actualmente un motivo de rechazo en las columnas descritas; la aplicación no inventa ni solicita una causa.

## Decisiones de diseño

- Se eligió una interfaz oscura fija para reducir el brillo de las superficies sin sacrificar contraste en texto, etiquetas, filtros y estados.
- No se añadió una dependencia de gráficos: el gráfico SVG y la tabla son nativos, reducen dependencias y mantienen precisión explícita.
- Se separaron frontend y backend sin introducir una compilación del frontend, porque la interfaz no usa framework ni requiere empaquetador.
- La conexión permanece de solo lectura mediante la API corporativa y el cliente HTTPS de Node con certificados del sistema.
- El acceso a imágenes se restringe a una carpeta raíz verificada y se comprueba la ruta canónica para rechazar escapes por enlaces simbólicos.

## Trabajo registrado

### Primera versión del panel

- Se revisó `Especificaciones.txt` y se creó el dashboard con filtros por fecha, línea y cámara, conteos, actividad diaria, consulta de campos y galería.
- Se determinó que la tabla no registra el motivo por el que una imagen es buena o mala. Por decisión del usuario, se dejó la causa como una mejora futura.
- Se añadió paginación del lado del servidor, validación de parámetros y pruebas unitarias iniciales.

### Conexión y validación de datos

- Se leyó la documentación y el cliente de conexión de `SCRAPDashboard`, sin imprimir los valores confidenciales de su archivo `.env`.
- Se adaptó el panel a la API corporativa HTTPS de solo lectura que emplea ese proyecto y se automatizó la lectura de su configuración local.
- Las pruebas de integración realizadas contra la base confirmaron las opciones de cámara/línea, filtros, agrupamientos, clasificación y paginación. Una de las consultas probadas devolvió 40 000 filas totales; un periodo de siete días arrojó 14 849 fotos: 14 025 buenas, 824 malas y cero sin clasificación.
- Las imágenes en SQL apuntan a rutas UNC. Aunque el servidor de archivos resolvió en la red, no fue posible leer las carpetas con la identidad de Windows disponible: no se pudo completar una prueba real de transmisión de imagen. Para producción, el proceso debe ejecutarse con permisos de lectura en el recurso compartido y configurar `IMAGE_ROOT`.

### Tema oscuro, gráfica y organización

- Se movieron recursos web a `frontend/public`, el servidor a `backend/src` y las pruebas a `backend/test`.
- Se configuró el backend como workspace npm y se mantuvieron comandos desde la raíz del proyecto.
- Se aplicó una paleta oscura y se adaptaron superficies, formularios, estados, galería, avisos y tabla para mantener contraste.
- Se sustituyeron las barras de altura relativa a cada grupo por un gráfico SVG de escala vertical compartida, eje numérico, marcas, tres series, espacios temporales proporcionales al calendario y etiquetas emergentes.
- Se agregó una tabla diaria exacta, que incluye fotos sin clasificación y complementa la lectura visual de la gráfica.
- Se añadieron `Documentacion.md` y esta memoria técnica para explicar instalación, API, clasificación, consulta y configuración de fotos.
- Se confirmó con los valores reales de `Modelo` el formato de receta de cuatro dígitos seguido por uno o varios números de parte separados por `_`. Se añadió la sección **Relación** con búsqueda por modelo, receta y número de parte, más conteos por estado que respetan los filtros generales.
- Los conteos de fotos totales, buenas y malas de **Relación** son botones con icono de ojo: cada uno abre la galería filtrando el modelo y estado seleccionados. Se agregó búsqueda por parte del `NombreImagen` en SQL para que opere sobre todas las páginas y pueda combinarse con el modelo/resultados elegidos.
- Se incorporaron animaciones inspiradas en `SCRAPDashboard`: entrada escalonada de métricas y filas, crecimiento de barras SVG, entrada progresiva de tarjetas de fotos y elevación sutil en hover. Se implementaron con CSS/JS nativo, sin agregar dependencias, y se desactivan según `prefers-reduced-motion`.
- Se añadieron estados skeleton con shimmer durante consultas: las cuatro métricas, el gráfico, las filas de modelos y las tarjetas de fotos muestran placeholders y recuperan los datos (o el estado previo) al terminar la petición.
- Las tarjetas de métricas ahora incluyen el tamaño acumulado de las fotos total, buenas, malas y no clasificadas. La API calcula subtotales usando `TamanoBytes` y mantiene los mismos filtros de periodo, línea y cámara.
- La tabla diaria de **Actividad por día** incluye el porcentaje diario de buenas y malas (sobre el total de fotos de ese día) y los tamaños total, de buenas y de malas; se quitó la columna de fotos sin clasificar. Se corrigió la proyección SQL para devolver los subtotales diarios de bytes que faltaban en la respuesta.
- El consumo histórico se muestra dentro del primer cuadro de **Fotos analizadas**, junto al consumo del periodo. El quinto cuadro se destinó a **FTQ**, mostrando el porcentaje de buenas y el conteo de fotos buenas sobre fotos analizadas.
- La gráfica de actividad superpone una línea del porcentaje de fotos buenas, con eje derecho de 0 a 100% y puntos con valores emergentes.
- La línea del porcentaje de buenas es naranja uniforme y mantiene etiquetas porcentuales junto a cada punto. La tabla de actividad permite filtrar por mínimo/máximo de fotos al día, sin controles adicionales de fecha. La relación modelo/parte presenta porcentajes de buenas y malas usando las fotos totales del modelo como denominador.
- Las fechas visibles del gráfico y las fechas de la tabla diaria son seleccionables y abren la galería filtrada a ese día, con la fecha mostrada como contexto. Se mantienen los filtros de línea/cámara y se permite quitar el filtro destacado.

## Pruebas y verificaciones

Comandos del proyecto:

```powershell
npm test
npm audit --omit=dev
semgrep scan --config=auto
```

Las pruebas unitarias cubren rutas de imagen dentro/fuera de la raíz, página inicial, rechazo de filtros inválidos, rechazo de orígenes cruzados y contrato de consultas `SELECT` contra una API simulada. También se realizaron consultas de integración de solo lectura contra el recurso de SQL corporativo durante el desarrollo.

Semgrep mantiene una alerta informativa relacionada con que no se instaló un middleware general de CSRF; la API expone solo solicitudes `GET` de lectura y valida el origen. El reporte y la evaluación están en `SECURITY-REPORT.md`.

## Pendientes conocidos

- Conceder al usuario que ejecuta Node.js acceso de lectura al recurso UNC de fotos y definir `IMAGE_ROOT`. Hasta entonces, las consultas de datos funcionan, pero no se pueden afirmar fotos visibles desde este entorno.
- Acordar con ingeniería si más adelante se necesita guardar la explicación de los resultados malos y cómo se incorporará al esquema de datos.
- Si se requiere acceso compartido, definir autenticación y controles de acceso antes de cambiar el listener local predeterminado.
