# ai/search/ddg_search.py
from ddgs import DDGS

def search_web(query: str, max_results: int = 6):
    hits = []
    with DDGS() as ddgs:
        for i, r in enumerate(ddgs.text(query, max_results=max_results)):
            if not r:
                continue
            hits.append({
                "title": r.get("title") or "",
                "href": r.get("href") or "",
                "body": r.get("body") or "",
            })
    return hits
