#!/usr/bin/env python3
"""PixelPulse: lee feeds RSS/Atom de noticias de videojuegos y genera
news.json, feed.xml, sitemap.xml y robots.txt.

Solo usa la biblioteca estándar de Python: no hay nada que instalar ni pagar.
Para agregar o quitar medios, edita la lista FEEDS.
"""
import html
import json
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime, parsedate_to_datetime
from xml.sax.saxutils import escape

SITE_NAME = "PixelPulse"
SITE_URL = os.environ.get("SITE_URL", "").rstrip("/")
OUT_DIR = os.environ.get("OUT_DIR", os.path.dirname(os.path.abspath(__file__)))

# "cats" fuerza categorías para medios especializados en una plataforma.
FEEDS = [
    # Español
    {"name": "Vandal", "url": "https://vandal.elespanol.com/xml.cgi", "lang": "es"},
    {"name": "HobbyConsolas", "url": "https://www.hobbyconsolas.com/feed", "lang": "es"},
    {"name": "3DJuegos", "url": "https://www.3djuegos.com/feeds/noticias.xml", "lang": "es"},
    {"name": "LevelUp", "url": "https://www.levelup.com/rss", "lang": "es"},
    {"name": "Areajugones", "url": "https://www.areajugones.es/feed/", "lang": "es"},
    # Inglés
    {"name": "IGN", "url": "https://feeds.feedburner.com/ign/all", "lang": "en"},
    {"name": "GameSpot", "url": "https://www.gamespot.com/feeds/news/", "lang": "en"},
    {"name": "Eurogamer", "url": "https://www.eurogamer.net/feed", "lang": "en"},
    {"name": "PC Gamer", "url": "https://www.pcgamer.com/rss/", "lang": "en", "cats": ["pc"]},
    {"name": "Rock Paper Shotgun", "url": "https://www.rockpapershotgun.com/feed", "lang": "en", "cats": ["pc"]},
    {"name": "VG247", "url": "https://www.vg247.com/feed", "lang": "en"},
    {"name": "Nintendo Life", "url": "https://www.nintendolife.com/feeds/latest", "lang": "en", "cats": ["nintendo"]},
    {"name": "Push Square", "url": "https://www.pushsquare.com/feeds/latest", "lang": "en", "cats": ["playstation"]},
    {"name": "Pure Xbox", "url": "https://www.purexbox.com/feeds/latest", "lang": "en", "cats": ["xbox"]},
]

# Categorías por palabras clave (español e inglés) en título + resumen.
CATEGORIES = {
    "pc": [r"\bpc\b", r"\bsteam\b", r"epic games", r"\bgog\b", r"nvidia", r"\bamd\b", r"\bgpu\b"],
    "playstation": [r"playstation", r"\bps[345]\b", r"\bps vr"],
    "xbox": [r"xbox", r"game pass"],
    "nintendo": [r"nintendo", r"switch 2", r"zelda", r"\bmario\b", r"pok[eé]mon"],
    "mobile": [r"\bm[oó]vil(es)?\b", r"\bmobile\b", r"android", r"\bios\b", r"iphone", r"app store", r"google play"],
    "esports": [r"e-?sports?", r"valorant", r"league of legends", r"torneo", r"tournament", r"\bcs2\b", r"dota"],
    "releases": [r"lanzamiento", r"\blaunch", r"release date", r"fecha de (salida|lanzamiento)",
                 r"out now", r"disponible ya", r"tr[aá]iler", r"\btrailer"],
}

MAX_PER_FEED = 25
MAX_TOTAL = 200
MAX_AGE_DAYS = 30
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; PixelPulseBot/1.0)"}


def local(tag):
    """Nombre de etiqueta sin namespace."""
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def child_text(el, *names):
    for c in el:
        if local(c.tag) in names and (c.text or "").strip():
            return c.text.strip()
    return ""


def clean(text, limit=220):
    text = re.sub(r"<[^>]+>", " ", text or "")
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > limit:
        text = text[:limit].rsplit(" ", 1)[0] + "…"
    return text


def parse_date(raw):
    """Devuelve datetime UTC o None si no hay fecha válida."""
    if not raw:
        return None
    try:
        d = parsedate_to_datetime(raw)
    except Exception:
        try:
            d = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except Exception:
            return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    d = d.astimezone(timezone.utc)
    return min(d, datetime.now(timezone.utc))  # sin fechas en el futuro


def to_dt(iso):
    return datetime.fromisoformat(iso)


def normalize_image(url):
    url = (url or "").strip()
    if url.startswith("//"):
        url = "https:" + url
    if url.startswith("http://"):
        url = "https://" + url[len("http://"):]
    return url if url.startswith("https://") else ""


def find_image(item):
    for c in item.iter():
        name = local(c.tag)
        if name in ("content", "thumbnail") and c.get("url"):
            t = c.get("type", "")
            if name == "thumbnail" or t.startswith("image") or c.get("medium") == "image" or not t:
                return normalize_image(c.get("url"))
        if name == "enclosure" and c.get("type", "").startswith("image") and c.get("url"):
            return normalize_image(c.get("url"))
    blob = child_text(item, "encoded") + child_text(item, "description", "summary", "content")
    m = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', html.unescape(blob))
    return normalize_image(m.group(1)) if m else ""


def find_link(item):
    for c in item:
        if local(c.tag) == "link":
            href = c.get("href") or (c.text or "").strip()
            if href:
                return href
    return ""


def categorize(feed, text):
    cats = list(feed.get("cats", []))
    low = text.lower()
    for cat, patterns in CATEGORIES.items():
        if cat not in cats and any(re.search(p, low) for p in patterns):
            cats.append(cat)
    return cats


def fetch_feed(feed):
    req = urllib.request.Request(feed["url"], headers=HEADERS)
    with urllib.request.urlopen(req, timeout=25) as resp:
        data = resp.read()
    root = ET.fromstring(data)
    entries = [e for e in root.iter() if local(e.tag) in ("item", "entry")]
    out = []
    for it in entries[:MAX_PER_FEED]:
        title = clean(child_text(it, "title"), 200)
        link = find_link(it)
        if not title or not link.lower().startswith(("http://", "https://")):
            continue
        date = parse_date(child_text(it, "pubDate", "published", "updated", "date"))
        summary = clean(child_text(it, "description", "summary", "content"))
        out.append(
            {
                "title": title,
                "link": link,
                "summary": summary,
                "image": find_image(it),
                "source": feed["name"],
                "lang": feed["lang"],
                "cats": categorize(feed, f"{title} {summary}"),
                "date": date.isoformat() if date else None,
            }
        )
    return out


def safe_fetch(feed):
    try:
        items = fetch_feed(feed)
        print(f"OK    {feed['name']}: {len(items)} noticias")
        return items
    except Exception as e:  # un medio caído no debe tumbar a los demás
        print(f"FALLO {feed['name']}: {e}", file=sys.stderr)
        return []


def load_previous():
    path = os.path.join(OUT_DIR, "news.json")
    try:
        with open(path, encoding="utf-8") as f:
            items = json.load(f).get("items", [])
        return [i for i in items if isinstance(i, dict) and i.get("link") and i.get("date")]
    except Exception:
        return []


def write_feed(items):
    base = SITE_URL or "https://example.com"
    now = datetime.now(timezone.utc)
    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0"><channel>',
        f"<title>{escape(SITE_NAME)}</title>",
        f"<link>{escape(base)}/</link>",
        "<description>Noticias de videojuegos en español e inglés / Gaming news in Spanish and English</description>",
        f"<lastBuildDate>{format_datetime(now)}</lastBuildDate>",
    ]
    for it in items[:50]:
        parts.append(
            "<item>"
            f"<title>{escape(it['title'])}</title>"
            f"<link>{escape(it['link'])}</link>"
            f'<guid isPermaLink="true">{escape(it["link"])}</guid>'
            f"<description>{escape(it['summary'])}</description>"
            f"<category>{escape(it['source'])}</category>"
            f"<pubDate>{format_datetime(to_dt(it['date']))}</pubDate>"
            "</item>"
        )
    parts.append("</channel></rss>")
    with open(os.path.join(OUT_DIR, "feed.xml"), "w", encoding="utf-8") as f:
        f.write("\n".join(parts))


def write_site_files():
    if SITE_URL:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        pages = ["", "about.html", "privacy.html", "contact.html"]
        urls = "".join(
            f"<url><loc>{escape(SITE_URL)}/{p}</loc><lastmod>{today}</lastmod></url>" for p in pages
        )
        with open(os.path.join(OUT_DIR, "sitemap.xml"), "w", encoding="utf-8") as f:
            f.write(
                '<?xml version="1.0" encoding="UTF-8"?>'
                f'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>'
            )
    robots = "User-agent: *\nAllow: /\n"
    if SITE_URL:
        robots += f"Sitemap: {SITE_URL}/sitemap.xml\n"
    with open(os.path.join(OUT_DIR, "robots.txt"), "w", encoding="utf-8") as f:
        f.write(robots)


def main():
    with ThreadPoolExecutor(max_workers=6) as pool:
        fresh = [it for res in pool.map(safe_fetch, FEEDS) for it in res]

    if not fresh:
        print("No se obtuvo ninguna noticia; se conserva el news.json anterior.", file=sys.stderr)
        sys.exit(1)

    previous = {i["link"]: i for i in load_previous()}
    now_iso = datetime.now(timezone.utc).isoformat()
    merged = dict(previous)
    for it in fresh:
        if it["date"] is None:  # sin fecha en el feed: conserva la que ya tenía
            it["date"] = previous[it["link"]]["date"] if it["link"] in previous else now_iso
        merged[it["link"]] = it

    cutoff = datetime.now(timezone.utc) - timedelta(days=MAX_AGE_DAYS)
    items = [i for i in merged.values() if to_dt(i["date"]) >= cutoff]
    items.sort(key=lambda x: to_dt(x["date"]), reverse=True)
    items = items[:MAX_TOTAL]

    os.makedirs(OUT_DIR, exist_ok=True)
    payload = {"updated": now_iso, "items": items}
    with open(os.path.join(OUT_DIR, "news.json"), "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
    write_feed(items)
    write_site_files()
    print(f"Listo: {len(items)} noticias guardadas.")


if __name__ == "__main__":
    main()
