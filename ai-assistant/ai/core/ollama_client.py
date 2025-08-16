# ai/core/ollama_client.py
import os
import ollama

def make_client(timeout: float):
    host = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434")
    return ollama.Client(host=host, timeout=timeout)

def researcher_opts():
    return {
        "num_predict": 140,
        "temperature": 0.2,
        "top_p": 0.3,
        "num_ctx": 2048,
        "num_thread": 0,
        "num_batch": 64,
    }

def composer_opts():
    return {
        "num_predict": 120,
        "temperature": 0.2,
        "top_p": 0.5,
        "num_ctx": 2048,
        "num_thread": 0,
        "num_batch": 64,
    }
