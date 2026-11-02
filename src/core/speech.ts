let voiceCache: SpeechSynthesisVoice[] = []

function loadVoices() {
  if (typeof speechSynthesis === 'undefined') return
  voiceCache = speechSynthesis.getVoices()
}

if (typeof speechSynthesis !== 'undefined') {
  loadVoices()
  speechSynthesis.onvoiceschanged = loadVoices
}

function pickVoice(accent: 'us' | 'uk') {
  const target = accent === 'uk' ? 'en-GB' : 'en-US'
  const exact = voiceCache.find((v) => v.lang.replace('_', '-') === target)
  if (exact) return exact
  return voiceCache.find((v) => v.lang.toLowerCase().startsWith('en')) ?? null
}

export function speak(word: string, accent: 'us' | 'uk' = 'us') {
  if (typeof speechSynthesis === 'undefined') return
  try {
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(word)
    u.lang = accent === 'uk' ? 'en-GB' : 'en-US'
    u.rate = 0.9
    u.pitch = 1
    const voice = pickVoice(accent)
    if (voice) u.voice = voice
    speechSynthesis.speak(u)
  } catch {
    /* 静默失败，不影响主流程 */
  }
}

export function speechSupported() {
  return typeof speechSynthesis !== 'undefined'
}
