# DSE 背单词（vocab-share）

香港 DSE English 词汇学习站（可分享）。

**线上地址：** https://lhj77432-ux.github.io/vocab-share/

## 主能力：免费 AI 连接器（插件感）

首页／「连接器」页：任意中／英输入 → 自动接免费大模型（Puter `google/gemini-3.1-flash-lite`，失败静默回退 Pollinations）→ 生词、中文意思、英译、造句。**无需选手动模型或填 API key**；可学生成不封顶。

本地 DSE 核心词表约 500+ 词仍保留，用于学习／测验／今日推荐（推荐只从站内词表选，不编假词）。搜索／造句走同一自动链路。

其它功能：收藏／错词本／归类／本周分析／导出 PDF·Word·Excel／分享链接。

## 本地

```bash
npm install
npm run dev
```

进度存在浏览器 localStorage。分享用「分享」页生成的链接（`?share=` 编码词表）。
