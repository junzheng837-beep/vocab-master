import { useState } from 'react'
import { IconCheck } from './Icons'

const EMAIL = '2801822591@qq.com'

const HIGHLIGHTS: { title: string; desc: string }[] = [
  { title: '先回忆，再看答案', desc: '打开只有单词，想不起来才翻开释义' },
  { title: '诚实打分，剩下的交给时间', desc: '0 / 1 / 2 / 3 四档，记不住的明天再来' },
  { title: '不制造焦虑', desc: '没有排行榜，没有断签惩罚，没有非完成不可的任务' },
  { title: '该有的都在手边', desc: '音标、例句、词根、拼写练习，不用来回切应用' },
]

function Logo() {
  return (
    <svg width="52" height="52" viewBox="0 0 256 256" aria-hidden="true">
      <defs>
        <linearGradient id="about-logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0A84FF" />
          <stop offset="100%" stopColor="#5E5CE6" />
        </linearGradient>
      </defs>
      <rect width="256" height="256" rx="58" fill="url(#about-logo-g)" />
      <rect x="62" y="150" width="132" height="46" rx="16" fill="#fff" opacity="0.34" />
      <rect x="52" y="110" width="152" height="52" rx="17" fill="#fff" opacity="0.62" />
      <rect x="42" y="62" width="172" height="66" rx="19" fill="#fff" opacity="0.97" />
      <rect x="66" y="84" width="76" height="9" rx="4.5" fill="#0A84FF" opacity="0.85" />
      <rect x="66" y="102" width="46" height="9" rx="4.5" fill="#0A84FF" opacity="0.42" />
      <path
        d="M158 92 l12 13 24 -27"
        fill="none"
        stroke="#0A84FF"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
    </svg>
  )
}

/** 设置页底部的「关于」 */
export default function AboutCard() {
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'fail'>('idle')

  async function copyEmail() {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(EMAIL)
      } else {
        // 非安全上下文（比如桌面端的 app:// 协议）用临时 textarea 兜底
        const ta = document.createElement('textarea')
        ta.value = EMAIL
        ta.style.position = 'fixed'
        ta.style.top = '-1000px'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(ta)
        if (!ok) throw new Error('copy failed')
      }
      setCopyState('ok')
    } catch {
      setCopyState('fail')
    }
    setTimeout(() => setCopyState('idle'), 1800)
  }

  return (
    <div className="card about">
      <div className="about-hero">
        <div className="about-logo">
          <Logo />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="about-name">拾词易记</div>
          <div className="about-version">
            版本 {__APP_VERSION__} · 拾起每一个词，记得更久
          </div>
        </div>
      </div>

      <p className="about-p">
        这个软件不是从「做一个背单词 App」开始的，是从我自己的困扰开始的。
      </p>
      <p className="about-p">
        背了这么多年单词，坑大概都踩过一遍：词表背到 abandon 就翻不过第二页；
        一打开就是几百个待复习，看一眼就想关掉；点「认识」点得飞快，合上手机一个也想不起来；
        想看看这个词为什么这么拼，还得切到另一个 App 去查。
      </p>
      <p className="about-p">
        市面上的背单词软件各有各的好，也各有各的门槛。拾词易记想做的，是把这些坑填掉一点：
      </p>

      <ul className="about-list">
        {HIGHLIGHTS.map((h) => (
          <li key={h.title}>
            <span className="about-dot" />
            <span>
              <b>{h.title}</b>
              <span className="about-list-desc">{h.desc}</span>
            </span>
          </li>
        ))}
      </ul>

      <p className="about-p" style={{ marginTop: 16 }}>
        它适合<b>想把英语尽快补起来的人</b>，也适合<b>英语底子本来就不太好的人</b>。
        从初中词表开始也不丢人，重要的是一直在往前走。
      </p>

      <div className="about-contact">
        <div style={{ minWidth: 0 }}>
          <div className="about-contact-title">遇到 bug，或者有想要的功能？</div>
          <div className="about-contact-desc">
            直接发邮件告诉我，我会尽量把大家真正需要的东西做出来。
          </div>
        </div>
        <div className="about-contact-actions">
          <a className="btn btn-primary" href={`mailto:${EMAIL}?subject=拾词易记反馈`}>
            {EMAIL}
          </a>
          <button className="btn" onClick={() => void copyEmail()} title="复制邮箱">
            {copyState === 'ok' ? (
              <IconCheck size={13} />
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="11" height="11" rx="2.5" />
                <path d="M15 9V6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15H9" />
              </svg>
            )}
            {copyState === 'ok' ? '已复制' : copyState === 'fail' ? '请手动选中' : '复制'}
          </button>
        </div>
      </div>

      <div className="about-foot">
        <span>开发者：小靓仔</span>
        <span>个人项目 · 持续更新中</span>
      </div>
    </div>
  )
}
