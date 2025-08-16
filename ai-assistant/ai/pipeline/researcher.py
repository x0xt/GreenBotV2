# ai/pipeline/researcher.py
from ai.core.text import log
from ai.core.prompts import researcher_prompt
from ai.core.ollama_client import researcher_opts

def _clean_bullets(text: str) -> str:
    lines = []
    for raw in (text or "").splitlines():
        s = raw.strip()
        if not s:
            continue
        # strip any leading bullets/numbers/dashes and re-prefix once
        s = s.lstrip("•-*0123456789. ").strip()
        lines.append(f"• {s}")
    # if model returned nothing, keep a single unknown bullet
    return "\n".join(lines) if lines else "• unknown in source"

def run_researcher(client, model: str, material: str, query: str, keep_alive: str | None) -> str:
    log("RESEARCHER", f"model={model} keep_alive={keep_alive}")
    prompt = researcher_prompt(material, query)
    r = client.generate(
        model=model,
        prompt=prompt,
        stream=False,
        keep_alive=keep_alive,
        options=researcher_opts(),
    )
    resp = (r.get("response") or "").strip()
    cleaned = _clean_bullets(resp)
    log("RESEARCHER", "done")
    return cleaned
