---
title: 从第一次模型调用到可用 Agent：我的开发学习记录
published: 2026-07-24
description: "根据 LLM_Study 的 Notebook、Git 提交与文件时间，还原我从调用大模型、学习 LangChain 基础，到完成多模态私人厨师 Agent 的开发过程。"
tags: [Agent, LangChain, LangGraph, Python, FastAPI, 学习记录]
category: 开发记录
draft: false
---

这几天我一直在 `LLM_Study` 项目里学习 Agent 开发。最开始，我只是想知道 Python 如何调用大模型；几天后，项目已经变成了一个包含多模态输入、联网搜索、会话记忆、流式响应、图片存储和 React 前端的“私人厨师”应用。

如果只看最终代码，这个过程很容易被压缩成一句话：使用 LangGraph 和 Qwen 做了一个食谱推荐 Agent。但真实的学习路径并不是直接从架构设计开始，而是一层一层遇到问题：

- 模型怎么调用？
- 模型和 Agent 有什么区别？
- 图片应该怎样放进消息？
- Tool 为什么不只是一个普通函数？
- 对话为什么换一次请求就失忆？
- 后端流式输出为什么不能直接交给前端？
- 图片 URL 过期后，历史消息要怎么恢复？
- 一个 Notebook Demo 到底怎样变成一个可以运行的项目？

我根据 Notebook 的文件修改时间，以及 7 月 23 日到 24 日的 Git 提交记录，重新整理了这次学习过程。

## 学习时间线

| 时间 | 学习与开发内容 |
| --- | --- |
| 7 月 20 日晚 | 使用 OpenAI 兼容客户端完成第一次 DeepSeek 模型调用，并开始把密钥迁移到 `.env` |
| 7 月 21 日上午 | 学习 `create_agent`、`invoke`、`stream`，区分模型调用与 Agent 调用 |
| 7 月 21 日晚 | 学习 Message 类型和 Qwen 多模态消息，尝试 URL 图片与本地 Base64 图片 |
| 7 月 22 日上午 | 学习系统 Prompt、提示词结构和 Pydantic 结构化输出 |
| 7 月 22 日中午 | 学习自定义 Tool、参数 Schema 和 Tavily 搜索工具 |
| 7 月 23 日上午 | 从无记忆、内存记忆学到 SQLite 持久化，以及长会话摘要 |
| 7 月 23 日 17:27 | 首次提交完整的私人厨师 Agent，统一 FastAPI 后端与 React 前端 |
| 7 月 23 日 22:11 | 持久化聊天历史，补齐多模态消息恢复 |
| 7 月 23 日 22:28 | 接入 OSS 图片上传、签名刷新和会话图片清理 |
| 7 月 23 日 23:42 | 删除冗余界面与配置逻辑，收紧产品主流程 |
| 7 月 24 日 00:28 | 整理 Python 包、前端目录、Notebook 和测试结构，完成阶段性收尾 |

这条时间线最有意思的地方，是学习内容和项目问题几乎一一对应。当天刚在 Notebook 里理解的概念，很快就在实际应用中暴露出更复杂的版本。

## 第一步：先让模型真正返回一句话

7 月 20 日的 `1.1_HelloWorld.ipynb` 很简单：初始化 OpenAI 兼容客户端，指定 DeepSeek 的 Base URL，发送一组 `system` 与 `user` 消息，再读取 `response.choices[0].message.content`。

这一步没有 Agent、没有 Tool，也没有 Memory，但它让我先建立了最基本的调用模型：

```text
准备凭据 → 创建客户端 → 组织消息 → 发起请求 → 读取响应
```

Notebook 早期版本里还出现过直接写入 API Key 的做法，随后才改成使用 `python-dotenv` 从环境变量加载。这是一个很早、也很重要的教训：**能跑通调用和适合放进项目，是两个不同的标准。**

硬编码密钥可以快速验证接口，却不应该进入源码或 Git 历史。开发 Demo 时为了速度省略的步骤，往往会在项目化阶段变成安全问题。

## 第二步：分清“调用模型”和“运行 Agent”

7 月 21 日上午，我开始从原生客户端转向 LangChain。

在 `2.1_helloworld.ipynb` 中，我定义了第一个天气工具，并通过 `create_agent` 让模型决定是否调用它。紧接着在 `2.2_models.ipynb` 中，我分别练习了模型和 Agent 的 `invoke`、`stream`。

这时我第一次比较清楚地意识到：

- Model 的核心工作是根据上下文生成下一条消息；
- Agent 在模型外面增加了工具选择、工具结果回填和多轮决策循环；
- `invoke` 返回完整结果，适合一次性处理；
- `stream` 返回增量事件，更适合对话产品。

模型的流式调用大致是：

```python
for chunk in model.stream("你是谁？"):
    print(chunk.content, end="", flush=True)
```

Agent 的流式调用则多了一层状态：

```python
for token, metadata in agent.stream(
    {"messages": [{"role": "user", "content": "你是谁？"}]},
    stream_mode="messages",
):
    if token.content:
        print(token.content, end="", flush=True)
```

代码差异并不大，但抽象已经发生了变化。Agent 返回的不只是一个答案，而是一段可能包含 HumanMessage、AIMessage 和 ToolMessage 的执行轨迹。

## 第三步：Message 才是 Agent 的上下文单位

7 月 21 日晚的 `2.3messages.ipynb` 继续补上了 Message 体系。

LangChain 把上下文统一表示为不同角色的消息：

- `SystemMessage` 定义身份和行为约束；
- `HumanMessage` 表示用户输入；
- `AIMessage` 表示模型输出；
- `ToolMessage` 表示工具执行结果。

此前我更习惯把提示词理解成一个字符串；到了这里，我开始把对话理解成一组有角色、有顺序、也可能包含结构化内容的消息。

这个认识很快延伸到了多模态。图片不是一个额外参数，而是 `HumanMessage.content` 中的内容块：

```python
message = HumanMessage(content=[
    {"type": "image", "url": image_url},
    {"type": "text", "text": prompt},
])
```

Notebook 里先测试了在线图片 URL，然后又通过 `ipywidgets` 上传本地文件、转换为 Base64，再交给 Qwen 多模态模型。

当时我关注的是“模型能不能看到图片”。后来做完整项目时才发现，真正困难的问题还包括：图片放在哪里、历史消息如何恢复、临时地址过期怎么办、删除会话时图片由谁回收。

## 第四步：Prompt 从角色扮演变成业务流程

7 月 22 日上午，我在 `2.4prompt.ipynb` 里学习系统 Prompt。

最初的练习只是让模型扮演一个角色，观察加入 `system_prompt` 前后的回答差异。随后 Prompt 开始包含身份、指令、示例和背景，并使用 Markdown 层级组织规则。

这让我逐渐把 Prompt 理解成一种轻量的业务协议，而不只是“让回答听起来更像某个人”。

私人厨师 Agent 的系统 Prompt 最终规定了四个阶段：

1. 识别图片或清单中的食材，并评估新鲜度与可用量；
2. 优先调用 Tavily 搜索相关食谱；
3. 从营养价值和烹饪难度两个维度打分排序；
4. 输出食谱信息、得分、推荐理由和参考图片。

同一个 Notebook 还练习了 Pydantic 结构化输出。它让我意识到，Prompt 可以约束“应该回答什么”，Schema 则约束“回答必须长什么样”。

当前项目的食谱输出仍主要依赖 Prompt，下一步更稳妥的方向，是把最终推荐结果也定义成正式的 Pydantic 模型，减少前端从自然语言中猜测结构的成本。

## 第五步：Tool 的价值是给模型一份可理解的能力契约

7 月 22 日中午的 `2.5_tools.ipynb` 从一个平方根函数开始，随后使用 Pydantic 描述天气工具的复杂参数，最后接入 Tavily 搜索。

普通 Python 函数变成 Tool 后，模型需要理解三件事：

- 工具叫什么；
- 它解决什么问题；
- 调用时需要哪些参数。

所以函数名、Docstring、类型注解和参数 Schema 都不是装饰，它们共同组成了模型看到的接口文档。

私人厨师项目使用了一个配置为最多返回五条结果的 `TavilySearch`，让 Agent 可以基于实际网页信息寻找食谱，而不是完全依赖模型记忆：

```python
web_search = TavilySearch(
    max_results=5,
    topic="general",
)

agent = create_agent(
    model=model,
    tools=[web_search],
    system_prompt=system_prompt,
    checkpointer=checkpointer,
)
```

学到这里，我对 Agent 的理解开始从“会聊天的模型”转向“能够在规则内选择外部能力的运行时”。

## 第六步：Memory 不只是保存聊天文本

7 月 23 日上午的 `2.6_memory.ipynb` 对最终项目影响最大。

Notebook 先做了一个对照实验：第一次告诉模型自己的名字，第二次单独问“我是谁”。没有 Checkpointer 时，两次调用互不相关，模型自然无法记住。

随后我依次练习了：

1. 使用 `InMemorySaver` 保存进程内短期记忆；
2. 使用相同的 `thread_id` 关联多次调用；
3. 使用 `SqliteSaver` 把 Checkpoint 持久化到磁盘；
4. 使用 `SummarizationMiddleware` 压缩过长的消息历史。

最终项目选择了 SQLite：

```python
connection = sqlite3.connect(
    str(CHECKPOINT_DB_PATH),
    check_same_thread=False,
)
checkpointer = SqliteSaver(connection)
checkpointer.setup()
```

每次调用 Agent 时都传入会话 ID：

```python
config = {"configurable": {"thread_id": thread_id}}
```

这时我才真正理解，Memory 至少包含四个问题：

- **身份**：哪几次请求属于同一个会话；
- **存储**：上下文只在内存，还是需要跨重启保留；
- **恢复**：存下来的 LangChain Message 如何转换回前端消息；
- **删除**：用户清空会话时，Checkpoint 和关联资源怎样一起回收。

“模型记得我”只是表面效果，背后其实是一套状态管理。

## 把学习内容做成一个私人厨师 Agent

7 月 23 日 17:27 的第一次 Git 提交，把此前分散在 Notebook 里的内容集中成了一个完整应用：

```text
用户输入文字或食材图片
        ↓
React 对话界面
        ↓
FastAPI / SSE
        ↓
Qwen 多模态 Agent
        ↓
Tavily 搜索食谱
        ↓
流式生成推荐结果
        ↓
SQLite 保存会话状态
```

后端以 FastAPI 提供聊天接口，Agent 使用 Qwen 多模态模型识别食材，并通过 Tavily 搜索食谱。前端使用 React、TypeScript 和 Vite，实现会话列表、图片输入、增量回复与食谱卡片展示。

这一步的重要变化，是我不再只验证单个概念，而是开始面对概念之间的连接问题。

## 流式输出需要整条链路都理解协议

Agent 的 `stream()` 能产生增量消息，不代表浏览器就能直接消费。

项目中的数据要依次经过三层：

```text
LangGraph AIMessageChunk
        ↓
FastAPI 把文本包装成 SSE 事件
        ↓
React 使用 ReadableStream 解析 data 行
```

后端把每个文本增量包装成 JSON：

```python
payload = json.dumps({"delta": chunk}, ensure_ascii=False)
yield f"data: {payload}\n\n"
```

结束时再发送：

```text
data: {"done": true}
```

前端不能假设一次 `reader.read()` 恰好对应一个完整事件。网络分块可能从任意位置切开，所以 `api.ts` 使用 `TextDecoder` 和字符串缓冲区，把尚未结束的半行留到下一次读取。

这是我在项目化过程中形成的另一个认识：**流式不是打开一个开关，而是生产者、传输协议和消费者共同遵守边界。**

## 22:11：第一次重构重点是“历史真的能恢复”

当晚 22:11 的第二次提交名为“持久化聊天历史并优化消息恢复”。

这次修改解决了几个 Demo 阶段容易忽略的问题。

首先，SQLite 路径不能依赖程序从哪个目录启动。代码改为根据源码位置计算绝对路径，避免从不同工作目录运行时连接到不同的 `checkpoint.db`。

其次，多模态消息的 `content` 可能是字符串，也可能是图片与文字组成的列表。恢复历史记录时不能简单执行 `str(msg.content)`，而要逐个识别 `text`、`image` 和 `image_url` 内容块。

最后，前端增加了 localStorage 缓存，用来恢复会话列表、当前选中会话和消息。这里实际上形成了两层状态：

- SQLite Checkpoint 保存 Agent 的真实上下文；
- localStorage 保存前端会话索引与界面缓存。

前端会优先向后端重新拉取消息，后端不可用时才保留本地缓存。对于内联 Base64 图片，则不会写入 localStorage，避免轻易超过浏览器容量限制。

## 22:28：多模态从“传一张图片”升级为资源生命周期

17 分钟后的下一次提交接入了阿里云 OSS。

图片上传接口不仅检查 MIME 类型，还会验证 JPEG、PNG、WebP 和 GIF 的文件头，并限制大小为 10 MB。只有扩展名或 `Content-Type` 正确，并不足以证明内容真的是图片。

上传后，后端返回：

- OSS 对象键；
- 有有效期的签名 URL；
- MIME 类型；
- 文件大小。

这里最关键的设计，是没有把临时签名 URL 当成永久标识。Agent 的 HumanMessage 会额外保存 `oss_object_key`；恢复历史消息时，后端根据对象键重新生成签名 URL。

```text
对象键：稳定身份
签名 URL：临时访问凭证
```

清空会话时，系统不仅删除 SQLite 中的 Checkpoint，还会按会话哈希前缀批量清理 OSS 图片。这样，Memory 与图片不再是两套互不认识的存储。

这一步让我意识到，多模态 Agent 的难点经常不在模型输入格式，而在资源的上传、鉴权、续期、归属和删除。

## 23:42：删除代码也是产品学习的一部分

第三次提交没有继续增加功能，反而删除了大量前端代码：

- 移除运行时 API 配置弹窗；
- 移除 OpenAPI 文档弹窗；
- 移除 Pantry 食材抽屉；
- 简化 Header、Sidebar 和消息展示；
- 增加独立的欢迎页。

这次重构让我看到，学习项目也需要控制主线。功能越多，不代表 Agent 体验越完整；如果配置、文档和辅助面板抢走了主要交互的注意力，维护成本会比学习价值增长得更快。

最终保留下来的主流程更直接：创建会话、输入文字或图片、观看流式回答、恢复历史、删除会话。

## 7 月 24 日：从“能运行的目录”整理成“能继续维护的项目”

7 月 24 日 00:28 的提交主要是结构调整：

- 把拼写错误的 `fronted/` 重命名为 `frontend/`；
- 把根目录的 `cook.py` 移到 `app/agent/cook.py`；
- 把 Notebook 统一移动到 `notebooks/`；
- 把 OSS 测试移动到 `tests/`；
- 为 Python 包补充 `__init__.py`；
- 更新 `langgraph.json`、导入路径和静态资源目录；
- 新增 README，补齐启动方式、技术栈和 API 说明。

这次提交几乎没有改变 Agent 的能力，却显著降低了理解项目的成本。

在 Notebook 阶段，文件放在哪里影响不大；进入完整应用后，目录结构本身就在表达边界：

```text
api/            HTTP 接口
app/agent/      Agent 定义
app/models/     数据契约
app/services/   OSS 等外部服务
frontend/       用户界面
notebooks/      学习实验
tests/          验证代码
resources/      运行时数据
```

我开始意识到，工程结构并不是最后才做的“整理卫生”，而是把自己对系统的理解写进目录。

## 这次学习真正改变了哪些认识

回顾整个过程，我得到的并不只是几个 LangChain API 的用法。

### 1. Agent 是模型、工具、状态与协议的组合

只创建一个 `create_agent()` 很容易，但要形成可用产品，还需要 Tool 契约、会话身份、流式协议和错误处理。模型只是其中最显眼的一层。

### 2. Prompt 适合表达策略，Schema 适合表达边界

Prompt 可以告诉模型“先识别食材，再搜索食谱”，但稳定的参数和输出格式应该尽量交给 Pydantic，而不是完全依赖模型遵守自然语言。

### 3. Memory 的核心是生命周期

保存消息只是开始。还要处理恢复、跨重启、长会话压缩、删除，以及图片等外部资源与会话的归属。

### 4. 多模态首先是数据工程问题

把一张图片塞进 HumanMessage 并不难。难的是图片从浏览器到 OSS、从签名 URL 到模型、从历史记录到重新签名、再到会话删除后的回收。

### 5. 流式体验需要端到端设计

模型流式生成、FastAPI SSE、浏览器分块解析和 React 增量渲染，任何一层处理错误，用户看到的都会是卡顿、乱码或残缺消息。

### 6. 重构不是学习完成后的附属工作

最后两次提交中的“删除冗余”和“整理目录”，其实是在回答同一个问题：这个项目真正要表达什么？当答案更清晰时，代码也会自然收敛。

## 回头看，还需要补上的事情

这个项目已经跑通了完整链路，但仍然保留了学习项目的痕迹。下一步我会优先处理：

1. 为食谱推荐定义正式的结构化输出 Schema；
2. 使用异步 Agent 流式接口，避免同步迭代阻塞 FastAPI 事件循环；
3. 为 Agent、SSE、历史恢复和图片校验补充自动化测试；
4. 明确 SQLite 与 localStorage 的数据一致性策略；
5. 收紧生产环境 CORS，而不是长期允许任意来源；
6. 增加搜索结果引用和失败降级的可观测信息；
7. 清理 Notebook 与 Git 历史中的敏感凭据，并轮换曾经暴露过的密钥。

尤其是最后一点：学习初期为了快速验证而写进 Notebook 的密钥，即使后来改用了 `.env`，也不代表旧内容自动消失。**密钥一旦进入源码或提交历史，就应该按已经泄露处理。**

## 结语

从 7 月 20 日的第一条模型回复，到 7 月 24 日凌晨整理完项目结构，这次学习最明显的变化，是问题的尺度不断扩大。

一开始我问的是：“怎样调用模型？”

后来问题变成了：“怎样让模型使用工具、记住上下文并理解图片？”

最后真正面对的是：“怎样让一个 Agent 的状态、资源、协议和用户界面一起可靠地工作？”

这也是我目前对 Agent 开发最直接的理解：它不是在普通应用旁边加一个聊天框，而是把不确定的模型能力放进一套确定的工程边界里。Notebook 帮我认识了每一个零件，私人厨师项目则让我第一次看到这些零件如何组成一个完整系统。
