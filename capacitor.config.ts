import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.shici.vocab',
  appName: '拾词易记',
  webDir: 'dist/app',
  android: {
    // 词库和界面全部打进包里，断网也能背
    allowMixedContent: false,
    backgroundColor: '#1c1c1e',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 600,
      backgroundColor: '#0A84FF',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
  },
}

export default config
