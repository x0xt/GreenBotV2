# ai/pipeline/formatter.py
from ai.core.text import log
from ai.core.prompts import formatter_prompt
from ai.core.ollama_client import formatter_opts

def run_formatter(client, model: str, query: str, facts: str, keep_alive: str | None):
    log("STEP 3/3", "composing answer…")
    prompt = formatter_prompt(query, facts)

    r = client.generate(
        model=model,
        prompt=prompt,
        stream=False,
        keep_alive=keep_alive,
        options=formatter_opts(),
    )
    out = (r.get("response") or "").strip()

    # very small guard: ensure it ends cleanly
    if not out.endswith("\n"):
        out += "\n"
    log("STEP 3/3", "done")
    return out
