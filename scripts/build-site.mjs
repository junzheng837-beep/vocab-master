/**
 * 把官网静态文件复制到 dist 根目录，应用产物在 dist/app。
 * 最终 dist 结构：
 *   dist/index.html      → 官网
 *   dist/assets/...      → 官网资源
 *   dist/app/index.html  → 应用
 */
import { cp, mkdir, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const siteDir = join(root, 'site')
const distDir = join(root, 'dist')

if (!existsSync(siteDir)) {
  console.error('[build-site] 找不到 site 目录')
  process.exit(1)
}

await mkdir(distDir, { recursive: true })

// 复制官网文件（不覆盖 app 子目录）
const entries = await readdir(siteDir, { withFileTypes: true })
for (const entry of entries) {
  if (entry.name === 'app') continue
  await cp(join(siteDir, entry.name), join(distDir, entry.name), { recursive: true })
}

console.log(`[build-site] 官网已输出到 dist（${entries.length} 项）`)
if (!existsSync(join(distDir, 'app', 'index.html'))) {
  console.warn('[build-site] 警告：dist/app/index.html 不存在，请先运行 build:app')
}
