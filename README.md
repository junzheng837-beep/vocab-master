# 拾词易记

> 拾起每一个词，记得更久

一款 macOS 风格的英语背单词软件。网页端、Windows 桌面端、Android 手机端同一套代码，
数据存在本机，支持账号隔离与自定义词库导入。

**官网**：https://junzheng837-beep.github.io/vocab-master/
**在线使用**：https://junzheng837-beep.github.io/vocab-master/app/
**Windows**：https://github.com/junzheng837-beep/vocab-master/releases/latest/download/shici-setup.exe
**Android**：https://github.com/junzheng837-beep/vocab-master/releases/latest/download/shici-android.apk

![背单词界面](site/assets/shot-study.png)

## 功能

- **8 本内置词书，23000 词**：初中英语（1282）、高中英语（3299）、高考高频（800）、大学四级（3763）、四级高频（1000）、大学六级（5307）、考研英语（4736）、生活日常用语（815，按 12 个场景分组）
- **闪卡式背诵**：进入只显示英文单词，点击下方空白或按空格才展开音标、释义、例句、短语、词根词缀
- **四档评分**：`0` 待会再来（本轮重排）/ `1` 困难（1 天）/ `2` 一般（3 天）/ `3` 容易（7 天，连续答对时间隔递增至 120 天）
- **错词本**：评过「没记得」和「困难」的词自动归集，可以单独抽出来集中刷
- **拼写练习**：背单词时把想练的词加入拼写列表，在「拼写练习」页只给中文释义从零拼写；提示分四级——读音（音标+朗读）→ 骨架（词缀或首尾字母）→ 前半段 → 完整答案，拼对后展示音标、例句、词根
- **拼写库**：内置「高中英语作文写作高频词」（218 词，按 8 类作文表达分组）和「四级高频词语」（1000 词），可整本或按分组加入拼写练习
- **首字母词库**：26 个字母各成一库，可选「公共词库」（7064 词，全部内置词书去重）或「我学过的」，点任意字母只背该字母开头的单词
- **词库预览**：每本词书都能先翻一遍全部单词，支持按单词或中文释义搜索
- **词根词缀专项**：605 个词根词缀，219 个带中文释义，点开任意词根就能背它的例词
- **自定义词库**：粘贴单词即可导入，内置词库里有的自动补全音标、释义、例句、词根；`# 分组名` 可以做二级分组
- **顺序可选**：自定义词库可以按导入顺序背，也可以每次随机打乱
- **账号体系**：注册登录后，自建词库与学习记录归属账号，切换账号互不影响；游客数据在注册时自动并入
- **学习统计**：连续打卡、20 周热力图、未来 7 天复习量预测、评分分布
- **一键重置今天**：把今天学过的词全部退回重来，不影响其他日期
- **发音**：优先用系统语音合成（离线可用）；微信内置浏览器不支持 Web Speech，会自动改用有道词典的在线发音，需要联网
- **手机 / 平板自适应**：自动识别设备，手机上侧栏换成底部标签栏、词书卡片单列、拼写与预览全屏化，电脑上保持窗口式布局
- **更新通知**：桌面端自动检测新版本并一键更新，网页端顶部提示

## 快捷键

| 按键 | 作用 |
| --- | --- |
| `空格` | 显示释义 |
| `←` `→` | 切换单词 |
| `0` `1` `2` `3` | 评分 |

## 开发

### 调试日志

界面上不暴露日志入口，开发时直接访问 `#/debug`（例如
`http://localhost:5173/#/debug`）即可查看每一步执行记录，支持按级别筛选、
搜索、查看 JSON 详情和导出 txt。控制台里同一份日志带 `[vocab:模块名]` 前缀。

日志覆盖：启动 → 存储驱动 → 本地数据载入 → 词书加载 → 会话构建 →
每次评分 → 存储写入 → 导入识别与保存 → 重置，未捕获异常也会记录。

```bash
npm install
npm run dev            # 开发服务器 http://localhost:5173
npm run build          # 构建官网（dist/）+ 应用（dist/app/）
npm run electron:start # 用已构建的产物启动桌面端
npm run electron:dev   # 构建并启动桌面端
```

### 桌面端打包

```bash
npm run dist       # 生成 Windows 安装包到 release/
npm run dist:dir   # 只生成免安装目录，用于本地调试
```

国内网络下载 Electron / NSIS 较慢时可加镜像：

```bash
ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" \
ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/" \
npm run dist
```

## 安卓版

手机端用 [Capacitor](https://capacitorjs.com) 把同一份 `dist/app` 套进原生 WebView，
界面和手机网页版完全一致，只是多了应用图标、启动图和全屏。

```bash
npm run android:apk     # 本地打包，需要 JDK 17 + Android SDK
```

- 包名 `com.shici.vocab`，minSdk 22（Android 5.0+），compileSdk 34，锁定竖屏
- 图标和启动图放在 `resources/`，改完执行 `npm run android:assets` 重新生成
- 签名用仓库里的自签名证书（`android/keystore/`），提交它是为了让每次构建签名一致，
  用户才能覆盖安装升级；这是个人项目的自签名证书，不是需要保密的凭据
- 发版时 CI 会自动构建并上传 `shici-android.apk`，文件名固定，官网用永久链接

## 发布流程

推送 `main` 分支会自动构建并部署到 GitHub Pages（官网在根路径，应用在 `/app/`）。

打 tag 会自动构建 Windows 安装包并创建 Release：

```bash
git tag v0.4.0
git push origin v0.4.0
```

安装包文件名固定为 `shici-setup.exe`，因此官网的下载链接是永久链接，不需要随版本变化：

```
https://github.com/junzheng837-beep/vocab-master/releases/latest/download/shici-setup.exe
```

## 项目结构

```
electron/         桌面端主进程与 preload
src/core/         业务核心：调度、存储、账号、日志、更新检查
src/pages/        页面
src/components/   组件
site/             官网静态页
scripts/          构建脚本
data/             词库构建脚本（从开源词典生成 public/data）
public/data/      构建产出的词库数据
```

## 词库数据

内置词库由 `data/build_dict.py` 从以下开源数据生成：

- [ECDICT](https://github.com/skywind3000/ECDICT) — 77 万词条英汉词典，提供音标、释义、考纲标签、词根词缀
- [kajweb/dict](https://github.com/kajweb/dict) — 81 本词书，提供例句、短语、近义词

```bash
# 数据源放到 data/raw/：ecdict.csv、wordroot.txt、*.zip
python data/build_dict.py
```

产物写入 `public/data/`：`books/*.json`（词书）、`manifest.json`（清单）、`dict/<两字母>.json`（2.6 万词查词字典，按前两个字母分片，导入时按需加载）、`roots.json`（605 个词根词缀及例词）、`spell.json`（拼写库）、`letters/*.json`（首字母库）。
常见词根的中文释义维护在 `data/root_cn.py`。

## 数据与账号说明

- 数据默认保存在本机（浏览器 IndexedDB / 桌面端内置 Chromium 的存储目录）
- 配置云服务后，账号数据会在本机与云端之间自动同步。本地始终是主存储：
  写入先落本地再异步上传，断网、服务慢都不影响背单词
- 本地模式下密码用随机盐 + SHA-256 存储；云端模式下由 Supabase Auth 托管
- 账号按命名空间隔离：`u:<userId>:*` 为账号数据，`g:*` 为游客数据
- 微信 / QQ / 手机号登录需要企业资质与短信服务商，暂未接入；账号层已做成可替换的 Provider，后续接入不影响已有数据
- 跨设备同步的配置方法见 [docs/云同步配置.md](docs/云同步配置.md)。未配置时应用自动运行在纯本地模式，功能不受影响

## 技术栈

Vite 7 · React 19 · TypeScript · Electron 45 · electron-builder
无 UI 框架、无路由库（hash 路由手写）
