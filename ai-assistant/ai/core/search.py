import requests
import html
import re

UA = "Mozilla/5.0 (compatible; GreenBotResearch/1.0; +https://example.invalid)"

def ddg_instant_answer(query: str) -> dict:
    """Use DuckDuckGo's Instant Answer API (no tracking, no key)."""
    r = requests.get(
        "https://api.duckduckgo.com/",
        params={"q": query, "format": "json", "no_html": 1, "no_redirect": 1},
        headers={"User-Agent": UA},
        timeout=10,
    )
    r.raise_for_status()
    return r.json()

def ddg_html_lite(query: str, n: int = 5) -> list[dict]:
    """
    Scrape DuckDuckGo's lite HTML endpoint for top results.
    Returns [{title, url, snippet}, ...]
    """
    url = "https://duckduckgo.com/html/"
    r = requests.post(
        url, data={"q": query}, headers={"User-Agent": UA}, timeout=10
    )
    r.raise_for_status()
    html_text = r.text

    # crude parse; good enough for titles/snippets/links in lite HTML
    items = []
    for m in re.finditer(
        r'<a rel="nofollow" class="[^"]*" href="(?P<url>[^"]+)".*?>(?P<title>.*?)</a>.*?<a class="result__snippet"[^>]*>(?P<snippet>.*?)</a>',
        html_text, flags=re.S | re.I,
    ):
        url_ = html.unescape(m.group("url"))
        title = re.sub("<.*?>", "", html.unescape(m.group("title")))
        snip  = re.sub("<.*?>", "", html.unescape(m.group("snippet")))
        items.append({"title": title.strip(), "url": url_.strip(), "snippet": snip.strip()})
        if len(items) >= n:
            break
    return items

def ddg_search(query: str, n: int = 5) -> list[dict]:
    """Try Instant Answer; if too thin, fall back to lite HTML."""
    try:
        ia = ddg_instant_answer(query)
        out = []
        if ia.get("AbstractText"):
            out.append({
                "title": ia.get("Heading") or "Instant Answer",
                "url": ia.get("AbstractURL") or "",
                "snippet": ia["AbstractText"],
            })
        for r in (ia.get("RelatedTopics") or [])[:n]:
            if isinstance(r, dict) and r.get("Text") and r.get("FirstURL"):
                out.append({"title": r.get("Text").split(" - ", 1)[0],
                            "url": r["FirstURL"], "snippet": r["Text"]})
        if len(out) >= max(2, n//2):
            return out[:n]
    except Exception:
        pass
    # fallback
    try:
        return ddg_html_lite(query, n=n)
    except Exception:
        return []
