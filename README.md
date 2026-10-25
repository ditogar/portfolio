# Portfolio · Diego Torres García

Web estática (HTML, CSS, JavaScript y Three.js) lista para GitHub Pages. Sin build.

## Estructura

```
index.html              Contenido en español (fuente de verdad)
assets/css/main.css     Estilos
assets/js/i18n.js       Traducciones EN y CA (+ textos que usa JS)
assets/js/app.js        Idioma, navegación, paleta Ctrl+K, galerías, simulación de sprint
assets/js/space.js      Escena 3D ligada al scroll (Three.js 0.160 desde jsDelivr)
assets/img/games/       Capturas (-sm = miniatura, sin sufijo = visor)
assets/cv/              CV descargable
```

## Ver en local

```bash
python -m http.server 5173
```

Abrir http://127.0.0.1:5173 (los módulos JS no funcionan abriendo el archivo con doble clic).

## Editar textos

1. Español: directamente en `index.html` (elementos con `data-i18n`).
2. Inglés y catalán: la misma clave en `assets/js/i18n.js`.
3. Si falta una clave, la consola avisa con `[i18n] faltan claves`.

Idioma inicial: `?lang=es|en|ca` → preferencia guardada → idioma del navegador.

## Publicar en GitHub Pages

1. Crear repositorio y subir el contenido de esta carpeta (`.claude/` está en `.gitignore`).
2. Settings → Pages → Deploy from a branch → `main` / `root`.
3. Publicado en https://ditogar.github.io/portfolio/ (`og:image`, `og:url` y `canonical` ya apuntan ahí; cámbialos si cambia la URL).

## CV

Fuente en `cv-src/cv.html`. Con el servidor local en marcha, regenerar el PDF:

```bash
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --no-pdf-header-footer --virtual-time-budget=8000 --print-to-pdf="C:\Users\diego\Repos\portfolio-2026\assets\cv\CV_Diego_Torres_Garcia_2026.pdf" http://127.0.0.1:5173/cv-src/cv.html
```

## Extras

- `Ctrl K` / `⌘K` o `/`: navegación rápida.
- Código Konami (↑↑↓↓←→←→BA): salto al hiperespacio.
- Botón de pausa y `prefers-reduced-motion` respetados.
