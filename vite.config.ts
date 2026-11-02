import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // 相对路径：同一份产物既能放在站点根目录，也能放在 GitHub Pages 的 /repo/ 子目录下。
  // 应用使用 hash 路由，页面路径不会变化，因此相对路径是安全的。
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    open: false,
  },
  build: {
    target: 'es2022',
  },
})
