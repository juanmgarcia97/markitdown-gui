#!/usr/bin/env python3
"""
Mock Python worker for testing PythonBridge.
Simulates the worker.py protocol:
- Responds to 'health' with status 'ok'
- Responds to 'convert' with success (or failure for FAIL_FILE paths)
- Responds to 'shutdown' and exits
- For SLOW_FILE paths, delays response indefinitely (for timeout testing)
"""

import json
import sys
import time


def send_response(response):
    sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            send_response({"type": "result", "id": "unknown", "success": False, "error": "Invalid JSON"})
            continue

        msg_type = msg.get("type")
        msg_id = msg.get("id", "unknown")

        if msg_type == "health":
            send_response({
                "type": "health",
                "id": msg_id,
                "status": "ok",
                "version": "0.1.0-mock",
            })
        elif msg_type == "convert":
            file_path = msg.get("filePath", "")

            if "SLOW_FILE" in file_path:
                # Never respond - simulate stuck conversion
                while True:
                    time.sleep(60)
            elif "FAIL_FILE" in file_path:
                send_response({
                    "type": "result",
                    "id": msg_id,
                    "success": False,
                    "error": f"Conversion failed for: {file_path}",
                })
            else:
                send_response({
                    "type": "result",
                    "id": msg_id,
                    "success": True,
                    "markdown": f"# Converted content from {file_path}\n\nThis is mock markdown.",
                })
        elif msg_type == "shutdown":
            send_response({
                "type": "result",
                "id": msg_id,
                "success": True,
            })
            sys.exit(0)
        else:
            send_response({
                "type": "result",
                "id": msg_id,
                "success": False,
                "error": f"Unknown type: {msg_type}",
            })


if __name__ == "__main__":
    main()
