import { useEffect, useRef, useState } from 'react'
import { isWeChatBrowser, onSpeechFail } from '../core/speech'

/**
 * 点了发音但没出声时给一条提示。
 * 常见原因：手机静音 / 媒体音量为 0 / 微信内置浏览器限制 / 系统没装英文语音。
 * 这些都感知不到，只能靠「既没开始播、音频也放不出来」反推。
 */
export default function SpeechHint() {
  const [show, setShow] = useState(false)
  const timer = useRef<number>(0)

  useEffect(() => {
    const off = onSpeechFail(() => {
      setShow(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setShow(false), 9000)
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
        <span>
          {isWeChatBrowser()
            ? '微信内置浏览器限制较多，点右上角「…」选「在浏览器打开」再试。'
            : '请检查手机是否静音、媒体音量是否为 0；微信里打开的话，可以点右上角「…」用浏览器打开。'}
        </span>
      </div>
      <button className="speech-hint-close" onClick={() => setShow(false)}>
        知道了
      </button>
    </div>
  )
}
