# -*- coding: utf-8 -*-
import json, os, random, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN_RE = re.compile(r"[a-z][a-z'-]*")
essays = json.load(open(os.path.join(ROOT,'public/data/essays.json'), encoding='utf-8'))['essays']
corpus = [set(TOKEN_RE.findall(e['text'].lower())) for e in essays]
allt = set().union(*corpus)

def covered(word, tokens):
    return word in tokens or (len(word) >= 5 and any(t.startswith(word) for t in tokens))

for book_id in ['gaokao_core', 'senior', 'junior', 'cet4']:
    p = os.path.join(ROOT, 'public/data/books/%s.json' % book_id)
    if not os.path.exists(p): continue
    words = [w['w'].lower() for w in json.load(open(p, encoding='utf-8'))['words']]
    hit = sum(1 for w in words if covered(w, allt))
    random.seed(3)
    bests = []
    for _ in range(150):
        pick = random.sample(words, 10)
        bests.append(max(sum(1 for w in pick if covered(w, t)) for t in corpus) / 10)
    bests.sort()
    print('%-12s 语料覆盖 %d/%d=%2.0f%%  选10词最好一篇中位数 %.0f%%'
          % (book_id, hit, len(words), hit*100.0/len(words), bests[75]*100))
