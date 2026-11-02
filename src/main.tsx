import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installGlobalErrorHandlers, logger } from './core/logger'
import './styles/global.css'

logger.info('app', '应用启动', {
  地址: window.location.href,
  基础路径: import.meta.env.BASE_URL,
  构建模式: import.meta.env.MODE,
  浏览器: navigator.userAgent,
})
installGlobalErrorHandlers()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
