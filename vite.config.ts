import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  // 相对路径：同一份产物既能放在站点根目录，也能放在 GitHub Pages 的 /app/ 子目录下。
  // 应用使用 hash 路由，页面路径不会变化，因此相对路径是安全的。
  base: './',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 5173,
    open: false,
  },
  build: {
    target: 'es2022',
    // 应用产物输出到 dist/app，官网占 dist 根目录
    outDir: 'dist/app',
    emptyOutDir: true,
  },
})
