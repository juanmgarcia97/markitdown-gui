#!/usr/bin/env python3
"""
Mock Python worker that crashes shortly after starting.
Used for testing process crash handling.
"""

import sys
import time


def main():
    # Wait briefly then exit with non-zero code to simulate crash
    time.sleep(0.1)
    sys.exit(1)


if __name__ == "__main__":
    main()
