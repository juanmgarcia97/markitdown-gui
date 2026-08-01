#!/usr/bin/env python3
"""
MarkItDown GUI - Python Worker

Reads JSON commands from stdin (one per line) and writes JSON responses to stdout.
Handles: convert, health, shutdown.

Protocol:
  Input:  {"type": "convert", "id": "uuid", "filePath": "/path/to/file"}
          {"type": "health", "id": "uuid"}
          {"type": "shutdown", "id": "uuid"}

  Output: {"type": "result", "id": "uuid", "success": true, "markdown": "..."}
          {"type": "result", "id": "uuid", "success": false, "error": "..."}
          {"type": "health", "id": "uuid", "status": "ok", "version": "0.1.0"}
"""

import json
import os
import sys

# Redirect stderr to devnull to prevent contaminating the stdout JSON protocol
sys.stderr = open(os.devnull, "w")

VERSION = "0.1.0"


def send_response(response):
    """Write a JSON response to stdout and flush immediately."""
    sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def send_error(request_id, error_message):
    """Send an error result response."""
    send_response({
        "type": "result",
        "id": request_id,
        "success": False,
        "error": error_message,
    })


def handle_convert(request_id, file_path):
    """Handle a convert command by running markitdown on the file."""
    try:
        from markitdown import MarkItDown

        md = MarkItDown()
        result = md.convert(file_path)
        send_response({
            "type": "result",
            "id": request_id,
            "success": True,
            "markdown": result.text_content,
        })
    except ImportError as e:
        send_error(request_id, f"Failed to import markitdown: {e}")
    except FileNotFoundError:
        send_error(request_id, f"File not found: {file_path}")
    except PermissionError:
        send_error(request_id, f"Permission denied: {file_path}")
    except Exception as e:
        send_error(request_id, f"Conversion failed: {type(e).__name__}: {e}")


def handle_health(request_id):
    """Handle a health check command."""
    try:
        import markitdown  # noqa: F401

        version = getattr(markitdown, "__version__", VERSION)
        send_response({
            "type": "health",
            "id": request_id,
            "status": "ok",
            "version": version,
        })
    except ImportError as e:
        send_response({
            "type": "health",
            "id": request_id,
            "status": "error",
            "version": VERSION,
            "error": f"markitdown not available: {e}",
        })


def handle_shutdown(request_id):
    """Handle a shutdown command - acknowledge and exit cleanly."""
    send_response({
        "type": "result",
        "id": request_id,
        "success": True,
    })
    sys.exit(0)


def process_message(message):
    """Parse and route a single JSON message to the appropriate handler."""
    request_id = message.get("id", "unknown")
    msg_type = message.get("type")

    if msg_type == "convert":
        file_path = message.get("filePath")
        if not file_path:
            send_error(request_id, "Missing 'filePath' field in convert command")
            return
        handle_convert(request_id, file_path)
    elif msg_type == "health":
        handle_health(request_id)
    elif msg_type == "shutdown":
        handle_shutdown(request_id)
    else:
        send_error(request_id, f"Unknown command type: {msg_type}")


def main():
    """Main loop - read stdin line by line and process JSON commands."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            message = json.loads(line)
        except json.JSONDecodeError as e:
            # Handle malformed JSON - use "unknown" as id since we can't parse it
            send_error("unknown", f"Malformed JSON input: {e}")
            continue

        try:
            process_message(message)
        except SystemExit:
            # Allow sys.exit() from shutdown handler to propagate
            raise
        except Exception as e:
            # Catch-all for unexpected errors - never crash the worker
            request_id = message.get("id", "unknown") if isinstance(message, dict) else "unknown"
            send_error(request_id, f"Unexpected error: {type(e).__name__}: {e}")


if __name__ == "__main__":
    main()
