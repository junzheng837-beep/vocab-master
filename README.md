# 单词 · 英语背单词

一个 macOS 风格的英语背单词应用。纯前端，数据存在浏览器本地，支持 8 本内置词书和自定义导入。

**在线使用**：https://junzheng837-beep.github.io/vocab-master/
**下载离线版**：https://github.com/junzheng837-beep/vocab-master/releases/latest

## 功能

- **8 本内置词书**：初中英语（1282）、高中英语（3299）、高考高频（800）、大学四级（3763）、四级高频（1000）、大学六级（5307）、考研英语（4736）、生活日常用语（815，按 12 个场景分组）
- **闪卡式背诵**：先只看英文单词，点击下方或按空格才显示释义、音标、例句、短语、词根词缀
- **四档评分**：`0` 待会再来（本轮重排）/ `1` 困难（1 天）/ `2` 一般（3 天）/ `3` 容易（7 天，连续答对时间隔递增）
- **自定义词库**：粘贴单词即可导入，内置词库里有的会自动补上音标、释义、例句
- **学习统计**：连续打卡、20 周热力图、未来 7 天复习量预测、评分分布
- **一键重置今天**：把今天学过的词全部退回，重新背一遍，不影响其他日期
- **调试日志**：`#/debug` 页面可查看每一步执行记录并导出

## 快捷键

| 按键 | 作用 |
| --- | --- |
| `空格` | 显示释义 |
| `←` `→` | 切换单词 |
| `0` `1` `2` `3` | 评分 |

## 本地运行

```bash
npm install
npm run dev        # 开发服务器 http://localhost:5173
npm run build      # 构建到 dist/
npm run preview    # 预览构建产物
```

## 词库构建

内置词库由 `data/build_dict.py` 从以下开源数据生成：

- [ECDICT](https://github.com/skywind3000/ECDICT) — 77 万词条的英汉词典，提供音标、释义、考纲标签、词根词缀
- [kajweb/dict](https://github.com/kajweb/dict) — 81 本词书，提供例句、短语、近义词

```bash
# 先把数据源放到 data/raw/
#   ecdict.csv、wordroot.txt、*.zip
python data/build_dict.py
```

产物写入 `public/data/`：

| 文件 | 说明 |
| --- | --- |
| `books/*.json` | 各词书词条，按需加载 |
| `manifest.json` | 词书清单 |
| `lookup.json` | 2.6 万词的查词索引，导入时用 |
| `examples.json` | 例句/短语/词根索引，导入时给自建词补全 |

## 部署

### GitHub Pages

推送到 `main` 分支后，`.github/workflows/deploy.yml` 会自动构建并部署。
首次使用需在仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。

访问地址：`https://<用户名>.github.io/<仓库名>/`

### 打包下载

打 tag 即可触发 `.github/workflows/release.yml`，自动构建 zip 并创建 Release：

```bash
git tag v0.3.0
git push origin v0.3.0
```

下载链接出现在仓库的 Releases 页面。

### 自有服务器

`npm run build` 后把 `dist/` 里的文件丢到网站目录即可。产物使用相对路径，放在根目录或子目录都能正常工作。

## 数据存储

所有数据保存在浏览器的 IndexedDB（库名 `vocab-master`）里，不上传任何服务器。
清除浏览器数据会一并清空学习记录，重要进度请勿只留在一台设备上。

## 技术栈

Vite 7 · React 19 · TypeScript · 无 UI 框架、无路由库（hash 路由手写）
