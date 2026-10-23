# DSE 背单词（vocab-share）

香港 DSE English 词汇学习站（可分享）。

**线上地址：** https://lhj77432-ux.github.io/vocab-share/

站内核心词表约 500+ 词（DSE 写作／话题向）。每日推荐、搜索（中译＋英译）、一键造句默认走免费大模型 Puter.js `google/gemini-3.1-flash-lite`（失败静默回退 Pollinations）；推荐只从站内 DSE 词表挑选，不编假词。

其它功能：学习／测验／错词本／归类／本周分析／导出 PDF·Word·Excel／分享链接。

## 本地

```bash
npm install
npm run dev
```

进度存在浏览器 localStorage。分享用「分享」页生成的链接（`?share=` 编码词表）。
