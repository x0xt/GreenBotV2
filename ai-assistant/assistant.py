# assistant.py
import os, sys, argparse
from ai.core.text import log
from ai.core.state import set_machine_mode  # Import the state setter
from ai.core.ollama_client import make_client
from ai.pipeline.pipeline import run_pipeline

def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("query", nargs="+", help="question to research")
    p.add_argument("--model", default="internet_anarchist", help="LLM used for both steps (default: internet_anarchist)")
    p.add_argument("--final_model", default=None, help="optional different model for composing (default: same as --model)")
    p.add_argument("--timeout", type=float, default=110.0, help="HTTP timeout seconds")
    p.add_argument("--keepalive", default="20m", help="keep models warm on daemon, e.g. '20m' or '1h'; use '0' to disable")
    p.add_argument("--max_results", type=int, default=6, help="search results to fetch")
    p.add_argument("--machine", action="store_true", help="print only final markdown (no logs)")
    return p.parse_args()

def main():
    args = parse_args()

    # Set the machine mode state for the entire application right away
    if args.machine:
        set_machine_mode(True)

    query = " ".join(args.query).strip()
    if not query:
        print("empty query", file=sys.stderr)
        sys.exit(2)

    keep = None if args.keepalive in ("0", "false", "False", "") else args.keepalive
    final_model = args.final_model or args.model
    host = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434")

    # These log calls are now safe and will be automatically silenced in machine mode
    log("SETUP", f"host={host} timeout={args.timeout:.1f}s keep_alive={keep}")
    log("PIPE",  f"start query='{query}'")

    client = make_client(timeout=args.timeout)
    body, meta = run_pipeline(
        client=client,
        query=query,
        keep_alive=keep,
        model_researcher=args.model,
        model_final=final_model,
        max_results=args.max_results,
    )

    log("PIPE", f"complete ({meta['t_total']}s)")

    # This is now the ONLY thing that will print to stdout in machine mode
    print(body)
    sys.exit(0)

if __name__ == "__main__":
    main()
