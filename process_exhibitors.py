import json
import csv
import sqlite3
import re

with open('/Users/couch/Documents/rsa/exhibitors_raw.json') as f:
    raw = json.load(f)

items = raw['sectionList'][0]['items']
print(f"Processing {len(items)} exhibitors...")

def clean_html(text):
    if not text:
        return ""
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'&[a-z]+;', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

NOISE_VALUES = {
    'Approved', 'Yes', 'No', 'All', 'North & South Expo', 'Moscone South Expo',
    'Moscone North Expo', 'ESE South Level 2', 'Exhibitor', 'Early Stage Expo & Next Stage',
    'Early Stage Expo', 'Next Stage',
}

BOOTH_PATTERN = re.compile(r'^[A-Z]+-\d+$|^[NS]-\d+$|^ESE-\d+$|^NXT-\d+$', re.IGNORECASE)

SPONSOR_KEYWORDS = {'Sponsor', 'Diamond', 'Platinum', 'Gold', 'Silver', 'Bronze', 'Pavilion'}

def is_category(val, exhibitor_type):
    val = val.strip()
    if not val:
        return False
    if val in NOISE_VALUES:
        return False
    if BOOTH_PATTERN.match(val):
        return False
    if val == exhibitor_type:
        return False
    if any(kw in val for kw in SPONSOR_KEYWORDS):
        return False
    return True

exhibitors = []
for item in items:
    booths = item.get('booths', [])
    booth_str = ', '.join(b.get('booth', '') for b in booths if b.get('booth'))
    if not booth_str:
        booth_str = item.get('booth-list', '')

    ex_type = item.get('type', '').strip()

    categories = []
    for av in item.get('attributevalues', []):
        val = av.get('value', '').strip()
        if is_category(val, ex_type):
            if val not in categories:
                categories.append(val)

    exhibitor = {
        'name': item.get('name', '').strip(),
        'booth': booth_str.strip(),
        'type': ex_type,
        'description': item.get('description', '').strip(),
        'url': item.get('url', '').strip(),
        'address': clean_html(item.get('customSideNavComponent', '')),
        'categories': categories,
        'logo_url': item.get('logo', ''),
        'email': item.get('email', ''),
        'phone': item.get('phone', ''),
        'linkedin': item.get('linkedinLink', ''),
        'twitter': item.get('twitterLink', ''),
        'youtube': item.get('youtubeLink', ''),
        'facebook': item.get('facebookLink', ''),
        'instagram': item.get('instagramLink', ''),
    }
    exhibitors.append(exhibitor)

exhibitors.sort(key=lambda x: x['name'].lower())

# --- JSON ---
with open('/Users/couch/Documents/rsa/rsa_2026_exhibitors.json', 'w') as f:
    json.dump(exhibitors, f, indent=2, ensure_ascii=False)
print(f"Saved JSON: rsa_2026_exhibitors.json")

# --- CSV ---
csv_fields = ['name', 'booth', 'type', 'description', 'url', 'address', 'categories',
              'email', 'phone', 'linkedin', 'twitter']
with open('/Users/couch/Documents/rsa/rsa_2026_exhibitors.csv', 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=csv_fields, extrasaction='ignore')
    writer.writeheader()
    for ex in exhibitors:
        row = dict(ex)
        row['categories'] = '; '.join(ex['categories'])
        writer.writerow(row)
print(f"Saved CSV: rsa_2026_exhibitors.csv")

# --- SQLite ---
db_path = '/Users/couch/Documents/rsa/rsa_2026_exhibitors.db'
conn = sqlite3.connect(db_path)
c = conn.cursor()
c.execute('DROP TABLE IF EXISTS exhibitors')
c.execute('''CREATE TABLE exhibitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    booth TEXT,
    type TEXT,
    description TEXT,
    url TEXT,
    address TEXT,
    email TEXT,
    phone TEXT,
    linkedin TEXT,
    twitter TEXT,
    youtube TEXT,
    facebook TEXT,
    instagram TEXT,
    logo_url TEXT
)''')
c.execute('DROP TABLE IF EXISTS exhibitor_categories')
c.execute('''CREATE TABLE exhibitor_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exhibitor_name TEXT NOT NULL,
    category TEXT NOT NULL
)''')

for ex in exhibitors:
    c.execute('''INSERT INTO exhibitors 
        (name, booth, type, description, url, address, email, phone, linkedin, twitter, youtube, facebook, instagram, logo_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
        (ex['name'], ex['booth'], ex['type'], ex['description'], ex['url'],
         ex['address'], ex['email'], ex['phone'], ex['linkedin'], ex['twitter'],
         ex['youtube'], ex['facebook'], ex['instagram'], ex['logo_url']))
    for cat in ex['categories']:
        c.execute('INSERT INTO exhibitor_categories (exhibitor_name, category) VALUES (?, ?)',
                  (ex['name'], cat))

conn.commit()

c.execute('SELECT COUNT(*) FROM exhibitors')
print(f"Saved SQLite: rsa_2026_exhibitors.db ({c.fetchone()[0]} exhibitors)")
c.execute('SELECT COUNT(*) FROM exhibitor_categories')
print(f"  ({c.fetchone()[0]} category assignments)")
c.execute('SELECT COUNT(DISTINCT category) FROM exhibitor_categories')
print(f"  ({c.fetchone()[0]} unique categories)")

conn.close()

# --- Summary ---
types = {}
for ex in exhibitors:
    t = ex['type'] or 'Unknown'
    types[t] = types.get(t, 0) + 1

print(f"\n{'='*60}")
print(f"RSA Conference 2026 - Exhibitor Data Summary")
print(f"{'='*60}")
print(f"Total exhibitors: {len(exhibitors)}")
print(f"\nBy sponsorship level / type:")
for t, count in sorted(types.items(), key=lambda x: -x[1]):
    print(f"  {t}: {count}")

all_cats = {}
for ex in exhibitors:
    for cat in ex['categories']:
        all_cats[cat] = all_cats.get(cat, 0) + 1

print(f"\nTop 20 product categories:")
for cat, count in sorted(all_cats.items(), key=lambda x: -x[1])[:20]:
    print(f"  {cat}: {count}")

print(f"\nSample exhibitors:")
for ex in exhibitors[:8]:
    print(f"  {ex['name']} | Booth: {ex['booth']} | {ex['type']}")
    desc = ex['description'][:100] + '...' if len(ex['description']) > 100 else ex['description']
    print(f"    {desc}")
    if ex['categories']:
        print(f"    Categories: {', '.join(ex['categories'][:5])}")
