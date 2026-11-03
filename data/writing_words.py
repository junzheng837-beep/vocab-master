# -*- coding: utf-8 -*-
"""高中英语作文写作高频词。

按作文里实际会用到的表达场景分组，而不是按字母或词频。
刻意剔除了 the / be / so / but 这类纯功能词——它们不需要「背」。
"""

WRITING_GROUPS = [
    ('观点与论证', [
        'opinion', 'view', 'attitude', 'argue', 'argument', 'believe', 'consider',
        'maintain', 'insist', 'claim', 'assume', 'conclude', 'conclusion',
        'evidence', 'prove', 'support', 'oppose', 'admit', 'deny', 'doubt',
        'persuade', 'convince', 'comment', 'declare', 'emphasize', 'stress',
        'obvious', 'apparent', 'reasonable', 'convincing',
    ]),
    ('原因与结果', [
        'cause', 'result', 'consequence', 'effect', 'affect', 'influence',
        'contribute', 'arise', 'outcome', 'reaction', 'respond', 'response',
        'generate', 'produce', 'lead', 'therefore', 'thus', 'hence',
        'accordingly', 'reason', 'factor', 'derive', 'originate',
    ]),
    ('转折与对比', [
        'however', 'nevertheless', 'whereas', 'although', 'despite', 'instead',
        'contrast', 'compare', 'comparison', 'difference', 'differ', 'similar',
        'similarly', 'opposite', 'otherwise', 'while', 'yet', 'though',
        'unlike', 'distinguish', 'distinction',
    ]),
    ('递进与举例', [
        'moreover', 'furthermore', 'besides', 'additionally', 'instance',
        'example', 'namely', 'particularly', 'especially', 'specifically',
        'generally', 'actually', 'indeed', 'mainly', 'obviously', 'besides',
        'meanwhile', 'simultaneously',
    ]),
    ('建议与措施', [
        'suggest', 'suggestion', 'advise', 'advice', 'recommend', 'proposal',
        'propose', 'measure', 'solution', 'solve', 'settle', 'prevent', 'avoid',
        'ensure', 'guarantee', 'improve', 'promote', 'develop', 'strengthen',
        'reduce', 'increase', 'decrease', 'limit', 'control', 'manage',
        'handle', 'effort', 'attempt', 'action', 'step', 'approach',
        'encourage', 'require', 'demand',
    ]),
    ('重要与程度', [
        'important', 'importance', 'essential', 'significant', 'significance',
        'vital', 'crucial', 'necessary', 'major', 'minor', 'primary', 'basic',
        'fundamental', 'extremely', 'considerably', 'greatly', 'highly',
        'increasingly', 'gradually', 'slightly', 'completely', 'entirely',
        'absolutely', 'relatively', 'fairly', 'rather', 'particularly',
    ]),
    ('社会与话题', [
        'society', 'social', 'environment', 'environmental', 'pollution',
        'education', 'technology', 'technological', 'culture', 'cultural',
        'tradition', 'traditional', 'generation', 'responsibility',
        'opportunity', 'challenge', 'competition', 'pressure', 'health',
        'safety', 'economy', 'economic', 'government', 'policy', 'community',
        'teenager', 'career', 'future', 'resource', 'population',
        'communication', 'cooperation', 'relationship',
    ]),
    ('情感与态度', [
        'appreciate', 'gratitude', 'grateful', 'thankful', 'concern', 'worried',
        'confident', 'confidence', 'optimistic', 'pessimistic', 'positive',
        'negative', 'active', 'passive', 'eager', 'willing', 'reluctant',
        'patient', 'curious', 'interest', 'satisfied', 'disappointed', 'proud',
        'afraid', 'fear', 'hope', 'expect', 'expectation', 'inspire',
        'motivate', 'sympathy', 'respect', 'tolerate',
    ]),
]
