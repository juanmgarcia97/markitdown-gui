#!/usr/bin/env python3
"""
Mock Python worker that never responds to any command.
Used for testing timeout behavior.
"""

import sys
import time


def main():
    # Just read stdin but never write anything back
    for line in sys.stdin:
        # Consume input but do nothing
        pass


if __name__ == "__main__":
    main()
