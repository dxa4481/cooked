import json
import sqlite3
import re
from collections import Counter

DB_PATH = '/Users/couch/Documents/rsa/rsa_2026_exhibitors.db'
CLASSIFICATIONS_PATH = '/Users/couch/Documents/rsa/classifications/all_classifications.json'
DATA_JSON_PATH = '/Users/couch/Documents/rsa/docs/data.json'

with open(CLASSIFICATIONS_PATH) as f:
    classifications = json.load(f)

class_by_name = {}
for c in classifications:
    class_by_name[c['name']] = c

print(f"Loaded {len(classifications)} classifications ({len(class_by_name)} unique)")

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

cur.execute("PRAGMA table_info(exhibitors)")
cols = [row[1] for row in cur.fetchall()]
if 'tier' not in cols:
    cur.execute("ALTER TABLE exhibitors ADD COLUMN tier TEXT DEFAULT 'unclassified'")
if 'roast' not in cols:
    cur.execute("ALTER TABLE exhibitors ADD COLUMN roast TEXT DEFAULT ''")
if 'confidence' not in cols:
    cur.execute("ALTER TABLE exhibitors ADD COLUMN confidence TEXT DEFAULT 'low'")

cur.execute("""CREATE TABLE IF NOT EXISTS cursor_prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exhibitor_name TEXT NOT NULL UNIQUE,
    prompt TEXT NOT NULL
)""")
cur.execute("DELETE FROM cursor_prompts")

cur.execute("SELECT id, name FROM exhibitors")
db_exhibitors = cur.fetchall()

matched = 0
unmatched = []
for row in db_exhibitors:
    db_name = row['name']
    c = class_by_name.get(db_name)
    if c:
        cur.execute(
            "UPDATE exhibitors SET tier=?, roast=?, confidence=? WHERE id=?",
            (c['tier'], c['roast'], c['confidence'], row['id'])
        )
        if c.get('cursor_prompt'):
            cur.execute(
                "INSERT OR REPLACE INTO cursor_prompts (exhibitor_name, prompt) VALUES (?, ?)",
                (db_name, c['cursor_prompt'])
            )
        matched += 1
    else:
        unmatched.append(db_name)

conn.commit()
print(f"Updated {matched} exhibitors in SQLite")
if unmatched:
    print(f"Unmatched ({len(unmatched)}): {unmatched[:10]}...")

cur.execute("""
    SELECT e.name, e.booth, e.type, e.description, e.url, e.logo_url,
           e.tier, e.roast, e.confidence,
           cp.prompt as cursor_prompt
    FROM exhibitors e
    LEFT JOIN cursor_prompts cp ON e.name = cp.exhibitor_name
    ORDER BY e.name
""")
exhibitors = []
for row in cur.fetchall():
    exhibitors.append(dict(row))

cur.execute("SELECT exhibitor_name, category FROM exhibitor_categories")
cat_map = {}
for row in cur.fetchall():
    cat_map.setdefault(row['exhibitor_name'], []).append(row['category'])

for ex in exhibitors:
    ex['categories'] = cat_map.get(ex['name'], [])
    ex['description'] = re.sub(r'<[^>]+>', ' ', ex['description'] or '')
    ex['description'] = re.sub(r'&[a-z]+;', ' ', ex['description'])
    ex['description'] = re.sub(r'\s+', ' ', ex['description']).strip()
    if ex['description'] and len(ex['description']) > 500:
        ex['description'] = ex['description'][:500] + '...'

tier_counts = Counter(ex['tier'] for ex in exhibitors)
type_tier = {}
for ex in exhibitors:
    t = ex['type'] or 'Unknown'
    type_tier.setdefault(t, Counter())[ex['tier']] += 1

cat_tier = {}
for ex in exhibitors:
    for cat in ex['categories']:
        cat_tier.setdefault(cat, Counter())[ex['tier']] += 1

top_cats = sorted(cat_tier.items(), key=lambda x: sum(x[1].values()), reverse=True)[:25]

import os
os.makedirs(os.path.dirname(DATA_JSON_PATH), exist_ok=True)

data = {
    'meta': {
        'total': len(exhibitors),
        'tier_counts': dict(tier_counts),
        'cooked_pct': round((tier_counts.get('cooked', 0) + tier_counts.get('gpt_wrapper', 0)) / len(exhibitors) * 100, 1),
    },
    'sponsor_tiers': {
        t: dict(counts) for t, counts in sorted(type_tier.items(), key=lambda x: sum(x[1].values()), reverse=True)
    },
    'category_tiers': {
        cat: dict(counts) for cat, counts in top_cats
    },
    'exhibitors': exhibitors,
}

with open(DATA_JSON_PATH, 'w') as f:
    json.dump(data, f, ensure_ascii=False)
print(f"Exported data.json ({os.path.getsize(DATA_JSON_PATH) / 1024:.0f} KB)")

conn.close()

print(f"\n{'='*50}")
print(f"Enrichment Summary")
print(f"{'='*50}")
print(f"Total exhibitors: {len(exhibitors)}")
print(f"Tier breakdown:")
for tier, count in tier_counts.most_common():
    print(f"  {tier}: {count} ({count*100/len(exhibitors):.1f}%)")
print(f"\nCooked + GPT Wrapper: {data['meta']['cooked_pct']}%")

cur2 = sqlite3.connect(DB_PATH).cursor()
cur2.execute("SELECT COUNT(*) FROM cursor_prompts")
print(f"Cursor prompts: {cur2.fetchone()[0]}")
