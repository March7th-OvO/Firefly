# 探索（Discover）页面设计

## 背景与目标

为 Firefly 站点增加一个独立的 `/discover/` 沉浸式探索页。该页面不是现有 `/search/` 页面的别名，也不复用普通内容页网格；它以全屏壁纸、时钟、搜索和快捷入口为核心，并提供由时钟或设置按钮打开的全屏设置层。

实现必须延续项目的配置驱动思想：管理员可在配置文件中启用或关闭页面、设置默认行为和内容，并决定哪些偏好允许访客自行调整。页面关闭后，路由、导航和 sitemap 必须同步失效。

## 范围

### 包含

- 独立的 `/discover/` 路由与沉浸式响应布局。
- 当前时间、公历日期、星期及可选农历日期。
- Bing 搜索及可选搜索建议。
- 配置驱动的快捷入口与“更多”展开行为。
- 每日必应、随机封面、网站背景三种壁纸来源。
- 遮罩、模糊、搜索和时间偏好的设置面板。
- 本地偏好持久化、失败降级、键盘操作和移动端适配。
- 页面开关、导航显隐、环境变量覆盖、404 守卫和 sitemap 过滤。
- 与现有六种站点语言一致的界面文案。

### 不包含

- 替换或删除原有 `/search/` 高级搜索页。
- 将探索页偏好写入网站现有的显示设置或壁纸设置。
- 账号同步、服务端用户偏好或跨设备同步。
- 自建搜索索引、搜索引擎代理或壁纸缓存服务。
- 复制参考站点的品牌、备案信息或受版权保护的壁纸素材。

## 技术方案

采用 Astro 页面外壳配合 Svelte Island：

- `src/pages/discover.astro` 负责页面开关守卫、SEO、服务端配置整理和渲染探索页组件。
- `src/components/pages/discover/DiscoverPage.svelte` 负责时钟、搜索、快捷入口、设置面板和本地状态。
- `src/config/discoverConfig.ts` 与 `src/types/discoverConfig.ts` 定义管理员配置。
- `src/utils/discover-utils.ts` 承载可独立测试的纯逻辑，包括配置归一化、搜索 URL、壁纸选择和日期格式化。
- 探索页直接使用基础 `Layout.astro`，不使用 `MainGridLayout.astro`，避免普通导航栏、侧栏、横幅和内容卡片破坏全屏构图。

不增加新的运行时依赖。农历使用 `Intl.DateTimeFormat` 的 `zh-CN-u-ca-chinese` 日历；图标继续使用项目已经安装的 Iconify 集合。

## 页面开关与导航

在 `SiteConfig["pages"]` 增加必填布尔字段 `discover`，并在 `siteConfig.ts` 的页面开关区域配置默认值。现有 `resolvePageToggles` 会自动支持 `PUBLIC_PAGES_DISCOVER=true/false`。

`discover.astro` 在 `siteConfig.pages.discover` 为 `false` 时重定向到 `/404/`。`astro.config.mjs` 的 sitemap 过滤器同时排除 `/discover/`。

顶部“主页”改为子菜单组：

- “主页”：`/`，图标 `material-symbols:home`。
- “探索”：`/discover/`，图标 `material-symbols:search`，`pageKey: "discover"`。

桌面导航和移动抽屉继续共享 `resolveNavMenuLinks()`。探索页关闭时，该函数过滤掉“探索”，并按现有逻辑把只剩“主页”的分组折叠回普通主页链接。

## 配置模型

`DiscoverConfig` 包含以下区域：

```ts
type DiscoverWallpaperMode = "daily-bing" | "random" | "site";

type DiscoverConfig = {
	title: string;
	description?: string;
	search: {
		engineName: string;
		engineIcon: string;
		action: string;
		queryParam: string;
		placeholder: string;
		suggestions: {
			enable: boolean;
			switchable: boolean;
			endpoint?: string;
		};
		openInNewTab: {
			defaultValue: boolean;
			switchable: boolean;
		};
	};
	wallpaper: {
		defaultMode: DiscoverWallpaperMode;
		modeSwitchable: boolean;
		dailyBing: {
			imageUrl: string;
		};
		random: {
			desktop: string[];
			mobile: string[];
		};
		overlay: {
			defaultEnabled: boolean;
			switchable: boolean;
			opacity: number;
		};
		blur: {
			defaultValue: number;
			switchable: boolean;
			min: number;
			max: number;
			step: number;
		};
	};
	clock: {
		showSeconds: { defaultValue: boolean; switchable: boolean };
		showLunar: { defaultValue: boolean; switchable: boolean };
		use12Hour: { defaultValue: boolean; switchable: boolean };
	};
	settings: {
		enable: boolean;
		clockClickable: boolean;
	};
	shortcuts: {
		initialVisible: number;
		items: DiscoverShortcut[];
	};
	footer: {
		enable: boolean;
		text: string;
	};
};
```

`DiscoverShortcut` 支持名称、URL、Iconify 图标或图片、外链标识和启用开关。字段命名、注释风格以及独立类型文件与项目其他配置保持一致。

配置归一化必须处理空图片池、越界透明度/模糊值、无效默认壁纸模式和空搜索地址。无效值回退到安全默认值，不让页面初始化失败。

## 状态优先级与持久化

状态优先级为：

1. 管理员配置中不可切换的值；
2. 管理员允许切换时，访客已保存的合法值；
3. 管理员配置的默认值；
4. 代码安全默认值。

所有访客偏好保存到单个版本化键 `firefly:discover-preferences:v1`，内容只包含允许持久化的壁纸模式、遮罩、模糊、搜索和时间选项。解析失败、类型错误或超出范围时忽略对应字段。探索页不得读写 `wallpaperMode`、`overlayBlur` 等现有显示设置键。

当管理员将某项 `switchable` 设为 `false` 时，设置面板隐藏该控制项并始终使用配置值；旧的本地字段可以保留，但不得生效。

## 页面布局与视觉

页面占满动态视口高度（`100dvh`），背景图片使用 `object-fit: cover`。桌面端中央内容由时钟、日期、搜索框和快捷入口垂直组成；主页和设置按钮固定在右下角。移动端缩小时钟和搜索框，将控制按钮放入安全区内，并允许设置内容纵向滚动。

视觉方向沿用参考图的柔和景深和低对比玻璃态，同时复用 Firefly 的主题色、字体变量和圆角变量：

- 背景层负责图片与模糊，内容层保持清晰。
- 独立遮罩层改善文字对比度。
- 搜索框、快捷入口和设置卡片使用一致的半透明玻璃表面、细边缘高光和克制阴影。
- 动画只用于初次淡入、面板进入和轻微按钮反馈；`prefers-reduced-motion` 下关闭非必要动画。
- 不使用参考站点的背景图、品牌图标或备案文案。

## 时钟与日期

时钟按分钟更新；开启“显示秒”时按秒更新。组件挂载时立即对齐当前时间，卸载时清除计时器，避免 Swup 切页后重复运行。

公历日期使用站点语言和 `siteConfig.timezone` 格式化。12/24 小时制由配置与访客偏好决定。农历通过 `Intl.DateTimeFormat("zh-CN-u-ca-chinese", ...)` 生成；若运行环境不支持 Chinese Calendar，则仅隐藏农历行，不影响公历和时钟。

点击时钟和设置按钮均可打开设置层，但只有在 `settings.enable` 为真时显示设置入口；`settings.clockClickable` 可单独关闭时钟点击行为。

## 搜索

搜索提交时对输入进行 `trim()`；空值不导航。使用 `URL` 与配置的 `queryParam` 安全构建目标地址，不拼接未经编码的查询文本。

搜索建议为渐进增强：仅在管理员启用、访客未关闭、输入非空且配置了端点时请求。请求使用防抖和 `AbortController` 取消旧请求；任何网络、解析或跨域错误都静默隐藏建议列表。方向键、Enter 和 Escape 支持键盘选择。

“新标签页打开”开启时使用 `noopener,noreferrer`；关闭时在当前页导航。搜索引擎图标、名称、地址与参数均由配置提供，默认采用 Bing。

## 壁纸

三种壁纸来源的解析规则：

- `daily-bing`：使用管理员配置的图片或重定向地址，并附加每日缓存破坏参数。加载失败时回退到网站背景。
- `random`：按当前视口选择桌面或移动图片池，再随机选择一张；对应图片池为空时使用另一端图片池，两者均为空时回退到网站背景。
- `site`：复用 `getBackgroundImages()` 返回的网站背景列表，并按设备选择一张。

壁纸加载错误时最多执行一次来源回退，最终仍失败则显示基于主题色的渐变背景，避免无限错误循环。切换壁纸时预加载目标图片，加载成功后再淡入替换。

模糊只应用于放大后的背景层，以免露出视口边缘；遮罩是独立层。滑杆显示配置范围并在写入前夹紧数值。

## 设置面板

设置面板是覆盖探索页的全屏玻璃层，分为“壁纸”“搜索”“时间”三组，复现参考图的分段结构：

- 壁纸偏好：每日必应、随机封面、网站背景。
- 壁纸遮罩：开关。
- 壁纸模糊：范围滑杆。
- 搜索建议：开关。
- 新标签页打开：开关。
- 时间显秒：开关。
- 显示农历：开关。
- 12 小时制：开关。

只渲染管理员允许调整的项目；若整个分组没有可调项，则隐藏该分组。面板支持点击关闭按钮、点击外部区域和 Escape 关闭。打开后锁定页面滚动、把焦点移入面板，并在关闭后恢复到触发按钮。

## 快捷入口

快捷入口按配置顺序展示启用项。首屏显示 `initialVisible` 个；存在更多项目时显示“更多”按钮，点击后在当前玻璃容器内展开完整网格，再次点击可收起。内部链接使用项目 `url()` 处理基础路径，外部链接根据配置决定当前页或新标签页打开。

图标统一使用现有 Iconify 组件的尺寸和视觉重量；图片图标提供加载失败后的首字母兜底。没有任何快捷入口时整个区域隐藏。

## 国际化与可访问性

为“探索”、设置分组、壁纸选项、搜索与时间选项、展开/收起和错误兜底补充 i18n key，并在简中、繁中、英文、日文、韩文、俄文翻译中补齐。

交互元素使用原生 `button`、`input` 和 `a`。设置层使用 `role="dialog"`、`aria-modal="true"`，开关暴露 `aria-checked`，搜索建议使用 combobox/listbox 语义。文字和控件在遮罩开启/关闭的允许范围内保持足够对比度。

## 错误处理

- 配置错误：归一化后使用安全默认值。
- 本地存储不可用或数据损坏：仅使用配置默认值。
- 每日壁纸、随机壁纸或站点壁纸加载失败：按既定顺序回退到渐变背景。
- 搜索建议失败：隐藏建议，不影响直接搜索。
- 农历格式化失败：隐藏农历，不影响其他时间信息。
- 图标图片失败：显示首字母兜底。

所有可预期的客户端失败均不得阻断页面主体渲染。

## 测试与验收

采用测试驱动方式实现纯逻辑：

1. 为配置归一化、偏好优先级、搜索 URL、壁纸选择、日期格式化编写失败测试。
2. 确认测试因功能尚不存在而失败。
3. 写最小实现使测试通过，再整理结构。

仓库没有既有单元测试框架，因此使用 Node 内置 `node:test` 与 `tsx --test`，不新增测试库。必要时在 `package.json` 增加明确的测试脚本。

实现完成后的验证包括：

- 单元测试全部通过。
- `pnpm check` 无 Astro 诊断。
- `pnpm type-check` 无 TypeScript 错误。
- `pnpm build` 成功生成 `/discover/index.html`。
- 页面关闭配置下，路由跳转 404、导航隐藏且 sitemap 不含探索页。
- 在真实浏览器桌面与移动视口验证时钟更新、面板开关、持久化恢复、三种壁纸及回退、搜索、建议、快捷入口和键盘操作。
- 检查控制台无新增错误，并确认 Swup 往返页面后没有重复计时器或事件监听器。

## 预期文件变更

- 新增 `src/types/discoverConfig.ts`
- 新增 `src/config/discoverConfig.ts`
- 新增 `src/utils/discover-utils.ts`
- 新增 `src/utils/discover-utils.test.ts`
- 新增 `src/components/pages/discover/DiscoverPage.svelte`
- 新增 `src/pages/discover.astro`
- 修改 `src/types/siteConfig.ts`
- 修改 `src/types/config.ts`
- 修改 `src/config/index.ts`
- 修改 `src/config/siteConfig.ts`
- 修改 `src/config/navBarConfig.ts`
- 修改 `src/utils/navbar-i18n.ts`
- 修改 `src/i18n/i18nKey.ts` 与六个语言文件
- 修改 `astro.config.mjs`
- 视测试命令需要修改 `package.json`

## 完成标准

- “探索”是独立页面而非原搜索页别名。
- 页面、菜单和 sitemap 由同一个 `siteConfig.pages.discover` 开关控制。
- 导航图标为 `material-symbols:search`，桌面和移动端一致。
- 参考图中的主要页面结构和所有列出的设置均可用。
- 管理员配置与访客偏好边界清晰，且不污染现有网站设置。
- 网络或浏览器能力缺失时有可用降级路径。
- 自动检查、生产构建和真实浏览器验收全部通过。
