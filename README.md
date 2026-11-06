# Panel de inspección de cámaras OVR

Panel web en español y tema oscuro para consultar `PrensasOvrPrueba.dbo.Autoraking`, filtrar por periodo, línea y cámara, revisar conteos diarios y abrir las fotos relacionadas. Frontend y backend están separados; la aplicación no modifica la base de datos.

## Requisitos

- Node.js 24 o posterior.
- Acceso de red/VPN al servicio de datos corporativo y permisos de lectura en `est04db`, base `PrensasOvrPrueba`, tabla `dbo.Autoraking`.
- Una carpeta accesible por el usuario que ejecuta el panel, que contenga las imágenes.

## Configuración

1. Copia `DB/.env.example` como `DB/.env`.
2. En `DB/.env`, configura `DB_API_BASE_URL` con la dirección HTTPS del servicio corporativo de datos. El servidor y la base ya están definidos como `est04db` y `PrensasOvrPrueba`; puedes ajustarlos aquí si el entorno lo requiere. CamarasOvr carga su propia configuración y no lee archivos de otros proyectos.
3. En `DB/.env`, configura `IMAGE_ROOT` con la raíz accesible donde están las fotos, por ejemplo `C:\FotosOVR`. Solo se mostrarán imágenes dentro de esa carpeta.
4. Ejecuta `npm run launch` desde la raíz del proyecto para instalar todas las dependencias y arrancar el panel.
5. Abre `http://127.0.0.1:4910`.

El panel escucha en `127.0.0.1` por defecto. No lo expongas directamente a Internet; para uso compartido se requiere una red privada y controles de acceso adecuados. Todas las consultas se envían desde el servidor web a la API corporativa, son de solo lectura y no se aceptan SQL desde el navegador.

Para fotos alojadas en una carpeta compartida, configura `IMAGE_ROOT` con la ruta UNC raíz y asegúrate de que la cuenta de Windows que inicia `npm start` tenga permisos de lectura sobre esa carpeta. Que el servidor responda en la red no garantiza acceso al recurso compartido.

## Fotos y resultados

La app busca primero el archivo indicado en `RutaCompleta`; si no está disponible, combina `Ruta` y `NombreImagen`. Las rutas se restringen a `IMAGE_ROOT`. Los resultados se interpretan desde `Status` (1 = buena, 0 = mala), usando `Estado` como respaldo si `Status` no tiene un valor reconocible. Las demás clasificaciones se cuentan como “sin clasificación”.

La tabla descrita no contiene una causa para el resultado bueno/malo. Por ahora se muestra el estado registrado; la captura de motivos queda pendiente para una futura mejora definida por ingeniería.

## Comprobaciones

```powershell
npm test
semgrep scan --config=auto
```

Consulta [Documentacion.md](Documentacion.md) para el detalle de la arquitectura, la gráfica y la conexión. Consulta [memoria.md](memoria.md) para decisiones y cambios técnicos.
