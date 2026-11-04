# Reporte de seguridad

**Fecha:** 2026-11-04
**Proyecto:** Panel de inspección de cámaras OVR

## Alcance y resultados

- `semgrep scan --config=auto`: 1 hallazgo informativo; 0 hallazgos críticos o altos.
- `npm audit --omit=dev`: 0 vulnerabilidades en dependencias de producción.
- La advertencia inicial de Semgrep sobre lectura arbitraria de archivos se atendió: las imágenes se limitan a `IMAGE_ROOT`, se valida la ruta canónica (incluidos enlaces simbólicos) y se transmiten desde esa ruta validada. Ya no aparece en el escaneo final.

## Hallazgo informativo

| Regla | Ubicación | Evaluación |
|---|---|---|
| `javascript.express.security.audit.express-check-csurf-middleware-usage` | `backend/src/server.js:21` | Semgrep no reconoce una biblioteca de tokens CSRF. La aplicación solo expone consultas `GET` de lectura y no utiliza sesiones ni cookies de autenticación; además, rechaza solicitudes API con origen distinto o `Sec-Fetch-Site: cross-site`. No se identificó una operación que permita modificar datos mediante CSRF. Si se agregan operaciones que cambien datos o autenticación por cookies, deberán incorporar protección CSRF basada en token. |

El panel escucha en `127.0.0.1` por defecto. No debe exponerse directamente a Internet; el acceso compartido requiere una red privada y controles de acceso adecuados.
