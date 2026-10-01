"""Remove already-loaded Open Food Facts rows that the stricter name rules would now reject.

Usage:  python scripts/uk-foods/cleanup_off.py <off_uk.jsonl> [--dry-run]

Only deletes rows with source = 'off' (never scans or seed foods), and skips any a member has logged.
"""
import json
import sys

import requests

sys.path.insert(0, __file__.rsplit("/", 1)[0].rsplit("\\", 1)[0])
from filter_off import is_junk_name  # noqa: E402


def load_env(path=".env.local"):
    env = {}
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"')
    return env


def main():
    dry = "--dry-run" in sys.argv
    path = [a for a in sys.argv[1:] if not a.startswith("--")][0]
    env = load_env()
    base = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1"
    key = env["SUPABASE_SERVICE_ROLE_KEY"]
    H = {"apikey": key, "Authorization": f"Bearer {key}", "Prefer": "return=minimal"}
    bad = []
    for line in open(path, encoding="utf-8"):
        d = json.loads(line)
        if is_junk_name(d["name"], d["group"]):
            bad.append(d["code"])
    print(f"rows to remove: {len(bad):,}")
    if dry:
        return
    removed = 0
    for i in range(0, len(bad), 100):
        chunk = bad[i : i + 100]
        r = requests.delete(f"{base}/foods?source=eq.off&barcode=in.({','.join(chunk)})", headers=H, timeout=120)
        if r.status_code >= 300:
            print("skipped a chunk:", r.status_code, r.text[:160])
            continue
        removed += len(chunk)
    print(f"removed (or already gone): {removed:,}")


if __name__ == "__main__":
    main()
