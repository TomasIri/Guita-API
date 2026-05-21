# Guita — instrucciones para Claude

## Permisos de comandos

Podés ejecutar comandos de lectura sin pedirme confirmación. Esto incluye:
- `ls`, `find` — explorar estructura de archivos
- `grep` — buscar patrones en el código
- `sed` (solo lectura / dry-run) — inspeccionar contenido
- `cat`, `head`, `tail` — leer archivos desde la terminal
- Cualquier otro comando que no modifique el sistema de archivos ni ejecute procesos externos

Los comandos que **sí requieren confirmación** son: escritura de archivos, instalación de dependencias (`npm install`), ejecución del servidor de desarrollo, y cualquier operación destructiva.

## Comandos de desarrollo

```bash
npm run dev       # Inicia el servidor de desarrollo en http://localhost:5173
npm run build     # Genera el build de producción en dist/
npm run preview   # Sirve el build de producción localmente
npm test          # Corre los tests una sola vez (Vitest)
npm run test:watch # Modo watch para desarrollo de tests
```

## Arquitectura del proyecto

- **`index.html`** — Entrada de Vite: HTML + CSS inline + pdfjs CDN
- **`src/main.js`** — Punto de entrada del módulo: renderiza pantallas, maneja eventos, expone funciones a `window`
- **`src/state/store.js`** — Estado global en `localStorage`, migración de schema, helpers de lookup
- **`src/services/sync.js`** — Sincronización con Google Apps Script; valida URL antes de enviar
- **`src/services/pdf.js`** — Parseo de PDFs bancarios con detección de duplicados
- **`src/constants.js`** — Categorías, íconos, tips financieros
- **`src/utils/`** — Funciones puras: `money.js`, `date.js`, `sanitize.js`, `id.js`, `toast.js`
- **`tests/`** — Suite Vitest (46 tests, pure functions, sin DOM)
- **`Finanzas_App.html`** — Versión monolítica anterior (archivo de referencia, no usar en producción)

## Seguridad

- Todos los datos de usuario se escapan con `escapeHTML()` antes de insertar en innerHTML
- Las URLs de Google Apps Script se validan con `validateUrl()` (solo acepta `https://script.google.com/macros/s/…`)
- Vulnerabilidad moderada en `esbuild` (solo afecta el servidor de desarrollo): para corregirla hay que hacer `npm audit fix --force` que actualiza a Vite 8 (cambio mayor)

## Tests

Los tests cubren las funciones puras de `src/utils/` y `src/services/sync.js`:
- `fmt`, `pct`, `cv`, `cvb` — formateo de dinero y CSS vars
- `escapeHTML`, `csvField` — sanitización
- `mesKey`, `txMes`, `isoToday`, `isoYesterday` — helpers de fecha
- `generateId` — IDs únicos
- `validateUrl` — validación de URLs de Apps Script
