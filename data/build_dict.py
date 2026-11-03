# -*- coding: utf-8 -*-
"""
词库构建脚本
输入: data/raw/ 下的 ECDICT csv、wordroot.txt、kajweb 词书 zip
输出: public/data/books/*.json, public/data/dict/*.json, public/data/roots.json
"""
import csv, json, os, re, zipfile, sys, io
from collections import OrderedDict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from root_cn import ROOT_CN
from writing_words import WRITING_GROUPS

csv.field_size_limit(10**9)
RAW = os.path.join(os.path.dirname(__file__), 'raw')
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
os.makedirs(os.path.join(OUT, 'books'), exist_ok=True)
os.makedirs(os.path.join(OUT, 'letters'), exist_ok=True)

POS_RE = re.compile(r'^([a-z]+\.(?:\s*&\s*[a-z]+\.)?)\s*(.*)$')
CLEAN_RE = re.compile(r'\s+')
ROOT_CLASS_CN = {
    'root': '词根',
    'prefix': '前缀',
    'suffix': '后缀',
    'noun-forming suffix': '名词后缀',
    'adjective-forming suffix': '形容词后缀',
    'verb-forming suffix': '动词后缀',
    'adverb-forming suffix': '副词后缀',
}

def clean(s):
    if not s:
        return ''
    s = s.replace('\u3000', ' ').replace('\xa0', ' ')
    return CLEAN_RE.sub(' ', s).strip()


def fix_phonetic(s):
    """ECDICT / 词书里的音标写法不统一（ә / : / '，还有「ˈæktjʊəlɪ; -tʃʊ-」这种变体注记），
    统一换成标准 IPA 符号，并去掉分号后面的变体说明"""
    if not s:
        return ''
    out = s.split(';')[0].split('；')[0].strip()
    out = out.replace('ә', 'ə').replace(':', 'ː').replace("'", 'ˈ')
    if out.startswith(','):
        out = 'ˌ' + out[1:]
    return out

def dedupe_key(s):
    """用于判断两条例句是否实质相同（忽略标点与大小写）"""
    return re.sub(r'[^a-z ]', '', s.lower()).strip()

def parse_translation(raw):
    """把 ECDICT 的 translation 字段拆成 [[pos, cn], ...]"""
    if not raw:
        return []
    # ECDICT 里部分释义用字面量 '\n' 分隔，需要还原成真换行
    raw = raw.replace('\\n', '\n')
    out = []
    for line in raw.split('\n'):
        line = clean(line)
        if not line:
            continue
        # 丢掉网络释义、专业词典标记等噪声（如 [网络] [计] [经]）
        if line.startswith('[网络]') or re.match(r'^\[[^\]]{1,4}\]', line):
            continue
        m = POS_RE.match(line)
        if m and m.group(2):
            pos = m.group(1).replace(' ', '')
            cn = m.group(2).strip()
            if cn:
                out.append([pos, cn])
        else:
            out.append(['', line])
    # 合并同词性、去重
    seen = set()
    merged = []
    for pos, cn in out:
        k = pos + '|' + cn
        if k in seen:
            continue
        seen.add(k)
        merged.append([pos, cn])
    return merged[:6]

# ---------------------------------------------------------------- 词根数据
def load_roots():
    path = os.path.join(RAW, 'wordroot.txt')
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    word_to_roots = {}
    root_entries = []
    for key, v in data.items():
        meaning = clean(v.get('meaning', ''))
        cls_raw = clean(v.get('class', ''))
        if not meaning:
            continue
        # 词根名去掉用于消歧的尾部数字，如 pro-2 -> pro-
        root_name = re.sub(r'\d+$', '', key)
        raw_examples = []
        for ex in v.get('example', []) or []:
            w = clean(ex)
            if w and ' ' not in w:
                raw_examples.append(w)
        cn = ROOT_CN.get(root_name.lower()) or ROOT_CN.get(key.lower())
        if cn is None:
            cn = ROOT_CN.get(root_name.lower().rstrip('-')) or ROOT_CN.get(root_name.lower() + '-')
        if cn is None:
            # 合并条目如 "-able, -ible, -ble"，逐个尝试
            for part in re.split(r'[,\s]+', root_name):
                part = part.strip().lower()
                if not part:
                    continue
                hit = ROOT_CN.get(part) or ROOT_CN.get(part.rstrip('-')) or ROOT_CN.get(part + '-')
                if hit:
                    cn = hit
                    break
        item = {
            'root': root_name,
            'meaning': cn or meaning,
            'meaning_en': meaning,
            'class': ROOT_CLASS_CN.get(cls_raw, cls_raw or '词根'),
            'cat': ('前缀' if 'prefix' in cls_raw else
                    '后缀' if 'suffix' in cls_raw else
                    '词根'),
            'origin': clean(v.get('origin', '')),
            'examples': raw_examples,
        }
        root_entries.append(item)
        for w in raw_examples:
            word_to_roots.setdefault(w.lower(), []).append(item)
    return word_to_roots, root_entries

# ---------------------------------------------------------------- kajweb 词书
def load_kajweb():
    """合并所有 kajweb 词书，word -> 富文本信息"""
    merged = {}
    for fn in sorted(os.listdir(RAW)):
        if not fn.endswith('.zip'):
            continue
        with zipfile.ZipFile(os.path.join(RAW, fn)) as z:
            inner = z.namelist()[0]
            text = z.read(inner).decode('utf-8', 'ignore')
        for line in text.split('\n'):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except Exception:
                continue
            try:
                head = obj['headWord']
                c = obj['content']['word']['content']
            except Exception:
                continue
            key = head.strip().lower()
            if not key:
                continue
            rec = merged.setdefault(key, {'us': '', 'uk': '', 's': [], 'p': [], 'syn': [], '_sk': set(), '_pk': set(), '_yk': set()})
            us = clean(c.get('usphone') or '')
            uk = clean(c.get('ukphone') or '')
            if us and not rec['us']:
                rec['us'] = us
            if uk and not rec['uk']:
                rec['uk'] = uk
            # 例句（按英文去重，忽略标点差异）
            sents = (((c.get('sentence') or {}).get('sentences')) or [])
            for s in sents:
                en = clean(re.sub(r'<[^>]+>', '', s.get('sContent') or ''))
                cn = clean(s.get('sCn') or '')
                if en and cn and len(en) < 160:
                    k = dedupe_key(en)
                    if k and k not in rec['_sk']:
                        rec['_sk'].add(k)
                        rec['s'].append([en, cn])
            # 短语
            phrases = (((c.get('phrase') or {}).get('phrases')) or [])
            for ph in phrases:
                en = clean(ph.get('pContent') or '')
                cn = clean(ph.get('pCn') or '')
                if en and cn and len(en) < 40:
                    k = en.lower()
                    if k not in rec['_pk']:
                        rec['_pk'].add(k)
                        rec['p'].append([en, cn])
            # 同义词
            synos = (((c.get('syno') or {}).get('synos')) or [])
            for sy in synos:
                tran = clean(sy.get('tran') or '')
                hwds = [clean(h.get('w') or '') for h in (sy.get('hwds') or [])]
                hwds = [h for h in hwds if h]
                if tran and hwds:
                    k = tran
                    if k not in rec['_yk']:
                        rec['_yk'].add(k)
                        rec['syn'].append([tran, hwds[:4]])
    # 截断，控制体积
    for rec in merged.values():
        rec['s'] = rec['s'][:3]
        rec['p'] = rec['p'][:4]
        rec['syn'] = rec['syn'][:2]
        for k in ('_sk', '_pk', '_yk'):
            rec.pop(k, None)
    return merged

# ---------------------------------------------------------------- 生活日常词表
DAILY = {
    '餐饮饮食': """breakfast lunch dinner brunch snack meal menu order dish plate bowl fork knife spoon chopsticks
    waiter waitress restaurant cafe bakery bar bill tip recipe ingredient flour sugar salt pepper sauce vinegar oil butter
    cheese milk yogurt cream egg bread toast sandwich hamburger pizza pasta noodle rice soup salad steak chicken beef pork
    lamb fish shrimp crab vegetable fruit apple banana orange grape strawberry peach pear lemon watermelon tomato potato
    carrot onion garlic ginger cabbage broccoli mushroom bean corn wheat delicious tasty spicy sour sweet bitter salty
    fresh raw fried boiled baked roast grill steam hungry thirsty full diet vegetarian dessert cake cookie chocolate ice
    juice coffee tea beer wine cocktail water bottle cup glass kettle fridge oven microwave stove pot pan""",
    '出行交通': """airport airline flight ticket passport visa luggage baggage suitcase backpack boarding gate terminal runway
    takeoff landing delay cancel schedule departure arrival destination transfer transit subway metro bus taxi cab
    station platform train railway highway road street avenue bridge tunnel intersection crossing traffic jam parking
    driver passenger license vehicle car truck van bicycle motorcycle scooter wheel tire engine brake seat belt helmet
    gasoline fuel map route direction north south east west left right straight turn near far distance kilometer mile
    hotel hostel reservation check-in checkout reception elevator escalator stairs floor lobby""",
    '购物消费': """shop store mall market supermarket grocery cashier counter basket cart price cost cheap expensive discount sale
    receipt refund exchange warranty size color brand quality customer service try fit wear fashion style trend payment
    cash card wallet purse coin bill change budget afford spend save borrow lend debt loan bank account deposit withdraw
    online shopping delivery package shipping address order number return policy free shipping tax total amount""",
    '居家生活': """house home apartment room bedroom bathroom kitchen living room dining room balcony garden yard garage roof wall
    floor ceiling window door key lock furniture sofa couch chair table desk bed pillow blanket sheet mattress curtain
    lamp light switch plug socket bulb mirror shelf drawer closet wardrobe carpet rug towel soap shampoo toothbrush
    toothpaste shower bathtub sink toilet broom mop bucket trash garbage clean dirty tidy messy repair fix broken leak
    neighbor landlord rent lease move furniture decorate paint""",
    '身体健康': """health healthy sick ill disease illness pain ache hurt fever cold cough headache stomachache toothache
    medicine pill drug pharmacy doctor nurse hospital clinic patient appointment emergency ambulance surgery injection
    blood heart lung brain liver kidney bone muscle skin hair eye ear nose mouth tooth tongue throat arm leg hand foot
    finger shoulder back chest neck knee ankle injury wound bandage exercise workout gym fitness run jog walk swim
    yoga stretch sleep rest tired exhausted energetic stress relax breathe breathe""",
    '天气环境': """weather forecast sunny cloudy rainy snowy windy storm thunder lightning fog humid dry wet temperature degree
    celsius fahrenheit hot warm cool cold freezing heat wave climate season spring summer autumn winter rain snow wind
    cloud sun moon star sky air pollution environment recycle garbage nature tree flower grass leaf plant forest river
    lake sea ocean beach mountain hill valley desert island coast wave""",
    '社交情感': """friend friendship family parent mother father son daughter brother sister grandmother grandfather uncle aunt
    cousin husband wife partner neighbor colleague classmate stranger guest host invitation party birthday wedding
    celebrate gift present hug kiss smile laugh cry angry happy sad upset worried nervous excited bored lonely proud
    jealous grateful sorry apologize forgive thank welcome greet introduce conversation chat talk listen speak discuss
    agree disagree argue quarrel trust honest polite rude kind friendly shy confident""",
    '职场办公': """job work career office company boss manager employee staff colleague interview resume salary wage income
    contract meeting schedule deadline project task report email document file folder printer computer laptop desk
    colleague client customer business market sales profit loss budget invest negotiate promote resign retire holiday
    vacation overtime shift full-time part-time experience skill training""",
    '学习校园': """school student teacher professor class lesson course subject exam test quiz homework assignment grade score
    pass fail study learn review library book notebook pen pencil eraser ruler dictionary page chapter paragraph
    grammar vocabulary pronunciation spelling translation essay writing reading listening speaking university college
    campus dormitory semester degree graduate knowledge question answer problem solution""",
    '数码科技': """phone smartphone screen battery charger cable headphone speaker camera photo video picture download upload
    internet website browser search click link password account login logout profile message text chat app software
    hardware keyboard mouse monitor screen laptop tablet device network wifi signal data storage memory update install
    delete save copy paste file folder cloud backup""",
    '娱乐休闲': """movie film cinema theater actor actress director scene story plot music song singer band concert album guitar
    piano drum dance sing play game sport team player match score win lose ticket show performance festival holiday
    travel trip tour vacation beach camp hike picnic party hobby read book magazine newspaper comic novel poem art
    paint draw museum gallery exhibition""",
    '时间数字': """today tomorrow yesterday morning afternoon evening night midnight noon dawn dusk week weekend Monday Tuesday
    Wednesday Thursday Friday Saturday Sunday month year decade century hour minute second moment early late soon
    always often sometimes never usually rarely already yet still just first second third half quarter double single
    hundred thousand million billion zero one two three four five six seven eight nine ten""",
}

def build_daily_words(ecdict):
    """按主题构建生活日常词表，词义从 ECDICT 取"""
    groups = []
    seen = set()
    for theme, blob in DAILY.items():
        words = []
        for w in re.split(r'[\s,]+', blob.strip()):
            w = w.strip().lower()
            if not w or w in seen:
                continue
            seen.add(w)
            words.append(w)
        groups.append([theme, words])
    return groups

# ---------------------------------------------------------------- 主流程
def main():
    print('[*] 载入词根数据 ...')
    word_to_roots, root_entries = load_roots()
    print('    词根条目 %d, 覆盖单词 %d' % (len(root_entries), len(word_to_roots)))

    print('[*] 载入例句词书 ...')
    kaj = load_kajweb()
    print('    覆盖单词 %d' % len(kaj))

    print('[*] 载入 ECDICT ...')
    ecdict = {}
    with open(os.path.join(RAW, 'ecdict.csv'), encoding='utf-8') as f:
        for row in csv.DictReader(f):
            w = (row['word'] or '').strip()
            if not w:
                continue
            key = w.lower()
            # 只保留纯字母单词/词组
            if not re.match(r"^[a-z][a-z'\- ]*$", key):
                continue
            tags = (row['tag'] or '').split()
            ecdict[key] = {
                'word': w,
                'phonetic': fix_phonetic(clean(row['phonetic'] or '')),
                'trans': parse_translation(row['translation'] or ''),
                'tags': tags,
                'frq': int(row['frq'] or 0),
                'bnc': int(row['bnc'] or 0),
                'collins': int(row['collins'] or 0),
                'oxford': int(row['oxford'] or 0),
            }
    print('    可用词条 %d' % len(ecdict))

    def make_entry(key, meta):
        rec = kaj.get(key, {})
        roots = []
        for r in word_to_roots.get(key, []):
            item = [r['root'], r['meaning'], r['class']]
            if item not in roots:
                roots.append(item)
            if len(roots) >= 2:
                break
        entry = {
            'w': meta['word'],
            'uk': fix_phonetic(rec.get('uk') or meta['phonetic']),
            'us': fix_phonetic(rec.get('us') or meta['phonetic']),
            't': meta['trans'],
            's': rec.get('s') or [],
            'p': rec.get('p') or [],
            'r': roots,
        }
        if rec.get('syn'):
            entry['syn'] = rec['syn']
        return entry

    # ---- 词书定义
    # ('tag', 标签) 取整个考纲
    # ('core', 标签, 需排除的更低级别标签, 词频下限, 词数上限) 取高频子集
    # ('daily',) 生活日常，按场景分组
    BOOKS = [
        ('junior',      '初中英语',    '中考大纲词汇，打好英语底子',              '中学', ('tag', 'zk')),
        ('senior',      '高中英语',    '高考大纲词汇，覆盖高中三年',              '中学', ('tag', 'gk')),
        ('gaokao_core', '高考高频英语', '按实际使用频率精选的高考核心词',          '中学', ('core', 'gk', {'zk'}, 600, 800)),
        ('cet4',        '大学英语四级', 'CET-4 大纲词汇',                       '大学', ('tag', 'cet4')),
        ('cet4_core',   '四级高频英语', '按实际使用频率精选的四级核心词',          '大学', ('core', 'cet4', {'zk', 'gk'}, 600, 1000)),
        ('cet6',        '大学英语六级', 'CET-6 大纲词汇',                       '大学', ('tag', 'cet6')),
        ('kaoyan',      '考研英语',    '硕士研究生入学考试词汇',                 '大学', ('tag', 'ky')),
        ('daily',       '生活日常用语', '衣食住行高频词，按 12 个场景分组',        '实用', ('daily',)),
    ]

    # 超高频功能词（the / be / and 之类）不需要「背」，统一剔除
    MIN_FRQ = 300

    # 更简单考试级别的标签，用于判断某个词是不是「本级新词」
    EASIER = {
        'zk': set(),
        'gk': {'zk'},
        'cet4': {'zk', 'gk'},
        'cet6': {'zk', 'gk', 'cet4'},
        'ky': {'zk', 'gk', 'cet4', 'cet6'},
    }

    stats = {}
    daily_words = []
    book_entries = {}

    def write_book(bid, name, desc, category, entries, extra=None):
        book_entries[bid] = entries
        with_s = sum(1 for e in entries if e['s'])
        payload = {
            'id': bid, 'name': name, 'desc': desc,
            'wordCount': len(entries),
            'words': entries,
        }
        if extra:
            payload.update(extra)
        path = os.path.join(OUT, 'books', bid + '.json')
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))
        size = os.path.getsize(path) / 1024 / 1024
        stats[bid] = (len(entries), with_s, size)
        pct = with_s * 100.0 / len(entries) if entries else 0
        print('    %-12s %5d 词, 例句覆盖 %5.1f%%, %.2f MB' % (bid, len(entries), pct, size))

    for bid, name, desc, category, rule in BOOKS:
        if rule[0] == 'daily':
            continue

        if rule[0] == 'tag':
            tag = rule[1]
            easier = EASIER.get(tag, set())
            words = [
                (k, m) for k, m in ecdict.items()
                if tag in m['tags'] and m['frq'] >= MIN_FRQ
            ]
            # 本级新词优先，再按使用频率
            words.sort(key=lambda kv: (
                0 if not (set(kv[1]['tags']) & easier) else 1,
                kv[1]['frq'] or 10**9,
                kv[1]['bnc'] or 10**9,
                kv[0],
            ))
        else:
            _, tag, exclude, floor, limit = rule
            words = [
                (k, m) for k, m in ecdict.items()
                if tag in m['tags'] and not (set(m['tags']) & exclude) and m['frq'] >= floor
            ]
            words.sort(key=lambda kv: (kv[1]['frq'] or 10**9, kv[1]['bnc'] or 10**9, kv[0]))
            words = words[:limit]

        write_book(bid, name, desc, category, [make_entry(k, m) for k, m in words])

    # ---- 生活日常
    print('[*] 构建生活日常词表 ...')
    groups = build_daily_words(ecdict)
    used = set()
    group_index = []
    missing = []
    for theme, words in groups:
        start = len(daily_words)
        for w in words:
            if w in used:
                continue
            meta = ecdict.get(w)
            if not meta:
                missing.append(w)
                continue
            used.add(w)
            e = make_entry(w, meta)
            e['g'] = theme
            daily_words.append(e)
        group_index.append({'name': theme, 'start': start, 'count': len(daily_words) - start})
    write_book('daily', '生活日常用语', '按场景分类的高频生活词汇，覆盖衣食住行', '实用',
               daily_words, {'groups': group_index})
    if missing:
        print('    缺失词: %s' % ', '.join(missing[:40]))

    # ---- 查词字典（导入自定义词库时用）
    # 以前是 lookup.json + examples.json 两个大文件（合计 10MB），导入时不管查几个词
    # 都要先下完 8MB 的例句索引，弱网下直接卡死。现在按首字母拆成 26 个小文件，
    # 用户粘的词是哪个字母开头就只下哪个。
    print('[*] 构建查词字典 ...')
    dict_all = {}
    for key, meta in ecdict.items():
        rank = meta['frq'] or meta['bnc'] or 0
        keep = ('cet4' in meta['tags'] or 'cet6' in meta['tags'] or 'ky' in meta['tags']
                or 'gk' in meta['tags'] or 'zk' in meta['tags']
                or (rank and rank <= 25000) or meta['collins'] >= 3)
        if not keep or not meta['trans']:
            continue

        item = {
            'ph': fix_phonetic(meta['phonetic']),
            't': [[a, b] for a, b in meta['trans'][:3]],
        }
        rec = kaj.get(key)
        if rec:
            if rec.get('s'):
                item['s'] = rec['s']
            if rec.get('p'):
                item['p'] = rec['p']
            if rec.get('syn'):
                item['syn'] = rec['syn']
        roots = []
        for r in word_to_roots.get(key, []):
            pair = [r['root'], r['meaning'], r['class']]
            if pair not in roots:
                roots.append(pair)
            if len(roots) >= 2:
                break
        if roots:
            item['r'] = roots

        dict_all[key] = item

    dict_dir = os.path.join(OUT, 'dict')
    os.makedirs(dict_dir, exist_ok=True)
    # 清掉上一次构建留下的分片，避免改分片规则后新旧混在一起
    for old in os.listdir(dict_dir):
        if old.endswith('.json'):
            os.remove(os.path.join(dict_dir, old))
    # 清掉上一次构建留下的分片，避免改分片规则后新旧混在一起
    for old in os.listdir(dict_dir):
        if old.endswith('.json'):
            os.remove(os.path.join(dict_dir, old))
    # 按前两个字母分片：单字母最大能到 950KB，弱网下还是慢；
    # 两字母后最大只有一百多 KB，导入几十个词通常只拉几百 KB
    buckets = {}
    for key, item in dict_all.items():
        if 'a' <= key[:1] <= 'z':
            buckets.setdefault(key[:2], {})[key] = item

    total_bytes = 0
    biggest = ('', 0)
    for letter in sorted(buckets):
        path = os.path.join(dict_dir, letter + '.json')
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(buckets[letter], f, ensure_ascii=False, separators=(',', ':'))
        size = os.path.getsize(path)
        total_bytes += size
        if size > biggest[1]:
            biggest = (letter, size)
    with_s = sum(1 for v in dict_all.values() if v.get('s'))
    print('    dict: %d 词（%d 有例句）, %d 个分片, 合计 %.2f MB, 最大 %s %.0f KB'
          % (len(dict_all), with_s, len(buckets), total_bytes / 1024 / 1024,
             biggest[0].upper(), biggest[1] / 1024))

    # ---- 词根索引（词根词缀专项用）
    print('[*] 构建词根索引 ...')
    root_payload = []
    for r in root_entries:
        examples = []
        for w in (r.get('examples') or []):
            key = w.lower()
            if key in ecdict and ecdict[key]['trans']:
                examples.append(w)
        if len(examples) < 2:
            continue
        # 词条数据直接内嵌，词根专项就不必再拉 8MB 的例句索引
        details = []
        for w in examples[:14]:
            meta = ecdict[w.lower()]
            details.append({
                'w': meta['word'],
                'p': fix_phonetic(meta['phonetic']),
                't': [[a, b] for a, b in meta['trans'][:3]],
            })
        root_payload.append({
            'r': r['root'],
            'm': r['meaning'],
            'me': r.get('meaning_en', ''),
            'c': r['class'],
            'cat': r['cat'],
            'o': r['origin'],
            'w': details,
        })
    root_payload.sort(key=lambda x: (-len(x['w']), x['r']))
    path = os.path.join(OUT, 'roots.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump({'roots': root_payload}, f, ensure_ascii=False, separators=(',', ':'))
    print('    roots: %d 个词根, %.2f MB'
          % (len(root_payload), os.path.getsize(path) / 1024 / 1024))

    # ---- 拼写库（拼写练习页可整本加入）
    print('[*] 构建拼写库 ...')
    spell_libs = []

    def spell_roots(key):
        """给拼写练习挑词根：优先保留能匹配词首/词尾的前缀和后缀，提示才有东西可给"""
        cand = word_to_roots.get(key, [])
        scored = []
        for item in cand:
            root = item['root']
            hit = False
            for part in re.split(r'[,\s]+', root):
                p = part.strip()
                if '前缀' in item['class'] and p.rstrip('-').lower() and key.startswith(p.rstrip('-').lower()):
                    hit = True
                if '后缀' in item['class'] and p.lstrip('-').lower() and key.endswith(p.lstrip('-').lower()):
                    hit = True
            scored.append((0 if hit else 1, item))
        scored.sort(key=lambda x: x[0])
        out = []
        for _, item in scored:
            pair = [item['root'], item['meaning'], item['class']]
            if pair in out:
                continue
            out.append(pair)
            if len(out) >= 3:
                break
        return out

    writing_words = []
    writing_groups = []
    missing_writing = []
    for group_name, words in WRITING_GROUPS:
        start = len(writing_words)
        for w in words:
            meta = ecdict.get(w.lower())
            if not meta or not meta['trans']:
                missing_writing.append(w)
                continue
            if any(x['w'].lower() == w.lower() for x in writing_words[start:]):
                continue
            rec = kaj.get(w.lower(), {})
            writing_words.append({
                'w': meta['word'],
                'p': fix_phonetic(rec.get('us') or rec.get('uk') or meta['phonetic']),
                't': [[a, b] for a, b in meta['trans'][:3]],
                'r': spell_roots(w.lower()),
                'g': group_name,
            })
        writing_groups.append({
            'name': group_name,
            'start': start,
            'count': len(writing_words) - start,
        })
    spell_libs.append({
        'id': 'writing_gaokao',
        'name': '高中英语作文写作高频词',
        'desc': '按 8 类作文表达整理：观点、因果、转折、递进、建议、程度、社会、态度',
        'groups': writing_groups,
        'words': writing_words,
    })
    if missing_writing:
        print('    作文词缺失: %s' % ', '.join(missing_writing))

    cet4_core_words = [
        {'w': e['w'], 'p': fix_phonetic(e.get('uk') or e.get('us') or ''), 't': e['t'][:3], 'r': e.get('r') or []}
        for e in book_entries.get('cet4_core', [])
    ]
    with_affix = sum(1 for w in writing_words + cet4_core_words if w['r'])
    print('    带词根词缀的词: %d / %d' % (with_affix, len(writing_words) + len(cet4_core_words)))
    spell_libs.append({
        'id': 'cet4_core',
        'name': '四级高频词语',
        'desc': '按实际使用频率精选的四级核心词，写作和阅读都用得上',
        'groups': [],
        'words': cet4_core_words,
    })

    path = os.path.join(OUT, 'spell.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump({'libraries': spell_libs}, f, ensure_ascii=False, separators=(',', ':'))
    print('    spell: %d 个拼写库, %d 词, %.2f MB'
          % (len(spell_libs), sum(len(x['words']) for x in spell_libs),
             os.path.getsize(path) / 1024 / 1024))

    # ---- 首字母索引（公共库）
    # 同一单词在多本词书里重复出现时，保留最先出现的（越靠前的词书越基础）
    print('[*] 构建首字母索引 ...')
    by_letter = {}
    seen_words = set()
    total_letter_words = 0
    for bid, _, _, _, _ in BOOKS:
        for e in book_entries.get(bid, []):
            key = e['w'].lower()
            if key in seen_words:
                continue
            first = key[:1]
            if not ('a' <= first <= 'z'):
                continue
            seen_words.add(key)
            by_letter.setdefault(first, []).append({
                'w': e['w'],
                'b': bid,
                'p': fix_phonetic(e.get('uk') or e.get('us') or ''),
                't': e['t'][:3],
            })
            total_letter_words += 1

    letter_index = []
    for letter in sorted(by_letter):
        words = by_letter[letter]
        payload = {'l': letter, 'count': len(words), 'words': words}
        p = os.path.join(OUT, 'letters', letter + '.json')
        with open(p, 'w', encoding='utf-8') as f:
            json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))
        letter_index.append({'l': letter, 'count': len(words)})
    with open(os.path.join(OUT, 'letters', 'index.json'), 'w', encoding='utf-8') as f:
        json.dump({'letters': letter_index, 'total': total_letter_words},
                  f, ensure_ascii=False, separators=(',', ':'))
    biggest = max((len(v) for v in by_letter.values()), default=0)
    print('    首字母索引: %d 个字母, %d 词, 最大单文件 %d 词'
          % (len(letter_index), total_letter_words, biggest))

    # ---- 书单
    manifest = {
        'books': [
            {
                'id': bid,
                'name': name,
                'desc': desc,
                'count': stats[bid][0],
                'category': category,
                'tag': '高频' if rule[0] == 'core' else ('日常' if rule[0] == 'daily' else '大纲'),
            }
            for bid, name, desc, category, rule in BOOKS
        ]
    }
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print('[*] 完成')

if __name__ == '__main__':
    main()
