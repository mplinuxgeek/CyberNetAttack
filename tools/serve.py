#!/usr/bin/env python3
"""Tiny web server for Cyber Net Attack: static files (no-cache) plus a shared leaderboard at /api/scores.

GET  /api/scores            -> JSON list of the best Endless Survival runs
POST /api/scores {name, score, sectors, kills} -> adds a run (validated, top 50 kept in scores.json next to this file)
"""
import argparse
import functools
import http.server
import json
import os
import re
import socketserver
import threading
import time

HERE = os.path.dirname(os.path.abspath(__file__))
SCORES = os.path.join(HERE, "scores.json")
LOCK = threading.Lock()
KEEP = 50


def load_scores():
    try:
        with open(SCORES) as f:
            d = json.load(f)
        return d if isinstance(d, list) else []
    except Exception:
        return []


def clean_entry(d):
    """Validate one submitted run; returns None if it is junk."""
    try:
        score, sectors, kills = int(d.get("score")), int(d.get("sectors")), int(d.get("kills"))
    except Exception:
        return None
    if not (0 <= score <= 10_000_000 and 0 <= sectors <= 500 and 0 <= kills <= 100_000):
        return None
    name = re.sub(r"[^A-Za-z0-9 _.\-]", "", str(d.get("name", "")))[:14].strip() or "RESISTANCE"
    return {"name": name, "score": score, "sectors": sectors, "kills": kills, "t": int(time.time())}


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, fmt, *args):  # quieter logs
        print("%s %s" % (self.address_string(), fmt % args), flush=True)

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path.split("?")[0] == "/api/scores":
            with LOCK:
                return self._json(200, load_scores()[:20])
        return super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] != "/api/scores":
            return self._json(404, {"error": "not found"})
        try:
            n = int(self.headers.get("Content-Length", "0"))
            if n <= 0 or n > 2048:
                raise ValueError
            e = clean_entry(json.loads(self.rfile.read(n)))
        except Exception:
            e = None
        if not e:
            return self._json(400, {"error": "bad score"})
        with LOCK:
            s = load_scores() + [e]
            s.sort(key=lambda x: -x["score"])
            s = s[:KEEP]
            tmp = SCORES + ".tmp"
            with open(tmp, "w") as f:
                json.dump(s, f)
            os.replace(tmp, SCORES)
        self._json(200, s[:20])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--bind", default="0.0.0.0")
    ap.add_argument("--dir", default=HERE)
    a = ap.parse_args()
    handler = functools.partial(Handler, directory=a.dir)
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer((a.bind, a.port), handler) as srv:
        print("serving %s on %s:%d" % (a.dir, a.bind, a.port), flush=True)
        srv.serve_forever()


if __name__ == "__main__":
    main()
