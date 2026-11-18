# -*- coding: utf-8 -*-
"""
把 data/essays/part*.py 里的范文汇总成 public/data/essays.json，
顺便统计这些范文覆盖了多少高中词汇，方便判断匹配效果。
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + '/essays')

from part1 import ESSAYS_1  # noqa: E402
from part2 import ESSAYS_2  # noqa: E402
from part3 import ESSAYS_3  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'data', 'essays.json')

TOKEN_RE = re.compile(r"[a-z][a-z'-]*")


def main():
    rows = ESSAYS_1 + ESSAYS_2 + ESSAYS_3
    essays = []
    for i, (topic, title, text) in enumerate(rows, start=1):
        words = text.split()
        essays.append(
            {
                'id': 'e%02d' % i,
                'topic': topic,
                'title': title,
                'words': len(words),
                'text': text,
            }
        )

    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump({'essays': essays}, f, ensure_ascii=False, separators=(',', ':'))

    size = os.path.getsize(OUT)
    avg = sum(e['words'] for e in essays) / len(essays)
    print('essays: %d 篇, 平均 %.0f 词, %.1f KB' % (len(essays), avg, size / 1024))

    # 覆盖率：高中词表里有多少词在这批范文中出现过
    book_path = os.path.join(ROOT, 'public', 'data', 'books', 'senior.json')
    with open(book_path, encoding='utf-8') as f:
        book = json.load(f)

    corpus = set()
    for e in essays:
        corpus.update(TOKEN_RE.findall(e['text'].lower()))

    hit = 0
    for w in book['words']:
        key = w['w'].lower()
        if key in corpus or (len(key) >= 5 and any(t.startswith(key) for t in corpus)):
            hit += 1
    print('高中词汇覆盖率: %d / %d = %.1f%%'
          % (hit, len(book['words']), hit * 100.0 / len(book['words'])))

    # 抽几个词看看能不能被匹配上
    sample = [w['w'] for w in book['words'][:2000:200]]
    print('抽样:', ', '.join(sample))


if __name__ == '__main__':
    main()
