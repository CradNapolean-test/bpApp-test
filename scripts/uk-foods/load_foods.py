"""Load the filtered UK foods into the Supabase `foods` table (needs migration 0074 applied).

Usage:  python scripts/uk-foods/load_foods.py <cofid.jsonl> <off_uk.jsonl> [--dry-run]

Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local (never printed).
Safe to re-run: UK generic rows are only added if their name isn't there yet, and Open Food Facts rows
skip any barcode already in the table. Existing rows (including ones members have logged) are never
changed or removed. Macros are stored per 1 gram, like the rest of the table.
"""
import json
import os
import sys

import requests


def load_env(path=".env.local"):
    env = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"')
    return env


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    cofid_path, off_path = args[0], args[1]
    env = load_env()
    base = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1"
    key = env["SUPABASE_SERVICE_ROLE_KEY"]
    H = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    probe = requests.get(f"{base}/foods?select=source,hidden,brand&limit=1", headers=H, timeout=60)
    if probe.status_code != 200:
        sys.exit("The foods table doesn't have the new columns yet. Run migration 0074 first.")

    def per_gram(v):
        return round(v / 100.0, 6)

    # ---- UK generics ---------------------------------------------------------------------------
    existing = set()
    offset = 0
    while True:
        r = requests.get(f"{base}/foods?select=name&source=eq.cofid&limit=1000&offset={offset}", headers=H, timeout=60)
        r.raise_for_status()
        page = r.json()
        existing.update(x["name"].lower() for x in page)
        if len(page) < 1000:
            break
        offset += 1000
    rows = []
    for line in open(cofid_path, encoding="utf-8"):
        d = json.loads(line)
        if d["name"].lower() in existing:
            continue
        rows.append({"name": d["name"], "portion": "1 gram", "protein": per_gram(d["protein"]), "carbs": per_gram(d["carbs"]), "fat": per_gram(d["fat"]), "source": "cofid"})
    print(f"UK generics to add: {len(rows):,} (already present: {len(existing):,})")
    if not dry:
        for i in range(0, len(rows), 500):
            r = requests.post(f"{base}/foods", headers={**H, "Prefer": "return=minimal"}, data=json.dumps(rows[i : i + 500]), timeout=120)
            if r.status_code >= 300:
                sys.exit(f"Generic insert failed: {r.status_code} {r.text[:300]}")

    # ---- Open Food Facts products --------------------------------------------------------------
    batch, sent, total = [], 0, 0
    for line in open(off_path, encoding="utf-8"):
        d = json.loads(line)
        total += 1
        batch.append({
            "name": d["name"], "portion": "1 gram", "protein": per_gram(d["protein"]), "carbs": per_gram(d["carbs"]),
            "fat": per_gram(d["fat"]), "barcode": d["code"], "brand": d.get("brand"), "source": "off",
        })
        if len(batch) == 1000:
            if not dry:
                r = requests.post(f"{base}/foods?on_conflict=barcode", headers={**H, "Prefer": "resolution=ignore-duplicates,return=minimal"}, data=json.dumps(batch), timeout=180)
                if r.status_code >= 300:
                    sys.exit(f"Product insert failed: {r.status_code} {r.text[:300]}")
            sent += len(batch)
            batch = []
            print(f"  products sent: {sent:,}", flush=True)
    if batch and not dry:
        r = requests.post(f"{base}/foods?on_conflict=barcode", headers={**H, "Prefer": "resolution=ignore-duplicates,return=minimal"}, data=json.dumps(batch), timeout=180)
        if r.status_code >= 300:
            sys.exit(f"Product insert failed: {r.status_code} {r.text[:300]}")
    sent += len(batch)
    print(f"Products {'checked' if dry else 'sent'}: {sent:,} of {total:,}" + (" (dry run, nothing written)" if dry else ""))


if __name__ == "__main__":
    main()
