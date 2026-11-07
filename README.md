# PixelPulse 🎮

Noticias de videojuegos en español e inglés que se actualizan solas cada hora. Gratis y sin servidor.

## Qué incluye

- Portada con noticia principal y destacadas, y cuadrícula de últimas noticias
- 14 medios (5 en español, 9 en inglés)
- Categorías automáticas: PC, PlayStation, Xbox, Nintendo, Móvil, Esports y Lanzamientos
- Filtros por idioma (ES / EN / ambos), por medio y buscador
- Interfaz en español o inglés, según el idioma elegido o el del navegador
- Tema oscuro (neón) y claro
- Botones para compartir (WhatsApp, X, copiar enlace)
- Feed RSS propio (`feed.xml`), `sitemap.xml` y `robots.txt` generados solos
- Páginas de Acerca de, Privacidad y Contacto

## Cómo funciona

1. `update_news.py` lee los feeds RSS de los medios y genera `news.json`, `feed.xml`, `sitemap.xml` y `robots.txt`.
2. `.github/workflows/update-news.yml` lo ejecuta cada hora en GitHub Actions y guarda el resultado en el repositorio.
3. `index.html` + `app.js` + `style.css` leen `news.json` y muestran las noticias.

Si un medio falla en una ejecución, se conservan sus noticias anteriores (hasta 30 días) y se siguen mostrando las de los demás.

## Puesta en marcha (una sola vez)

1. Crea un repositorio **público** en GitHub (por ejemplo `pixelpulse`) y sube todos los archivos de esta carpeta, conservando `.github/workflows/`.
2. En **Actions**, ejecuta a mano **Actualizar noticias** (*Run workflow*) para llenar `news.json` de inmediato. Revisa el registro: indica qué medios funcionaron (`OK`) y cuáles no (`FALLO`).
3. En **Settings → Pages**, elige **Deploy from a branch**, rama `main`, carpeta `/ (root)`.
4. Tu sitio quedará en `https://TU-USUARIO.github.io/pixelpulse/`.

Si tu repositorio se llama `TU-USUARIO.github.io`, la dirección del sitio no lleva el nombre del repositorio: ajusta `SITE_URL` en el workflow.



## Personalizar

- **Medios**: edita la lista `FEEDS` en `update_news.py` (nombre, URL del feed, idioma y, si quieres, `cats` para forzar una categoría).
- **Categorías**: edita `CATEGORIES` (palabras clave en español e inglés).
- **Frecuencia**: cambia el `cron` del workflow (`"0 */3 * * *"` = cada 3 horas).
- **Colores**: variables al inicio de `style.css`.

## Cosas a vigilar

- Las direcciones de los feeds no se pudieron probar al preparar el proyecto. Tras la primera ejecución, revisa en el registro cuáles dan `FALLO` y reemplaza o quita esos medios.
- GitHub puede desactivar los workflows programados de un repositorio sin actividad durante 60 días. De vez en cuando mira la pestaña **Actions**; si está pausado, se reactiva con un clic.
- Las miniaturas se cargan desde los servidores de cada medio. Si algún medio las bloquea, la tarjeta muestra un recuadro con su nombre.
- Mantén siempre el enlace al artículo original y no copies textos completos.
"# pixelpulse" 
