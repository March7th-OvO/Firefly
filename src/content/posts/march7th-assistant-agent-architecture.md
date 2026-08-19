---
title: 从自然语言到可控自动化：March7thAssistant Agent 模块架构实践
published: 2026-07-26
description: "拆解 March7thAssistant Agent 模块如何通过原子工具、独立 Worker、状态机与跨进程锁，把大模型的自然语言编排转化为安全、可观测、可停止的游戏自动化任务。"
tags: [Agent, LangChain, LangGraph, Python, 游戏自动化]
category: 技术分享
draft: false
---

给一个成熟的自动化项目接入大模型，最容易想到的方案是：把已有函数包装成工具，然后交给模型调用。

这个方案能很快跑起来，但离“可用”还有很远。游戏自动化不是普通的信息查询：两个任务同时操作窗口会相互干扰，后台循环需要随时查询和停止，模型生成的参数不能直接信任，进程异常退出后还不能留下失控的鼠标、键盘或 OCR 子进程。更重要的是，模型说“已经完成”和任务真正执行成功，必须是两件有明确边界的事。

March7thAssistant 的 Agent 模块因此没有把大模型放进底层自动化逻辑，而是把它设计成一个**受约束的自然语言编排器**：

- 大模型负责理解意图、安排原子任务顺序；
- 工具层负责把模型调用翻译成稳定的任务协议；
- 执行层负责校验、隔离、启动和回收 Worker；
- 原有任务系统继续负责 OCR、输入控制和具体业务逻辑。

这篇文章将从一次请求的完整链路出发，拆解 `app/agent` 的设计思路，以及这个架构如何处理并发、安全、后台任务和旧系统复用。

## 一、先看全局：Agent 不是执行器，而是编排器

整个模块可以概括为下面这条链路：

```text
玩家
  │  自然语言
  ▼
GUI / CLI
  │  thread_id + message
  ▼
LangGraph Agent
  │  选择一个原子工具
  ▼
LangChain Tools
  │  task_id + 结构化参数
  ▼
TaskExecutor
  │  校验、创建执行目录、启动子进程
  ▼
Task Worker / Background Worker
  │  获取跨进程锁、复查环境
  ▼
Task Registry
  │  动态解析 handler
  ▼
March7thAssistant 原有任务系统
```

后台任务还多出一条控制链路：

```text
get_task_status / stop_task
              │
              ▼
          JobManager
              │
              ├── 读取 result.json
              ├── 写入 stop.requested
              ├── 发送中断信号
              └── 必要时清理整棵进程树
```

这套分层刻意把“理解用户想做什么”和“真正控制游戏”分开。模型永远不会直接操作鼠标、键盘或 OCR；它只能从审核过的原子工具集合中做选择。

## 二、Agent 的创建：模型可替换，执行纪律不可替换

`app/agent/agent.py` 负责组装 Agent。它主要完成四件事：

1. 从项目配置读取模型名和 API Base URL；
2. 从 Windows 凭据管理器读取 API Key；
3. 注册 Agent 可见的工具集合；
4. 使用内存 Checkpointer 保存同一会话的上下文。

默认模型配置指向兼容 OpenAI 接口的 DeepSeek 服务，但调用方仍可在 YAML 配置中替换模型名和 Base URL。对上层 Agent 来说，模型供应商是可替换依赖；对下层执行系统来说，模型最终都只能调用同一组受控工具。

```python
model = init_chat_model(
    model=model_name,
    model_provider="openai",
    base_url=base_url,
    api_key=api_key,
)

return create_agent(
    model=model,
    tools=AGENT_TOOLS,
    system_prompt=SYSTEM_PROMPT,
    checkpointer=InMemorySaver(),
    middleware=[force_serial_tool_calls],
)
```

这里有一个看似很小、实际非常关键的中间件：`force_serial_tool_calls` 会把 `parallel_tool_calls` 强制设为 `False`。

大模型常常会为了降低延迟并行调用互不依赖的工具。对于搜索、查询类工具，这通常是优化；但对游戏自动化来说，“启动游戏”“领取奖励”“刷副本”都可能争用同一个窗口和输入设备。即使模型认为两个任务没有依赖，它们在物理执行环境中仍然互斥。

因此，串行不是性能妥协，而是领域约束。

## 三、工具层：把自然语言收敛成原子协议

`app/agent/tools.py` 是模型与执行系统之间的边界。它没有暴露一个万能的 `run(command)`，而是提供一组语义清晰的原子工具，例如：

- `start_game`、`exit_game`；
- `complete_daily_training`、`clear_trailblaze_power`；
- `farm_instance`、`farm_overworld`；
- `run_currency_wars`、`loop_currency_wars`；
- `run_divergent_universe`、`loop_divergent_universe`；
- `get_task_status`、`stop_task`。

每个工具内部只做轻量适配，最终统一调用：

```python
task_executor.execute(task_id, params)
```

这种设计有两个好处。

第一，模型看到的是稳定的业务语义，而不是底层类名、页面坐标或内部脚本入口。底层实现以后可以重构，只要 `task_id` 和返回协议不变，Prompt 与模型工具定义就不必跟着变化。

第二，工具返回的是结构化对象，而不是一段 JSON 字符串。所有结果统一为 `TaskResult`：

```python
class TaskResult(BaseModel):
    task_id: str
    execution_id: str
    status: TaskStatus
    message: str
    duration_seconds: float = 0
    data: dict[str, Any] = Field(default_factory=dict)
```

模型可以稳定读取 `status`、`execution_id` 和 `data`，不用再次从自然语言中猜测任务是否成功。尤其对后台任务而言，`running` 只代表 Worker 已完成启动握手，绝不等价于 `completed`。

## 四、注册表：复用旧任务系统，而不是重写一套自动化

`app/agent/registry.py` 维护 `task_id` 到 `TaskSpec` 的映射：

```python
@dataclass(frozen=True, slots=True)
class TaskSpec:
    task_id: str
    handler_path: str
    requires_game: bool = True
    background: bool = False
    destructive: bool = False
    exposed_to_agent: bool = False
```

一个任务规范不仅指出 handler 在哪里，还声明了它的运行属性：

- `requires_game`：执行前是否要求游戏已经启动；
- `background`：是否使用后台循环 Worker；
- `destructive`：是否具有破坏性；
- `exposed_to_agent`：是否允许模型调用。

注册表中的 handler 使用 `"module.path:function"` 字符串保存，并在 Worker 真正执行时再动态导入。这样可以避免 Agent 启动阶段一次性加载 OCR、游戏控制器和全部任务模块，也让 CLI 与 Agent 共用同一份任务目录。

`exposed_to_agent` 是一道重要的白名单。调试任务、接管任务和部分挑战任务即使存在于注册表中，也不会自动出现在模型工具面板里。**“系统能够执行”不等于“允许模型执行”。**

## 五、TaskExecutor：真正的信任边界

`app/agent/task_executor.py` 是整套设计的核心。它不负责组合多个任务，只负责保证一次原子任务以可控方式开始、运行并返回结果。

一次 `execute()` 大致经过以下步骤：

1. 为本次执行生成唯一的 `execution_id`；
2. 从注册表读取 `TaskSpec`；
3. 检查任务是否对当前调用方开放；
4. 使用 Pydantic 和领域目录校验参数；
5. 检查当前应用进程是否已有后台任务；
6. 对需要游戏的任务做一次启动状态预检；
7. 写入 Worker 请求文件并启动独立进程；
8. 等待同步结果，或等待后台 Worker 的 `running` 握手。

执行目录位于系统临时目录中，并按安装路径生成隔离标识：

```text
%TEMP%/March7thAssistant/<installation-id>/executions/<execution-id>/
├── request.json
├── result.json
└── stop.requested
```

`request.json` 保存任务 ID、执行 ID、参数和父进程 PID；`result.json` 是 Worker 对外发布状态的唯一结果文件；`stop.requested` 则是后台任务的协作停止信号。

选择文件协议而不是把任务直接放在线程里，有几个现实收益：

- Worker 崩溃不会直接破坏 GUI 或 Agent 会话进程；
- 同一协议同时适配源码运行和 PyInstaller 冻结版本；
- 请求、结果和停止信号天然可检查，便于定位现场问题；
- 父进程可以在失去正常响应时清理整个子进程树。

## 六、为什么必须使用独立 Worker

游戏自动化往往会加载 OCR、图像识别、输入模拟以及具有全局状态的旧模块。这些逻辑如果直接运行在 Agent 主进程中，会带来三个问题：

1. 长任务会阻塞对话和界面；
2. 异常可能污染后续会话状态；
3. 停止任务时很难判断还遗留了哪些派生进程。

因此，同步任务由 `task_worker.py` 执行，循环任务由 `background_worker.py` 执行。

Worker 启动后不会立刻调用业务 handler，而是再次完成三项检查：

1. 解析任务规范和 handler；
2. 获取跨进程自动化锁；
3. 对需要游戏的任务复查游戏状态。

父进程的预检改善了错误反馈，Worker 的复查则关闭了检查与执行之间的竞态窗口。即使游戏在父进程检查之后、Worker 执行之前被关闭，任务也会以 `rejected` 结束，而不是盲目操作桌面。

结果文件采用“写临时文件，再用 `os.replace` 原子替换”的方式更新。父进程因此只会读到旧的完整状态或新的完整状态，不会撞上写到一半的 JSON。

## 七、三层串行保证：模型、进程与安装实例

单独关闭模型并行调用仍然不够。用户可能同时打开 GUI 和 CLI，也可能有不同进程绕过同一个 Agent 会话发起任务。March7thAssistant 使用了三层互补的互斥机制：

| 层级 | 实现 | 解决的问题 |
| --- | --- | --- |
| 模型层 | `parallel_tool_calls=False` | 防止一次模型回复并行发起多个工具 |
| 进程内 | `JobManager` 活跃任务检查 | 防止同一应用进程在后台任务运行时启动新任务 |
| 安装级 | `AutomationLock` 跨进程锁 | 防止 GUI、CLI 或其他进程同时控制同一安装实例 |

`AutomationLock` 在 Windows 上使用命名 Mutex，在 POSIX 系统上使用 `flock`。锁名包含项目安装路径的哈希，因此同一安装实例互斥，不同安装目录之间又不会无故互相阻塞。

锁的拥有者信息会额外写入 `automation-lock-owner.json`，记录 `execution_id`、`task_id` 和 PID。竞争者拿不到锁时，可以返回阻塞自己的执行 ID，而不是只给出一句模糊的“资源忙”。

这三层约束体现了一个通用原则：**模型行为限制只能提升正确率，真正的互斥必须落在执行基础设施上。**

## 八、后台任务：先握手，再交还控制权

循环刷取类任务不能让一次 Agent 调用永久阻塞。后台 Worker 因此使用了显式握手协议。

启动过程如下：

```text
TaskExecutor             Background Worker             JobManager
     │                           │                          │
     │──── 创建请求并启动 ──────>│                          │
     │                           │── 获取自动化锁           │
     │                           │── 写入 RUNNING 结果      │
     │<──── 轮询 result.json ────│                          │
     │──── 注册运行中任务 ────────────────────────────────>│
     │<──── 返回 execution_id ─────────────────────────────│
```

只有同时满足“结果文件为 `running`”和“Worker 进程仍存活”时，父进程才会向模型返回启动成功。如果 Worker 在握手前退出，或者在超时时间内没有发布状态，`TaskExecutor` 会终止进程树并返回 `failed`。

这避免了一个常见谎言：子进程刚刚 `Popen` 成功，业务却根本没有开始，系统已经向用户宣称“后台任务正在运行”。

后台 Worker 还会监控父进程 PID。Agent 会话异常退出时，它会清理自己的派生进程并退出，防止孤儿任务继续控制游戏。

## 九、JobManager：控制面不参与自动化锁竞争

`JobManager` 管理当前应用进程启动的后台作业。它只维护进程、状态和结果文件，不执行游戏操作，因此查询和停止任务不需要获取自动化锁。

这一区分非常重要：

- 数据面任务需要独占游戏自动化资源；
- 控制面操作必须在数据面占锁时依然可用。

否则就会出现一个悖论：后台任务持有自动化锁，而“停止后台任务”也要先获得同一把锁，最终谁也停不下来。

停止任务采用逐级升级策略：

1. 创建 `stop.requested`，给 Worker 协作退出的机会；
2. 超时后发送 `CTRL_BREAK_EVENT` 或 `SIGINT`；
3. 仍未退出时，使用 `psutil` 终止整棵进程树。

温和停止可以让业务逻辑完成必要清理，信号停止处理卡住的 Python 代码，进程树清理则兜住 OCR 或自动化模块派生的子进程。

## 十、状态机：终态一旦确定，就不能被晚到事件覆盖

任务状态共有六种：

| 状态 | 含义 |
| --- | --- |
| `running` | Worker 已握手，任务仍在运行 |
| `completed` | 业务执行成功 |
| `failed` | Worker 或业务执行失败 |
| `rejected` | 任务存在，但参数或环境不允许启动 |
| `stopped` | 任务被用户或会话主动停止 |
| `not_found` | 任务 ID 或控制面执行 ID 不存在 |

已经开始的任务只允许从 `running` 转移到 `completed`、`failed` 或 `stopped`。所有终态都不可再次转移。

这个限制解决了后台任务中很隐蔽的竞态：任务可能已经写出 `completed`，用户的停止请求却几乎同时到达。如果没有状态机保护，晚到的停止逻辑可能把真实成功结果覆盖成 `stopped`。`JobManager` 会先对账结果文件，并拒绝改写已经确定的终态。

## 十一、参数与破坏性操作：Prompt 提醒不是安全边界

系统 Prompt 规定了工具顺序、后台任务语义和失败后停止继续调用等行为，但真正的安全检查仍然位于代码中。

以刷副本为例，`farm_instance` 需要标准化的 `instance_type`、`instance_name` 和可选正整数 `attempts`。类型校验通过后，执行器还会把类型与 `assets/config/instance_names.json` 中的项目目录交叉验证。

因此，“金币”这样的自然语言别名需要先由模型映射为标准副本名称，不能直接穿透到原任务系统。组合无效时，结果会携带允许的副本名称，模型可以据此向玩家澄清或纠正。

四星遗器分解则采用双层确认：

- 系统 Prompt 要求玩家在当前对话中明确提出并确认；
- 执行器要求 `confirmed=True`，否则直接拒绝。

同样，任务是否对 Agent 开放由注册表白名单决定，而不是由 Prompt 自觉决定。Prompt 是行为指导，Schema、白名单和执行器校验才是不可绕过的边界。

## 十二、凭据与会话：减少不必要的明文和持久化

API Key 不从普通环境变量读取，而是通过 Win32 Credential API 从 Windows 凭据管理器读取固定目标 `March7thAssistant.Agent.API_KEY`。这避免了把密钥写进 `.env`、YAML、命令行参数或日志。

Agent 的对话记忆使用 `InMemorySaver`，GUI 和 CLI 都为会话生成独立 `thread_id`。这让同一会话可以记住之前返回的 `execution_id`，又不会默认把玩家对话持久化到磁盘。

对应的取舍也很明确：应用重启后，对话上下文和 `JobManager` 的内存注册表不会自动恢复。当前设计更看重会话隔离和退出清理，而不是跨重启续接。

## 十三、一次真实请求是怎样执行的

假设玩家输入：

> 启动游戏，然后刷 3 次金币副本。

理想调用链如下：

1. 模型识别出任务需要游戏环境；
2. 调用 `start_game`；
3. 收到 `completed` 后，将“金币”映射为标准类型与标准副本名；
4. 调用 `farm_instance(..., attempts=3)`；
5. 执行器再次校验名称组合和次数；
6. Worker 获取自动化锁并复查游戏状态；
7. 注册表 handler 调用原有 `Power.process()`；
8. Worker 返回实际执行次数；
9. 模型依据结构化结果向玩家报告最终状态。

如果任一步返回 `failed`、`rejected`、`stopped` 或 `not_found`，系统 Prompt 要求模型停止后续业务调用并如实说明原因。普通任务完成后也不会擅自退出游戏，除非玩家明确提出关闭要求。

这里的关键不是模型“足够聪明”，而是无论模型是否聪明，它都只能沿着一条可观测、可拒绝、可停止的路径行动。

## 十四、测试如何覆盖架构承诺

Agent 模块的测试并不只检查函数返回值，而是围绕架构承诺建立：

- 工具必须返回结构化对象；
- 模型工具调用必须关闭并行；
- Agent 不得看到调试和内部任务；
- 非标准副本别名必须被拒绝，并返回允许值；
- 后台任务必须在 Worker 写出 `running` 后才能注册；
- `result.json` 的终态不能被晚到的停止请求覆盖；
- Worker 无终态退出时必须标记为 `failed`；
- 跨进程锁必须真的拒绝另一个进程；
- 源码模式与冻结模式必须生成不同但正确的 Worker 启动命令；
- API Key 必须从固定的 Windows 凭据目标读取。

这些测试关注的是边界和竞态，而不是复述实现细节。对于涉及进程、文件协议和自动化资源的 Agent 系统，这类契约测试比单纯提高行覆盖率更有价值。

## 十五、如何扩展一个新的 Agent 任务

新增任务时，可以沿着下面的最小路径扩展：

1. 在原任务模块中准备一个职责单一、返回语义明确的 handler；
2. 在 `TASK_REGISTRY` 注册 `TaskSpec`，声明环境、后台和暴露属性；
3. 如有参数，在 `schemas.py` 增加 Pydantic 模型和领域校验；
4. 在 `tools.py` 添加语义清晰的工具包装；
5. 只有确实需要自然语言映射或顺序约束时，才补充系统 Prompt；
6. 为暴露白名单、参数拒绝、Worker 结果和异常路径增加测试；
7. 若任务是循环型，额外验证握手、查询、停止和父进程退出清理。

不建议直接给 Agent 暴露一个已有的复杂总入口。原子工具越清晰，模型越容易正确编排，失败时也越容易定位和恢复。

## 十六、取舍与下一步

当前架构选择了“本机优先、简单可检查”的文件 IPC 和内存作业表，非常适合桌面自动化，但它并不是分布式任务平台。未来如果需要跨重启恢复、远程控制或多机器调度，可以继续演进：

- 将 Checkpointer 和作业元数据迁移到 SQLite；
- 启动时扫描执行目录，恢复仍存活的后台 Worker；
- 为结果文件增加协议版本和更丰富的进度事件；
- 将任务注册、Schema 与工具描述进一步自动生成；
- 为危险等级引入统一策略，而不只使用布尔型 `destructive`；
- 增加可观测事件流，在 GUI 中展示“排队、握手、运行、停止中”等阶段。

这些演进都不需要推翻现有分层。模型仍然负责编排，执行器仍然是信任边界，Worker 仍然持有自动化锁，原任务系统仍然专注业务操作。

## 结语

March7thAssistant Agent 模块最值得借鉴的地方，不是用了某个 Agent 框架，而是对大模型能力边界的处理方式：

> 让模型拥有表达力，但不给它不受约束的执行力。

自然语言负责把复杂操作变得易用；原子工具、参数校验、状态机、独立进程和跨进程锁负责让这种易用性不会牺牲可控性。当 Agent 开始接触真实窗口、输入设备和长时间后台任务时，这些看似“基础设施”的部分，才是系统从 Demo 走向可靠产品的关键。

## 相关源码

- `app/agent/agent.py`：模型、Prompt、记忆与中间件组装
- `app/agent/tools.py`：Agent 工具面与结构化返回
- `app/agent/task_executor.py`：参数校验、Worker 启动与握手
- `app/agent/task_worker.py`：同步原子任务 Worker
- `app/agent/background_worker.py`：后台循环 Worker
- `app/agent/job_manager.py`：后台作业控制面
- `app/agent/automation_lock.py`：安装级跨进程自动化锁
- `app/agent/registry.py`：任务注册与旧系统适配
- `app/agent/schemas.py`：任务协议、状态机与输入模型
- `app/agent/credentials.py`：Windows 凭据读取
