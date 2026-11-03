/**
 * 本地打安卓包（需要先装好 Android SDK 和 JDK 17）。
 * CI 上走的是 .github/workflows/release.yml 里的 android job，步骤一致。
 */
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const run = (cmd, opts = {}) => {
  console.log(`\n$ ${cmd}`)
  execSync(cmd, { stdio: 'inherit', ...opts })
}

if (!process.env.ANDROID_HOME && !process.env.ANDROID_SDK_ROOT && !existsSync('android/local.properties')) {
  console.error('\n找不到 Android SDK：请设置 ANDROID_HOME，或在 android/local.properties 里写 sdk.dir=...')
  process.exit(1)
}

run('npm run build')
run('npx cap sync android')
run('node scripts/set-android-version.mjs')
run('sh gradlew assembleRelease', { cwd: 'android' })
console.log('\nAPK: android/app/build/outputs/apk/release/shici-android.apk')
