#!/usr/bin/env python3
"""rexai-image.py 防卡死测试（stdlib only，python3 直接跑）。

用本地 HTTP mock 验证四条硬保证：
  1. 轮询遇到瞬时 5xx 不会假死也不会误杀，恢复后正常出图；
  2. 任务永远不进入终态时，脚本在 --timeout 硬边界内必然退出（绝不挂死）；
  3. 中转熔断失败自动重交，且重交次数有上限（最多 3 次提交）；
  4. 4xx（如 401 密钥错误）立即失败，不重试风暴。
"""
import base64
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SCRIPT = pathlib.Path(__file__).resolve().with_name("rexai-image.py")
PNG_B64 = base64.b64encode(b"\x89PNG\r\n\x1a\nfake").decode()


class State:
    def __init__(self):
        self.submits = 0
        self.polls = 0
        self.poll_script = []          # 每项: 500 | "processing" | "succeeded" | "failed:circuit"
        self.submit_status = 200       # 200 | 401


def make_handler(state):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _send(self, code, obj):
            body = json.dumps(obj).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            if self.path.endswith("/v1/images/generations"):
                state.submits += 1
                if state.submit_status != 200:
                    self._send(state.submit_status, {"error": "Invalid token"})
                    return
                self._send(200, {"id": f"job-{state.submits}", "status": "processing"})
            else:
                self._send(404, {"error": "not_found"})

        def do_GET(self):
            if "/v1/images/jobs/" not in self.path:
                self._send(404, {"error": "not_found"})
                return
            state.polls += 1
            step = state.poll_script.pop(0) if state.poll_script else "processing"
            if step == 500:
                self._send(500, {"error": "upstream_failed"})
                return
            obj = {"id": "job-1", "status": step}
            if step == "succeeded":
                obj["result"] = [{"b64_json": PNG_B64, "url": "http://127.0.0.1/x.png",
                                  "expires_at": "2026-12-31T00:00:00Z"}]
            elif step == "failed:circuit":
                obj["status"] = "failed"
                obj["result"] = {"error": "relay circuit breaker status_429"}
            self._send(200, obj)

    return Handler


def run_script(base_url, out_dir, extra=()):
    env = dict(os.environ, REXAI_API_KEY="cr_test")
    cmd = [sys.executable, str(SCRIPT), "--model", "gpt-image-2", "--prompt", "t",
           "--base-url", base_url, "--output-dir", out_dir,
           "--interval", "0.1", "--retry-delay", "0.1", *extra]
    proc = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=60)
    return proc


def with_server(state, fn):
    server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(state))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        return fn(f"http://127.0.0.1:{server.server_address[1]}")
    finally:
        server.shutdown()


def test_transient_5xx_absorbed():
    state = State()
    state.poll_script = [500, 500, 500, "succeeded"]
    with tempfile.TemporaryDirectory() as tmp:
        def go(base):
            proc = run_script(base, tmp)
            assert proc.returncode == 0, proc.stderr
            summary = json.loads(proc.stdout)
            assert summary["status"] == "succeeded"
            assert os.path.exists(summary["results"][0]["file"]), "结果图应已落盘"
            assert "polling: status=succeeded" in proc.stderr, "应有实时进度输出"
        with_server(state, go)
    print("ok: 瞬时 5xx 被吸收，恢复后正常出图（不误杀、不挂死）")


def test_timeout_hard_bound():
    state = State()
    state.poll_script = ["processing"] * 10_000  # 永不进入终态
    with tempfile.TemporaryDirectory() as tmp:
        def go(base):
            t0 = time.monotonic()
            proc = run_script(base, tmp, ("--timeout", "1.5"))
            elapsed = time.monotonic() - t0
            assert proc.returncode == 1, proc.stderr
            assert elapsed < 15, f"必须在硬边界内退出，实际 {elapsed:.1f}s"
            assert "Timed out waiting for image job" in proc.stderr
            assert "job-1" in proc.stderr, "超时应报告 job id 供复查"
        with_server(state, go)
    print("ok: 永不终态时脚本在 --timeout 硬边界内必然退出（绝不挂死）")


def test_resubmit_bounded():
    state = State()
    state.poll_script = ["failed:circuit", "failed:circuit", "failed:circuit"]
    with tempfile.TemporaryDirectory() as tmp:
        def go(base):
            proc = run_script(base, tmp)
            assert proc.returncode == 1, proc.stderr
            assert state.submits == 3, f"重交必须封顶 3 次，实际 {state.submits}"
            assert "RexAI image job failed" in proc.stderr
        with_server(state, go)
    print("ok: 熔断重交有上限（最多 3 次提交），不会无限重交")


def test_4xx_dies_immediately():
    state = State()
    state.submit_status = 401
    with tempfile.TemporaryDirectory() as tmp:
        def go(base):
            proc = run_script(base, tmp)
            assert proc.returncode == 1, proc.stderr
            assert state.submits == 1, f"4xx 不应重试风暴，实际提交 {state.submits} 次"
            assert "HTTP 401" in proc.stderr
        with_server(state, go)
    print("ok: 4xx（401）立即失败，无重试风暴")


if __name__ == "__main__":
    test_transient_5xx_absorbed()
    test_timeout_hard_bound()
    test_resubmit_bounded()
    test_4xx_dies_immediately()
    print("rexai-image.py tests passed (no-hang guarantees hold)")
