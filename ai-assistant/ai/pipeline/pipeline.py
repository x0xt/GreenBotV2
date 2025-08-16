# ai/pipeline/pipeline.py
from time import perf_counter
from ai.core.text import log
from ai.search.ddg_search import search_web
from ai.pipeline.researcher import run_researcher
from ai.pipeline.composer import run_composer

def make_material(hits):
    lines = []
    for h in hits:
        if h.get("title"):
            lines.append(h["title"])
        if h.get("body"):
            lines.append(h["body"])
        if h.get("href"):
            lines.append(f"({h['href']})")
    return "\n".join(lines)

def run_pipeline(client, query: str, keep_alive: str | None, model_researcher: str, model_final: str, max_results: int):
    t0 = perf_counter()

    # Step 1: search
    log("STEP 1/3", "finding sources…")
    hits = search_web(query, max_results=max_results)
    mat = make_material(hits)
    t1 = perf_counter()
    log("STEP 1/3", f"done ({len(hits)} hits)")

    # Step 2: facts
    log("STEP 2/3", f"extracting facts with model={model_researcher}…")
    facts = run_researcher(client, model_researcher, mat, query, keep_alive)
    t2 = perf_counter()

    # Step 3: compose
    log("STEP 3/3", "composing answer…")
    answer = run_composer(client, model_final, facts, query, keep_alive)
    t3 = perf_counter()
    log("STEP 3/3", "done")

    total = t3 - t0
    # Return compact, safe markdown (no IPs/URLs printed unless included in facts)
    body = (
        f"**Facts**\n{facts}\n\n"
        f"**Answer**\n{answer}"
    )
    meta = {
        "t_search": round(t1 - t0, 1),
        "t_facts": round(t2 - t1, 1),
        "t_compose": round(t3 - t2, 1),
        "t_total": round(total, 1),
    }
    return body, meta
