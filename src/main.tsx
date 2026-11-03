import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installGlobalErrorHandlers, logger } from './core/logger'
import { applyDeviceAttrs } from './core/device'
import './styles/global.css'

const device = applyDeviceAttrs()

logger.info('app', '应用启动', {
  地址: window.location.href,
  基础路径: import.meta.env.BASE_URL,
  构建模式: import.meta.env.MODE,
  设备: device,
  触摸: document.documentElement.dataset.touch,
  视口: `${window.innerWidth}×${window.innerHeight}`,
  浏览器: navigator.userAgent,
})
installGlobalErrorHandlers()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
