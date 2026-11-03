/**
 * 发音。
 *
 * 两条路：
 * 1. Web Speech API —— 离线、免费、即时，桌面和主流手机浏览器都正常
 * 2. 音频文件 —— 微信内置浏览器（X5 / WKWebView）里 Web Speech 基本不出声，
 *    这时改用有道词典的发音接口，走 <audio> 播放
 *
 * 优先 1，失败自动降级到 2；微信里直接走 2，省掉一次注定失败的尝试。
 *
 * 另外几个移动端的坑也在这里兜住：
 * - iOS 上「cancel() 紧接着 speak()」会把新排的这句吞掉 → 只有真的在播才打断
 * - utterance 不持有引用会被 GC → 用 current 保住
 * - 云端语音在弱网/离线时直接静音 → 优先挑 localService 的本地语音
 * - Chrome 有时停在 paused → 每次 speak 后 resume 一次
 */

import { logger } from './logger'

type FailListener = () => void

const UA = typeof navigator === 'undefined' ? '' : navigator.userAgent
/** 微信 / 企业微信内置浏览器：Web Speech 不出声，但 <audio> 可以 */
const IN_WECHAT = /MicroMessenger|wxwork/i.test(UA)

let voices: SpeechSynthesisVoice[] = []
let current: SpeechSynthesisUtterance | null = null
let audioEl: HTMLAudioElement | null = null
const failListeners = new Set<FailListener>()
let lastFailAt = 0

function synth(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null
  return window.speechSynthesis ?? null
}

function loadVoices() {
  const s = synth()
  if (!s) return
  try {
    voices = s.getVoices() || []
  } catch {
    voices = []
  }
}

if (typeof window !== 'undefined') {
  const s = synth()
  if (s) {
    loadVoices()
    // 语音列表是异步填充的，不同浏览器给的时机不一样
    s.addEventListener?.('voiceschanged', loadVoices)
    s.onvoiceschanged = loadVoices
  }
  // 从后台切回来时，部分浏览器的语音队列会卡住
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    const api = synth()
    if (api?.paused) api.resume()
    if (!voices.length) loadVoices()
  })
}

function emitFail() {
  const now = Date.now()
  if (now - lastFailAt < 4000) return
  lastFailAt = now
  logger.warn('speech', '没有听到声音', {
    环境: IN_WECHAT ? '微信内置浏览器' : '普通浏览器',
    语音数量: voices.length,
    英文语音: voices.filter((v) => v.lang.toLowerCase().startsWith('en')).length,
  })
  for (const cb of failListeners) {
    try {
      cb()
    } catch {
      /* 订阅方出错不影响主流程 */
    }
  }
}

/** 订阅「这次没能出声」，用来提示用户 */
export function onSpeechFail(cb: FailListener): () => void {
  failListeners.add(cb)
  return () => failListeners.delete(cb)
}

/* ---------------------------------------------------------------- 音频兜底 */

/** 有道词典发音：type=1 英音，type=2 美音 */
function audioUrl(word: string, accent: 'us' | 'uk') {
  const type = accent === 'uk' ? 1 : 2
  return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${type}`
}

/**
 * 用 <audio> 播发音。
 * 复用同一个元素：iOS 上反复 new Audio() 容易触发「需要用户交互」的限制。
 */
function playAudio(word: string, accent: 'us' | 'uk', onFail: () => void) {
  if (typeof Audio === 'undefined') {
    onFail()
    return
  }
  try {
    if (!audioEl) {
      audioEl = new Audio()
      audioEl.preload = 'auto'
    }
    const el = audioEl
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      if (!ok) {
        logger.warn('speech', '音频兜底也没能播放', { word })
        onFail()
      }
    }

    el.onplaying = () => finish(true)
    el.onended = () => finish(true)
    el.onerror = () => finish(false)
    el.src = audioUrl(word, accent)

    const p = el.play()
    if (p && typeof p.catch === 'function') p.catch(() => finish(false))

    // 2.6 秒还没开始播就认定失败（弱网下确实可能慢，给得宽一点）
    window.setTimeout(() => {
      if (el.paused && el.currentTime === 0) finish(false)
      else finish(true)
    }, 2600)
  } catch {
    onFail()
  }
}

/* ---------------------------------------------------------------- 语音合成 */

function pickVoice(accent: 'us' | 'uk') {
  if (!voices.length) loadVoices()
  const target = accent === 'uk' ? 'en-GB' : 'en-US'
  const norm = (v: SpeechSynthesisVoice) => v.lang.replace('_', '-').toLowerCase()
  const english = voices.filter((v) => norm(v).startsWith('en'))
  // 本地语音不依赖网络，弱网下比云端语音靠谱
  const local = english.filter((v) => v.localService)
  const find = (list: SpeechSynthesisVoice[]) =>
    list.find((v) => norm(v) === target.toLowerCase()) ??
    list.find((v) => norm(v).startsWith(target.slice(0, 2).toLowerCase())) ??
    null
  return find(local) ?? find(english) ?? null
}

function isCancelError(err?: string) {
  return err === 'canceled' || err === 'interrupted'
}

function playSpeech(text: string, accent: 'us' | 'uk') {
  const s = synth()
  if (!s) {
    playAudio(text, accent, emitFail)
    return
  }

  try {
    // 只有真的在播才打断；iOS 上 cancel 后立刻 speak，新的这句会被吞
    if (s.speaking || s.pending) s.cancel()

    const u = new SpeechSynthesisUtterance(text)
    u.lang = accent === 'uk' ? 'en-GB' : 'en-US'
    u.rate = 0.9
    u.pitch = 1
    u.volume = 1
    const voice = pickVoice(accent)
    if (voice) u.voice = voice

    let started = false
    let settled = false

    /** 合成没出声就退到音频，音频再失败才提示用户 */
    const fallback = () => {
      if (settled) return
      settled = true
      logger.info('speech', '语音合成没出声，改用音频', { word: text })
      playAudio(text, accent, emitFail)
    }

    u.onstart = () => {
      started = true
      settled = true
    }
    u.onend = () => {
      if (current === u) current = null
    }
    u.onerror = (e) => {
      if (current === u) current = null
      if (started || isCancelError(e.error)) return
      logger.warn('speech', '语音合成报错', { word: text, error: e.error })
      fallback()
    }

    logger.debug('speech', '朗读', {
      word: text,
      口音: accent,
      语音: voice ? `${voice.name}(${voice.lang}${voice.localService ? ',本地' : ',云端'})` : '系统默认',
      可用语音: voices.length,
    })

    // 保住引用，否则 utterance 可能被回收导致没有声音
    current = u
    s.speak(u)
    if (s.paused) s.resume()

    // onstart 迟迟不来基本就是没出声；但先看 speaking，避免把已经开始播的当失败
    window.setTimeout(() => {
      if (started) return
      if (s.speaking) {
        started = true
        settled = true
        return
      }
      fallback()
    }, 800)
  } catch {
    playAudio(text, accent, emitFail)
  }
}

/* ---------------------------------------------------------------- 对外 */

/** 返回 false 表示连兜底方案都用不了 */
export function speak(word: string, accent: 'us' | 'uk' = 'us'): boolean {
  const text = (word || '').trim()
  if (!text) return false

  // 微信内置浏览器里 Web Speech 不出声，直接走音频
  if (IN_WECHAT || !synth()) {
    logger.debug('speech', '使用音频发音', {
      word: text,
      环境: IN_WECHAT ? '微信' : '无语音合成',
    })
    playAudio(text, accent, emitFail)
    return true
  }

  playSpeech(text, accent)
  return true
}

export function speechSupported() {
  return synth() !== null || typeof Audio !== 'undefined'
}

/** 是否运行在微信内置浏览器里（设置页用来给出说明） */
export function isWeChatBrowser() {
  return IN_WECHAT
}
