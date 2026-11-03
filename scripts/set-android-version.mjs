/**
 * 把 package.json 的版本号同步到 Android 工程。
 * versionCode 用 major*10000 + minor*100 + patch，保证每次发版递增。
 */
import { readFileSync, writeFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const [major = 0, minor = 0, patch = 0] = pkg.version.split('.').map((n) => Number(n) || 0)
const versionCode = major * 10000 + minor * 100 + patch

const path = 'android/app/build.gradle'
let gradle = readFileSync(path, 'utf8')
const before = gradle
gradle = gradle.replace(/versionCode \d+/, `versionCode ${versionCode}`)
gradle = gradle.replace(/versionName "[^"]*"/, `versionName "${pkg.version}"`)

if (gradle === before) {
  console.warn('[android] build.gradle 里没找到 versionCode / versionName，跳过')
} else {
  writeFileSync(path, gradle)
}
console.log(`[android] versionName=${pkg.version} versionCode=${versionCode}`)
