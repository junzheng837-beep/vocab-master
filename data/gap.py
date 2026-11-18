# -*- coding: utf-8 -*-
import json, os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN_RE = re.compile(r"[a-z][a-z'-]*")
essays = json.load(open(os.path.join(ROOT,'public/data/essays.json'), encoding='utf-8'))['essays']
allt = set()
for e in essays: allt.update(TOKEN_RE.findall(e['text'].lower()))
def covered(w):
    return w in allt or (len(w) >= 5 and any(t.startswith(w) for t in allt))
words = [w['w'].lower() for w in json.load(open(os.path.join(ROOT,'public/data/books/gaokao_core.json'), encoding='utf-8'))['words']]
miss = [w for w in words if not covered(w)]
print('高频 800 里没覆盖的:', len(miss))
for i in range(0, min(200, len(miss)), 20):
    print('  ' + ', '.join(miss[i:i+20]))
