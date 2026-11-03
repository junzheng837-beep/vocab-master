import { useEffect, useRef, useState } from 'react'
import { onSpeechFail } from '../core/speech'

/**
 * 点了发音但没出声时给一条提示。
 * 手机上最常见的原因是侧边静音开关（iPhone）或媒体音量为 0（安卓），
 * 这两种情况 JS 完全感知不到，只能靠「onstart 没触发」反推。
 */
export default function SpeechHint() {
  const [show, setShow] = useState(false)
  const timer = useRef<number>(0)

  useEffect(() => {
    const off = onSpeechFail(() => {
      setShow(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setShow(false), 8000)
    })
    return () => {
      off()
      window.clearTimeout(timer.current)
    }
  }, [])

  if (!show) return null

  return (
    <div className="speech-hint" role="status">
      <div className="speech-hint-text">
        <b>没有听到声音？</b>
        <span>iPhone 请检查左侧静音开关，安卓请调高媒体音量；仍然没声说明系统里没装英文语音包。</span>
      </div>
      <button className="speech-hint-close" onClick={() => setShow(false)}>
        知道了
      </button>
    </div>
  )
}
