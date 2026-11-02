# 拾词易记

> 拾起每一个词，记得更久

一款 macOS 风格的英语背单词软件。桌面端 + 网页端同一套代码，数据存在本机，支持账号隔离与自定义词库导入。

**官网**：https://junzheng837-beep.github.io/vocab-master/
**在线使用**：https://junzheng837-beep.github.io/vocab-master/app/
**下载安装**：https://github.com/junzheng837-beep/vocab-master/releases/latest

![背单词界面](site/assets/shot-study.png)

## 功能

- **8 本内置词书，23000 词**：初中英语（1282）、高中英语（3299）、高考高频（800）、大学四级（3763）、四级高频（1000）、大学六级（5307）、考研英语（4736）、生活日常用语（815，按 12 个场景分组）
- **闪卡式背诵**：进入只显示英文单词，点击下方空白或按空格才展开音标、释义、例句、短语、词根词缀
- **四档评分**：`0` 待会再来（本轮重排）/ `1` 困难（1 天）/ `2` 一般（3 天）/ `3` 容易（7 天，连续答对时间隔递增至 120 天）
- **错词本**：评过「没记得」和「困难」的词自动归集，可以单独抽出来集中刷
- **拼写练习**：背单词时把想练的词加入拼写列表，在「拼写练习」页只给中文释义从零拼写；提示分三级——首字母+后缀 → 首尾字母 → 完整答案，拼对后展示音标、例句、词根
- **词根词缀专项**：605 个词根词缀，219 个带中文释义，点开任意词根就能背它的例词
- **自定义词库**：粘贴单词即可导入，内置词库里有的自动补全音标、释义、例句、词根；`# 分组名` 可以做二级分组
- **顺序可选**：自定义词库可以按导入顺序背，也可以每次随机打乱
- **账号体系**：注册登录后，自建词库与学习记录归属账号，切换账号互不影响；游客数据在注册时自动并入
- **学习统计**：连续打卡、20 周热力图、未来 7 天复习量预测、评分分布
- **一键重置今天**：把今天学过的词全部退回重来，不影响其他日期
- **更新通知**：桌面端自动检测新版本并一键更新，网页端顶部提示
- **调试日志**：`#/debug` 页面查看每一步执行记录，支持导出

## 快捷键

| 按键 | 作用 |
| --- | --- |
| `空格` | 显示释义 |
| `←` `→` | 切换单词 |
| `0` `1` `2` `3` | 评分 |

## 开发

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

产物写入 `public/data/`：`books/*.json`（词书）、`manifest.json`（清单）、`lookup.json`（2.6 万词查词索引）、`examples.json`（例句/短语/词根，给自建词补全用）、`roots.json`（605 个词根词缀及例词）。
常见词根的中文释义维护在 `data/root_cn.py`。

## 数据与账号说明

- 数据保存在本机（浏览器 IndexedDB / 桌面端内置 Chromium 的存储目录），不上传任何服务器
- 密码使用随机盐 + SHA-256 存储，明文不落盘
- 账号按命名空间隔离：`u:<userId>:*` 为账号数据，`g:*` 为游客数据
- 微信 / QQ / 手机号登录需要企业资质与短信服务商，暂未接入；账号层已做成可替换的 Provider，后续接入不影响已有数据
- 跨设备同步依赖云端服务，尚未开通

## 技术栈

Vite 7 · React 19 · TypeScript · Electron 45 · electron-builder
无 UI 框架、无路由库（hash 路由手写）
