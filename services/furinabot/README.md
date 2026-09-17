# FurinaBot Server

## 站点集成

FurinaBot 每次发送消息时读取当前页面标题和路径，可回答“当前页面是什么”。文章页仍从公开文章索引读取正文与可信标题；404 页不提供页面上下文。页面标题和路径仅用于识别页面，不视为可信正文或指令。

FurinaBot 的站点侧设置统一放在 `services/furinabot/site-config.ts`，包括功能开关、聊天 API、文章标识，以及 Live2D 模型路径、Cubism Core 地址、位置和尺寸。前端组件位于 `services/furinabot/web/`，页面只需在 `src/layouts/Layout.astro` 挂载 `web/FurinaBotIntegration.astro`。文章页在 `src/pages/posts/[...slug].astro` 输出公开文章标识，供聊天上下文使用。

模型静态文件位于 `public/furinabot/live2d/Furina/`，与通用 Pio 资源分开。开发代理配置位于 `services/furinabot/dev-proxy.mjs`，由 `astro.config.mjs` 引入；生产代理仍需将 `/api/agent` 转发到 Python 服务。构建索引的脚本位于 `services/furinabot/build/`，由根目录的 `package.json` 调用。更新上游主题时，通常只需检查这些少量接入点。

需要 Python 3.12。首次运行：

```bash
uv sync
copy .env.example .env
uv run uvicorn app.main:app --reload --port 8000
```

在 `.env` 中填写服务端使用的 `LLM_API_KEY`。开发时也可通过环境变量覆盖配置。默认模型是 `gpt-5.6-luna`，默认地址是 OpenAI API；自定义 `LLM_BASE_URL` 的服务需要支持 Responses API 的流式事件。`LLM_MAX_OUTPUT_TOKENS` 控制每次回复的输出 token 上限，默认 `32768`，可在 `.env` 中改为所需的正整数；该上限包含模型推理 token。`/health` 和 `/docs` 可用于检查后端启动状态。

`LLM_SYSTEM_PROMPT` 可在 `.env` 中调整芙宁娜的说话风格和回答规则；未设置时使用代码中的默认提示词。修改 `.env` 后需重启后端。

## 用户输入审核

设置 `ALIYUN_GUARD_ENABLED=true` 后，FurinaBot 会在检索和模型请求前调用阿里云 AI 安全护栏的 `query_security_check_pro`。在后端 `.env` 中填写 `ALIBABA_CLOUD_ACCESS_KEY_ID`、`ALIBABA_CLOUD_ACCESS_KEY_SECRET`、`ALIYUN_GUARD_REGION` 和对应的 `ALIYUN_GUARD_ENDPOINT`。只发送用户消息正文，不发送文章或模型回复。阿里云建议 `pass` 时放行，`block`、`watch`、`mask` 时拒绝；审核服务失败或返回无法识别的结果时也不调用模型。启用后单条消息最多 2000 字。修改 `.env` 后重启后端。审核调用可能按量计费。

## 聊天协议

`POST /api/agent/chat` 接受 JSON：

```json
{"message":"这篇文章讲什么？","context":{"articleId":"cloudflare-r2","title":"页面标题","url":"/posts/cloudflare-r2/"}}
```

返回 `text/event-stream`，事件顺序为 `message.start`（包含 `messageId`）、多个 `message.delta`（包含 `text`）、`message.done`。生成失败时发送 `error`（包含 `code` 和 `message`），不再发送 `message.done`。客户端中断连接时，后端会取消上游流。

`session_id` 不保存会话。构建会生成 `dist/ai/articles.json` 和公开文章正文；服务端通过 `FURINAFANS_CONTENT_DIR` 读取它们，本地从 `services/furinabot` 运行时默认使用 `../../dist/ai`，生产环境可设为 `/var/www/Furinafans/ai`。草稿和密码文章均不进入索引。页面标题和 URL 不被当作可信正文。密钥只在服务端使用，`.env` 已被 Git 忽略。

## 检索层

构建还会从公开文章 JSON 生成 `dist/ai/chunks.json`，chunk 带稳定 ID、文章 ID、标题、URL、章节、标签和日期。当前文章问题继续直接使用正文；文章目录问题使用 metadata；跨文章问题从 chunk 做关键词检索，并在向量缓存可用时合并向量结果、重新排序，最多送入 5 段。SSE 会发送 `retrieval.start`、`retrieval.result` 和 `message.sources`，前端据此展示检索状态与来源链接。

可选的 embedding 缓存在服务端独立维护。设置 `EMBEDDING_API_KEY`（未设置时使用 `LLM_API_KEY`）、`EMBEDDING_BASE_URL`、`EMBEDDING_MODEL` 后，在 `services/furinabot` 运行：

```bash
uv run python -m app.rebuild_vectors
```

默认 SQLite 路径为 `data/vectors.sqlite3`，可由 `FURINABOT_VECTOR_DB` 覆盖。命令仅为新增或变化的 chunk 重新生成 embedding，并删除已移除的 chunk。每次站点部署新文章索引后运行此命令；向量服务不可用时，聊天会自动回退关键词检索。向量缓存是文章 JSON 的派生数据，不应手工维护。

```bash
uv run pytest -q
```
