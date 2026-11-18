# -*- coding: utf-8 -*-
"""模拟：随机选 N 个高中词，看最匹配的那篇范文能覆盖几个。"""
import json, os, random, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN_RE = re.compile(r"[a-z][a-z'-]*")

essays = json.load(open(os.path.join(ROOT, 'public/data/essays.json'), encoding='utf-8'))['essays']
book = json.load(open(os.path.join(ROOT, 'public/data/books/senior.json'), encoding='utf-8'))
vocab = [w['w'].lower() for w in book['words']]

corpus = []
for e in essays:
    corpus.append(set(TOKEN_RE.findall(e['text'].lower())))

def covered(word, tokens):
    return word in tokens or (len(word) >= 5 and any(t.startswith(word) for t in tokens))

random.seed(7)
for n in (5, 10, 20):
    ratios = []
    for _ in range(200):
        pick = random.sample(vocab, n)
        best = 0
        for tokens in corpus:
            c = sum(1 for w in pick if covered(w, tokens))
            best = max(best, c)
        ratios.append(best / n)
    ratios.sort()
    print('选 %2d 个词：最好一篇覆盖 中位数 %.0f%%，最好情况 %.0f%%，最差 %.0f%%'
          % (n, ratios[100] * 100, ratios[-1] * 100, ratios[0] * 100))
