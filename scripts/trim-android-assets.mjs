/**
 * 精简安卓启动图。
 *
 * capacitor-assets 会生成横屏 / 夜间 / 各密度的全套启动图，一共 8MB。
 * 但这个应用锁了竖屏，横屏图永远用不上；夜间图也和白天是同一张蓝色渐变。
 * 删掉这两类，APK 能小 6MB 左右，下载快不少。
 */
import { readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'android/app/src/main/res'

let removed = 0
let bytes = 0

for (const name of readdirSync(DIR)) {
  if (!name.startsWith('drawable')) continue
  // drawable-land*（横屏）和 *-night*（夜间）都可以删；
  // drawable-v24 里是图标前景 XML，不能动
  if (!name.startsWith('drawable-land') && !name.includes('-night')) continue

  const path = join(DIR, name)
  const stat = statSync(path)
  if (stat.isDirectory()) {
    for (const f of readdirSync(path)) bytes += statSync(join(path, f)).size
    rmSync(path, { recursive: true, force: true })
  } else {
    bytes += stat.size
    rmSync(path, { force: true })
  }
  removed += 1
}

console.log(
  `[android] 已删除 ${removed} 个用不到的启动图目录，省下 ${(bytes / 1024 / 1024).toFixed(1)} MB`
)
