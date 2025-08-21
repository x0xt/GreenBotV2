import { humanize } from "../../../shared/humanize.js";
// src/features/ai/runner/runAssistant.js
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";

export function runAssistant(query, { onTick, onDone, onError, timeoutMs = 120000 } = {}) {
  const root = process.cwd();
  const aiDir = path.join(root, "ai-assistant");
  const py = os.platform() === "win32"
    ? path.join(aiDir, "venv", "Scripts", "python.exe")
    : path.join(aiDir, "venv", "bin", "python");
  const script = path.join(aiDir, "assistant.py");

  const args = [
    script,
    query,
    "--timeout", "110",
    "--keepalive", "20m",
    "--max_results", "6",
    "--machine" // <- only final markdown to stdout
  ];

  const child = spawn(py, args, {
    cwd: aiDir,
    env: {
      ...process.env,
      OLLAMA_HOST: process.env.OLLAMA_HOST || "http://127.0.0.1:11434",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let out = "";
  let err = "";

  const started = Date.now();

  // simple heartbeat for the progress UI
  const beats = ["finding", "extracting", "composing"];
  let idx = 0;
  const ticker = setInterval(() => {
    if (onTick) onTick(beats[Math.min(idx, beats.length - 1)], Math.floor((Date.now() - started) / 1000));
    idx++;
  }, 1000);

  child.stdout.on("data", d => out += d.toString());
  child.stderr.on("data", d => err += d.toString());

  const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, timeoutMs);

  child.on("close", (code) => {
    clearTimeout(timer);
    clearInterval(ticker);
    if (code === 0 && out.trim()) {
      onDone?.(humanize(out.trim()), Math.floor((Date.now() - started) / 1000));
    } else {
      onError?.(err.trim() || out.trim() || `exit ${code}`, Math.floor((Date.now() - started) / 1000));
    }
  });

  child.on("error", (e) => {
    clearTimeout(timer);
    clearInterval(ticker);
    onError?.(e.message, Math.floor((Date.now() - started) / 1000));
  });

  return child;
}
