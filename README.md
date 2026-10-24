# DSE 背单词（vocab-share）

香港 DSE English 词汇学习站（可分享）。

**线上地址：** https://lhj77432-ux.github.io/vocab-share/

## 架构

**网站本身即通道**：页面输入 → 免费模型（Puter `google/gemini-3.1-flash-lite`，失败静默回退 Pollinations）→ 页面展示。无单独连接器／插件／玩页。

| 功能 | 行为 |
|------|------|
| 搜索 | 一次返回英译 + 中译 + 例句 |
| 学习 | 免费模型推荐今日学什么，每词下方附造句 |
| 今日推荐 | 词 + 中文意思 + 例句 + 推荐理由（仅 DSE 词表） |
| 归类 | 免费模型归类；打开词条再生成内容 |
| 测验 | 免费模型根据 DSE 词表现场出题 |
| 造句 | 页面直连免费模型造句／点评 |

本地 DSE 核心词表约 500+ 词。推荐不准编假词。尚未接入 vocab-train 小模型权重。

## 本地

```bash
npm install
npm run dev
```

进度存在浏览器 localStorage。分享用「分享」页生成的链接（`?share=` 编码词表）。
