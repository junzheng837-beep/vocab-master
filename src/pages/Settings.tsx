import { store, useAppState } from '../core/store'
import { speechSupported, speak } from '../core/speech'
import type { PageId } from '../components/Sidebar'
import AboutCard from '../components/AboutCard'

function Stepper({
  value,
  min,
  max,
  step = 5,
  onChange,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
}) {
  return (
    <div className="stepper">
      <button onClick={() => onChange(Math.max(min, value - step))}>−</button>
      <input
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\D/g, ''))
          if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(min, n)))
        }}
      />
      <button onClick={() => onChange(Math.min(max, value + step))}>+</button>
    </div>
  )
}

export default function SettingsPage({ onNavigate }: { onNavigate: (p: PageId) => void }) {
  const state = useAppState()
  const { settings } = state

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">设置</div>
        <div className="page-subtitle">调整每天的学习节奏和界面偏好</div>
      </div>

      <div className="section-label">学习节奏</div>
      <div className="list">
        <div className="list-item">
          <div style={{ flex: 1 }}>
            <div className="card-title">每天新学单词</div>
            <div className="card-desc">每天最多学习多少个新单词</div>
          </div>
          <Stepper
            value={settings.dailyNew}
            min={5}
            max={300}
            step={5}
            onChange={(v) => void store.updateSettings({ dailyNew: v })}
          />
        </div>
        <div className="list-item">
          <div style={{ flex: 1 }}>
            <div className="card-title">每天复习上限</div>
            <div className="card-desc">到期的旧单词最多复习多少个，避免堆积时一次压太多</div>
          </div>
          <Stepper
            value={settings.dailyReview}
            min={20}
            max={1000}
            step={20}
            onChange={(v) => void store.updateSettings({ dailyReview: v })}
          />
        </div>
        <div className="list-item">
          <div style={{ flex: 1 }}>
            <div className="card-title">显示释义后自动发音</div>
            <div className="card-desc">
              使用系统语音朗读单词{speechSupported() ? '' : '（当前浏览器不支持语音）'}
            </div>
          </div>
          <button
            className={`switch ${settings.autoSpeak ? 'on' : ''}`}
            onClick={() => void store.updateSettings({ autoSpeak: !settings.autoSpeak })}
            aria-label="自动发音"
          />
        </div>
        <div className="list-item">
          <div style={{ flex: 1 }}>
            <div className="card-title">自定义词库的新词顺序</div>
            <div className="card-desc">按导入顺序背，或者每次打乱顺序，避免靠位置记词</div>
          </div>
          <div className="segmented">
            {(
              [
                ['import', '导入顺序'],
                ['random', '随机打乱'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                className={settings.customOrder === v ? 'active' : ''}
                onClick={() => void store.updateSettings({ customOrder: v })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="list-item">
          <div style={{ flex: 1 }}>
            <div className="card-title">拼写测试</div>
            <div className="card-desc">
              看完释义后要把单词打出来，比纯认读记得更牢
            </div>
          </div>
          <button
            className={`switch ${settings.spellMode ? 'on' : ''}`}
            onClick={() => void store.updateSettings({ spellMode: !settings.spellMode })}
            aria-label="拼写测试"
          />
        </div>
      </div>

      <div className="section-label">词书</div>
      <div className="list">
        <div className="list-item">
          <div style={{ flex: 1 }}>
            <div className="card-title">参与学习的词书</div>
            <div className="card-desc">
              已选 {settings.activeBooks.length} 本
            </div>
          </div>
          <button className="btn" onClick={() => onNavigate('library')}>
            去选择
          </button>
        </div>
        <div className="list-item">
          <div style={{ flex: 1 }}>
            <div className="card-title">导入自己的词库</div>
            <div className="card-desc">粘贴单词，自动匹配释义</div>
          </div>
          <button className="btn" onClick={() => onNavigate('import')}>
            去导入
          </button>
        </div>
      </div>

      <div className="section-label">外观</div>
      <div className="list">
        <div className="list-item">
          <div style={{ flex: 1 }}>
            <div className="card-title">主题</div>
            <div className="card-desc">跟随系统或手动指定</div>
          </div>
          <div className="segmented">
            {(
              [
                ['auto', '跟随系统'],
                ['light', '浅色'],
                ['dark', '深色'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                className={settings.theme === v ? 'active' : ''}
                onClick={() => void store.updateSettings({ theme: v })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="list-item">
          <div style={{ flex: 1 }}>
            <div className="card-title">试听发音</div>
            <div className="card-desc">确认系统的英文语音是否正常</div>
          </div>
          <button className="btn" onClick={() => speak('vocabulary')}>
            朗读 vocabulary
          </button>
        </div>
      </div>

      <div className="section-label">复习节奏说明</div>
      <div className="card">
        <div className="card-desc" style={{ lineHeight: 1.85 }}>
          评分 <strong style={{ color: 'var(--red)' }}>0 待会再来</strong>：本轮内排到队尾重来一次，不算入长期记忆<br />
          评分 <strong style={{ color: 'var(--orange)' }}>1 困难</strong>：1 天后再复习<br />
          评分 <strong style={{ color: 'var(--blue)' }}>2 一般</strong>：3 天后再复习<br />
          评分 <strong style={{ color: 'var(--green)' }}>3 容易</strong>：7 天后再复习；连续答「容易」时间隔会逐步拉长（13 天、23 天…），最多 120 天
        </div>
      </div>

      <div className="section-label">数据</div>
      <div className="list">
        <div className="list-item">
          <div style={{ flex: 1 }}>
            <div className="card-title">重置今天</div>
            <div className="card-desc">
              把今天学过和复习过的单词全部退回，今日统计清零，其他日期不受影响
            </div>
          </div>
          <button
            className="btn"
            onClick={() => {
              if (
                confirm(
                  '重置今天的进度？今天学的新词会退回「新词」，今天复习的旧词会退回复习队列，今日统计清零。'
                )
              ) {
                void store.resetToday().then((r) => {
                  alert(`已重置：${r.removed} 个新词退回新词，${r.reverted} 个复习词退回队列。`)
                })
              }
            }}
          >
            重置今天
          </button>
        </div>
        <div className="list-item">
          <div style={{ flex: 1 }}>
            <div className="card-title">清空全部学习记录</div>
            <div className="card-desc">
              已学 {Object.keys(state.states).length} 个单词的状态会被删除，此操作不可撤销
            </div>
          </div>
          <button
            className="btn btn-danger"
            onClick={() => {
              if (
                confirm(
                  '确定清空全部学习记录吗？所有单词的掌握度、复习计划、统计都会消失，且无法恢复。'
                )
              ) {
                void store.resetAll()
              }
            }}
          >
            清空
          </button>
        </div>
      </div>

      <div className="section-label">关于</div>
      <AboutCard />
    </div>
  )
}
