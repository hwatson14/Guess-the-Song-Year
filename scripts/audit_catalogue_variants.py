#!/usr/bin/env python3
"""Run the status-aware audit against the exact JavaScript selection policy."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

if __name__ == '__main__':
    sys.exit(subprocess.call(['node', str(ROOT / 'scripts' / 'audit_catalogue_runtime.mjs')], cwd=ROOT))
