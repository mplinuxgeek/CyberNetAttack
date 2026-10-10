#!/usr/bin/env python3
"""Tiny static web server for Cyber Net Attack. No-cache headers so edits always show after a deploy."""
import argparse
import functools
import http.server
import os
import socketserver


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def log_message(self, fmt, *args):  # quieter logs
        print("%s %s" % (self.address_string(), fmt % args), flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--bind", default="0.0.0.0")
    ap.add_argument("--dir", default=os.path.dirname(os.path.abspath(__file__)))
    a = ap.parse_args()
    handler = functools.partial(NoCacheHandler, directory=a.dir)
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer((a.bind, a.port), handler) as srv:
        print("serving %s on %s:%d" % (a.dir, a.bind, a.port), flush=True)
        srv.serve_forever()


if __name__ == "__main__":
    main()
