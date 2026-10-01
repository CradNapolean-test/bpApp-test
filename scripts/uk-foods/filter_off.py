"""Filter the Open Food Facts CSV export down to UK supermarket + popular UK brand products.

Usage:  python scripts/uk-foods/filter_off.py <off.csv.gz> <out.jsonl>

Keeps a product only if it is sold in the UK, belongs to one of the retailers / brands below, and has
a name plus complete, plausible per-100g calories / protein / carbs / fat. Prints a per-brand summary
and how many products each quality rule rejected. Output is one JSON object per line.
"""
import csv
import gzip
import json
import re
import sys
from collections import Counter

csv.field_size_limit(sys.maxsize)

# label -> regex tested against "<brands> <brands_tags>" (lower-cased).
RETAILERS = {
    "Sainsbury's": r"sainsbury",
    "Tesco": r"\btesco",
    "Aldi": r"\baldi\b|specially-selected|specially selected|nature-s-pride|the-fishmonger|mamia|harvest-morn|brooklea|cowbelle|everyday-essentials",
    "Lidl": r"\blidl\b|milbona|alesto|chef-select|\bw5\b",
    "M&S": r"marks-?(and-|&-)?spencer|\bm&s\b|\bm-s\b|\bm-and-s\b|m-s-food|marks-and-spencer",
    "Morrisons": r"morrison",
    "Asda": r"\basda\b|extra-special|just-essentials|chosen-by-you",
    "Waitrose": r"waitrose|duchy",
    "Co-op": r"\bco-?op\b|co-operative",
    "Iceland": r"\biceland\b",
}

# Popular national brands UK members actually log.
BRANDS = [
    "weetabix", "warburtons", "hovis", "kingsmill", "kellogg", "quorn", "alpro", "oatly", "yeo valley", "arla",
    "danone", "activia", "onken", "muller", "müller", "flora", "lurpak", "anchor", "cathedral city", "philadelphia",
    "babybel", "dairylea", "mcvitie", "cadbury", "nestle", "nestlé", "mars", "snickers", "twix", "walkers", "doritos",
    "pringles", "kit kat", "heinz", "branston", "hellmann", "bisto", "birds eye", "mccain", "young's", "goodfella",
    "dolmio", "uncle ben", "ben's original", "napolina", "tilda", "batchelors", "pot noodle", "innocent",
    "tropicana", "lucozade", "ribena", "coca-cola", "pepsi", "red bull", "monster", "myprotein", "my protein",
    "optimum nutrition", "phd", "grenade", "barebells", "protein works", "huel", "nakd", "graze", "nature valley",
    "belvita", "jacob's", "ryvita", "tyrrell", "burts", "mission", "old el paso", "new covent garden", "baxters",
    "ambrosia", "bird's", "carte d'or", "magnum", "ben & jerry", "häagen", "haagen", "sharwood", "patak", "blue dragon",
    "kallo", "oreo", "maryland", "fox's", "mcvitie's", "go ahead", "nairn", "quaker", "ready brek", "shreddies",
    "special k", "dorset cereals", "jordans", "alpen", "porridge", "linda mccartney", "richmond", "wall's", "bernard matthews",
    "vitalite", "bertolli", "clover", "country life", "pukka", "pilgrims choice", "garlic",
]
BRAND_RE = re.compile("|".join(re.escape(b) for b in BRANDS), re.I)
RETAIL_RE = {k: re.compile(v, re.I) for k, v in RETAILERS.items()}


# What goes in the `brand` column (searched along with the name) for the retailer labels.
BRAND_LONG = {"M&S": "Marks & Spencer", "Co-op": "Co-operative Co-op"}
# Names written in non-Latin scripts (Cyrillic, Greek, CJK...) are dropped; accented Latin is kept.
NON_LATIN = re.compile(r"[^\u0000-\u024F\u2010-\u2027\u20AC]")


# Words that mark a product page written for another European market (some carry a UK tag as well).
FOREIGN = re.compile(r"(et|avec|sans|poulet|oeuf|oeufs|œuf|mit|und|oder|mehl|pollo|riz|épices|aux)", re.I)


def is_junk_name(name, label):
    """True for names that are just the brand ("Tesco", "Lidl bbj") or are clearly another language."""
    if FOREIGN.search(name):
        return True
    rest = re.sub(re.escape(label), "", name, flags=re.I) if label else name
    return len(re.sub(r"[^A-Za-z]", "", rest)) < 3 and label not in (None, "", "brand")


def num(x):
    if x is None or x == "":
        return None
    try:
        return float(x)
    except ValueError:
        return None


def clean(s):
    return re.sub(r"\s+", " ", (s or "").strip())


def alnum(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


def main(src, dst):
    stats = Counter()
    rejected = Counter()
    seen = set()
    seen_products = set()
    out = open(dst, "w", encoding="utf-8")
    with gzip.open(src, "rt", encoding="utf-8", errors="replace", newline="") as f:
        reader = csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE)
        header = next(reader)
        ix = {h: i for i, h in enumerate(header)}
        need = ["code", "product_name", "brands", "brands_tags", "countries_tags", "energy-kcal_100g", "proteins_100g", "carbohydrates_100g", "fat_100g"]
        col = [ix[n] for n in need]
        top = max(col)
        for n, row in enumerate(reader):
            if len(row) <= top:
                continue
            code, name, brands, btags, ctags, kcal, prot, carb, fat = (row[i] for i in col)
            if "en:united-kingdom" not in ctags:
                continue
            hay = f"{brands} {btags}".lower()
            label = next((k for k, rx in RETAIL_RE.items() if rx.search(hay)), None)
            if label is None and BRAND_RE.search(hay):
                label = "brand"
            if label is None:
                continue
            stats["uk_matching"] += 1
            name = clean(name)
            if NON_LATIN.search(name):
                rejected["non-Latin name"] += 1
                continue
            if len(name) < 2:
                rejected["no name"] += 1
                continue
            if is_junk_name(name, label):
                rejected["brand-only or foreign-language name"] += 1
                continue
            if not re.fullmatch(r"\d{8,14}", code or ""):
                rejected["bad barcode"] += 1
                continue
            if code in seen:
                rejected["duplicate barcode"] += 1
                continue
            k, p, c, fa = (None if v is None else round(v, 1) for v in (num(kcal), num(prot), num(carb), num(fat)))
            if None in (k, p, c, fa):
                rejected["incomplete macros"] += 1
                continue
            if min(k, p, c, fa) < 0 or p + c + fa > 100.5 or k > 900:
                rejected["impossible values"] += 1
                continue
            calc = 4 * p + 4 * c + 9 * fa
            if abs(k - calc) > max(30, 0.25 * k):
                rejected["calories don't match macros"] += 1
                continue
            first_brand = clean(brands.split(",")[0]) if brands else ""
            display_brand = label if label not in ("brand",) else first_brand
            if display_brand and alnum(display_brand) not in alnum(name):
                name = f"{display_brand} {name}"
            dupe_key = (name.lower(), p, c, fa)
            if dupe_key in seen_products:
                rejected["same name and macros as another product"] += 1
                continue
            seen_products.add(dupe_key)
            seen.add(code)
            stats[label] += 1
            out.write(json.dumps({"code": code, "name": name[:140], "brand": (BRAND_LONG.get(display_brand) or display_brand)[:60] or None, "kcal": k, "protein": p, "carbs": c, "fat": fa, "group": label}, ensure_ascii=False) + "\n")
            if n % 500000 == 0:
                print(f"  ...{n:,} rows read, {sum(v for kk, v in stats.items() if kk not in ('uk_matching',)):,} kept", flush=True)
    out.close()
    print("\nKept by retailer / brand group:")
    for k, v in stats.most_common():
        print(f"  {k}: {v:,}")
    print("\nRejected:")
    for k, v in rejected.most_common():
        print(f"  {k}: {v:,}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
