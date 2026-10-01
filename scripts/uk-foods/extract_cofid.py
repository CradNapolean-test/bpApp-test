"""Extract UK generic foods from McCance and Widdowson's Composition of Foods Integrated Dataset 2021.

Usage:  python scripts/uk-foods/extract_cofid.py <cofid.xlsx> <out.jsonl>

Source (Open Government Licence): https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid
Reads the "1.3 Proximates" sheet (per 100 g of food). "Tr" (trace) counts as 0; a food is skipped if
protein, fat or carbohydrate is missing, or the figures are impossible.
"""
import json
import re
import sys

import openpyxl


def num(v):
    if v is None:
        return None
    s = str(v).strip()
    if s.lower() == "tr":
        return 0.0
    s = s.strip("()[]")
    try:
        return float(s)
    except ValueError:
        return None


def main(src, dst):
    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
    ws = wb["1.3 Proximates"]
    rows = ws.iter_rows(values_only=True)
    header = next(rows)
    ix = {h: i for i, h in enumerate(header) if h}
    p_i, f_i, c_i, k_i = ix["Protein (g)"], ix["Fat (g)"], ix["Carbohydrate (g)"], ix["Energy (kcal) (kcal)"]
    n_i = ix["Food Name"]
    seen = set()
    kept = skipped = 0
    with open(dst, "w", encoding="utf-8") as out:
        for row in rows:
            name = row[n_i]
            if not name or not row[0]:
                continue  # the two header-code rows and blanks
            name = re.sub(r"\s+", " ", str(name)).strip()
            p, f, c, k = num(row[p_i]), num(row[f_i]), num(row[c_i]), num(row[k_i])
            if None in (p, f, c) or min(p, f, c) < 0 or p + f + c > 100.5:
                skipped += 1
                continue
            key = name.lower()
            if key in seen:
                continue
            seen.add(key)
            out.write(json.dumps({"name": name[:140], "kcal": k, "protein": p, "carbs": c, "fat": f}, ensure_ascii=False) + "\n")
            kept += 1
    print(f"kept {kept:,}, skipped {skipped:,} (missing or impossible values)")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
