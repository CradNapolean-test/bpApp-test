"""Fill in the new `fibre` column on already-loaded foods (needs migration 0077 applied).

Usage:  python scripts/uk-foods/backfill_fibre.py <cofid.jsonl> <off_uk.jsonl> [--dry-run]

Matches UK generic foods by name and Open Food Facts products by barcode, and only sets `fibre`
(grams per gram of food). Foods with no fibre figure are left as unknown (null). Nothing else is
changed, and rows a member has logged are untouched apart from gaining the fibre value.
"""
import json
import sys

import requests


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
    cofid_path, off_path = [a for a in sys.argv[1:] if not a.startswith("--")][:2]
    env = load_env()
    base = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1"
    key = env["SUPABASE_SERVICE_ROLE_KEY"]
    H = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    probe = requests.get(f"{base}/foods?select=fibre&limit=1", headers=H, timeout=60)
    if probe.status_code != 200:
        sys.exit("The foods table doesn't have a fibre column yet. Run migration 0077 first.")

    def per_gram(v):
        return round(v / 100.0, 6)

    # ---- UK generics: look up ids by name, then merge fibre in by id --------------------------
    ids = {}
    offset = 0
    while True:
        r = requests.get(f"{base}/foods?select=id,name,protein,carbs,fat&source=eq.cofid&limit=1000&offset={offset}", headers=H, timeout=60)
        r.raise_for_status()
        page = r.json()
        for x in page:
            ids[x["name"].lower()] = x
        if len(page) < 1000:
            break
        offset += 1000
    rows = []
    for line in open(cofid_path, encoding="utf-8"):
        d = json.loads(line)
        x = ids.get(d["name"].lower())
        if x and d.get("fibre") is not None:
            rows.append({"id": x["id"], "name": x["name"], "protein": x["protein"], "carbs": x["carbs"], "fat": x["fat"], "fibre": per_gram(d["fibre"])})
    print(f"UK generics getting fibre: {len(rows):,}")
    if not dry:
        for i in range(0, len(rows), 500):
            r = requests.post(f"{base}/foods?on_conflict=id", headers={**H, "Prefer": "resolution=merge-duplicates,return=minimal"}, data=json.dumps(rows[i : i + 500]), timeout=120)
            if r.status_code >= 300:
                sys.exit(f"Generic update failed: {r.status_code} {r.text[:300]}")

    # ---- Open Food Facts products: merge by barcode ----------------------------------------------
    batch, sent = [], 0
    for line in open(off_path, encoding="utf-8"):
        d = json.loads(line)
        if d.get("fibre") is None:
            continue
        batch.append({"name": d["name"], "protein": per_gram(d["protein"]), "carbs": per_gram(d["carbs"]), "fat": per_gram(d["fat"]), "barcode": d["code"], "fibre": per_gram(d["fibre"])})
        if len(batch) == 1000:
            if not dry:
                r = requests.post(f"{base}/foods?on_conflict=barcode", headers={**H, "Prefer": "resolution=merge-duplicates,return=minimal"}, data=json.dumps(batch), timeout=180)
                if r.status_code >= 300:
                    sys.exit(f"Product update failed: {r.status_code} {r.text[:300]}")
            sent += len(batch)
            batch = []
            print(f"  products updated: {sent:,}", flush=True)
    if batch and not dry:
        r = requests.post(f"{base}/foods?on_conflict=barcode", headers={**H, "Prefer": "resolution=merge-duplicates,return=minimal"}, data=json.dumps(batch), timeout=180)
        if r.status_code >= 300:
            sys.exit(f"Product update failed: {r.status_code} {r.text[:300]}")
    sent += len(batch)
    print(f"Products with fibre: {sent:,}" + (" (dry run, nothing written)" if dry else ""))


if __name__ == "__main__":
    main()
