# FurinaBot Server

需要 Python 3.12。首次运行：

```bash
uv sync
copy .env.example .env
uv run uvicorn app.main:app --reload --port 8000
```

在 `.env` 中填写服务端使用的 `LLM_API_KEY`。开发时也可通过环境变量覆盖配置。默认模型是 `gpt-5.6-luna`，默认地址是 OpenAI API；自定义 `LLM_BASE_URL` 的服务需要支持 Responses API 的流式事件。`/health` 和 `/docs` 可用于检查后端启动状态。

## 聊天协议

`POST /api/agent/chat` 接受 JSON：

```json
{"message":"这篇文章讲什么？","context":{"articleId":"cloudflare-r2","title":"页面标题","url":"/posts/cloudflare-r2/"}}
```

返回 `text/event-stream`，事件顺序为 `message.start`（包含 `messageId`）、多个 `message.delta`（包含 `text`）、`message.done`。生成失败时发送 `error`（包含 `code` 和 `message`），不再发送 `message.done`。客户端中断连接时，后端会取消上游流。

`session_id` 不保存会话。构建会生成 `dist/ai/articles.json` 和公开文章正文；服务端通过 `FURINAFANS_CONTENT_DIR` 读取它们，本地从 `services/furinabot` 运行时默认使用 `../../dist/ai`，生产环境可设为 `/var/www/Furinafans/ai`。草稿和密码文章均不进入索引。页面标题和 URL 不被当作可信正文。没有向量库、数据库或 Agent Tool。密钥只在服务端使用，`.env` 已被 Git 忽略。

```bash
uv run pytest -q
```
