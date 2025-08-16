# ai/pipeline/composer.py
from ai.core.text import log
from ai.core.prompts import composer_prompt
from ai.core.ollama_client import composer_opts

def run_composer(client, model: str, facts: str, query: str, keep_alive: str | None) -> str:
    log("FINAL", f"model={model} keep_alive={keep_alive}")
    prompt = composer_prompt(facts, query)
    r = client.generate(
        model=model,
        prompt=prompt,
        stream=False,
        keep_alive=keep_alive,
        options=composer_opts(),
    )
    ans = (r.get("response") or "").strip()
    log("FINAL", "done")
    return ans
