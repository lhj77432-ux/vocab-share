# DSE 背单词（vocab-share）

香港 DSE English 词汇学习站（可分享）。

**线上地址：** https://lhj77432-ux.github.io/vocab-share/

功能：学习／测验／错词本／造句／归类／今日推荐／本周分析／导出 PDF·Word·Excel／分享链接；设置里可接「自建模型 API」（OpenAI 兼容，非官方 DeepSeek 聊天）。

## 本地

```bash
npm install
npm run dev
```

进度存在浏览器 localStorage。分享用「分享」页生成的链接（`?share=` 编码词表）。
