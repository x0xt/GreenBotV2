# ai/core/prompts.py
from textwrap import dedent

def researcher_prompt(material: str, query: str) -> str:
    return dedent(f"""\
        Summarize **verifiable facts only** from the MATERIAL to answer the QUESTION.
        Output **only bullet points**, each starting with "• " — no headings, no intro, no outro.
        - Keep bullets short and factual.
        - If a needed fact is absent, include exactly one bullet: "• unknown in source".

        MATERIAL:
        {material}

        QUESTION:
        {query}
    """)

def composer_prompt(facts: str, query: str) -> str:
    return dedent(f"""\
        Based **only** on the FACTS below, answer the QUESTION concisely and plainly.
        If the question asks "who owns X" and FACTS indicate a public company, say it is
        owned by shareholders and optionally mention the largest holders if included.

        FACTS:
        {facts}

        QUESTION:
        {query}

        Final answer:
    """)
