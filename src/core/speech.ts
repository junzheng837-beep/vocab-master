/**
 * 发音。
 *
 * 移动端上 Web Speech API 有几个坑，这里逐个兜住：
 * 1. iOS 上「cancel() 紧接着 speak()」会把新排的这句吞掉 → 只有真的在播才打断
 * 2. utterance 不持有引用会被 GC，导致偶发没声音 → 用 current 保住
 * 3. 云端语音在弱网/离线时直接静音 → 优先挑 localService 的本地语音
 * 4. Chrome 有时会停在 paused 状态 → 每次 speak 后 resume 一次
 * 5. 首次调用可能静默失败 → 没收到 onstart 就自动重试一次
 * 6. 仍然没声音（多半是 iPhone 侧边静音开关）→ 抛给界面提示用户
 */

import { logger } from './logger'

type FailListener = () => void

let voices: SpeechSynthesisVoice[] = []
let current: SpeechSynthesisUtterance | null = null
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
  logger.warn('speech', '没有检测到语音开始播放', {
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

/** 订阅「这次没能出声」，用来提示用户检查静音开关 */
export function onSpeechFail(cb: FailListener): () => void {
  failListeners.add(cb)
  return () => failListeners.delete(cb)
}

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

function play(text: string, accent: 'us' | 'uk', retried: boolean) {
  const s = synth()
  if (!s) return

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

    const retryOrFail = () => {
      if (settled) return
      settled = true
      if (!retried) {
        window.setTimeout(() => play(text, accent, true), 220)
      } else {
        emitFail()
      }
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
      logger.warn('speech', '朗读报错', { word: text, error: e.error })
      retryOrFail()
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

    // onstart 迟迟不来，基本可以判定没出声；但先看 speaking，避免把已经开始播的当成失败
    window.setTimeout(() => {
      if (started) return
      if (s.speaking) {
        started = true
        settled = true
        return
      }
      retryOrFail()
    }, 1100)
  } catch {
    emitFail()
  }
}

/** 返回 false 表示当前环境根本不支持语音 */
export function speak(word: string, accent: 'us' | 'uk' = 'us'): boolean {
  const s = synth()
  const text = (word || '').trim()
  if (!s || !text) {
    emitFail()
    return false
  }
  play(text, accent, false)
  return true
}

export function speechSupported() {
  return synth() !== null
}
