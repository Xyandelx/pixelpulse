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




