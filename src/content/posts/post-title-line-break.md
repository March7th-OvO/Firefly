---
title: 给文章主标题加上手动换行<br>——Astro 内容层一次 transform 的最小改动实践
published: 2026-09-14
description: "给 Firefly 的文章主标题加上手动换行标记：三种写法、一个正则，在 Astro 内容层用一次 schema transform 覆盖全部 25+ 个标题消费点，最终只改了两个文件。"
tags: [Astro, Zod, TypeScript, Firefly, 前端]
category: 开发记录
draft: false
---

先说效果：本文标题在文章页里是两行，断行的位置就是 frontmatter 里写的那一个 `<br>`。卡片、浏览器标签页、RSS、OG 分享图里的同一个标题则自动合并回单行。实现这个功能只改了两个文件，这篇记录一下过程和取舍。

## 一、难点：title 不经过 markdown

需求很简单：长标题在详情页的大字标题处，想在语义断点手动断行，而不是任由浏览器按宽度折行。

但 Firefly 的文章标题和正文走的是两条完全不同的路。正文经过完整的 remark/rehype 管线，`**加粗**`、`<br>` 想怎么写都行；frontmatter 里的 `title` 只是一个 `z.string()` 纯文本，模板里 `{entry.data.title}` 直接输出，Astro 会自动转义。也就是说，直接在标题里写 `<br>`，页面上会原样显示「<br>」三个字符加一对尖括号。

标题不经过 markdown，所以换行只能靠**约定一个标记**，在渲染时由我们自己解释。

## 二、约定：三种写法，一个正则

写 YAML 的人习惯不同，与其规定一种，不如让一个正则把常见写法全部收编：

```yaml
title: 第一行<br>第二行        # <br> 及 <br/>、<br /> 变体
title: 第一行\n第二行          # 无引号 YAML 里的字面 \n（两个字符）
title: "第一行\n第二行"        # 双引号转义出的真实换行符
```

对应的正则只有一行：

```ts
const TITLE_LINE_BREAK_RE = /\r\n|\r|\n|\\n|<br\s*\/?\s*>/gi;
```

`|` 的顺序把 `\r\n` 放在 `\r` 和 `\n` 前面，避免 Windows 换行被拆成两半。

## 三、第一反应是逐点清洗，然后被 grep 劝退

标题这个字段远比「文章页大标题」活跃。`grep -rn "\.data\.title" src/` 一跑，25+ 个消费点散落在 12 个文件里：

- 文章卡片 `PostCard`、首页横幅 `BannerPostMetaOverlay`、归档面板和时间线、系列导航 `SeriesNav`、推荐文章；
- `<title>` 标签、og:title、JSON-LD 的 headline、上下篇导航；
- RSS（`rss.xml.ts` 和 `rss.astro` 两处）、OG 分享图（satori 渲染）、分享海报、全量元数据 API；
- 甚至 `content-utils.ts` 里拿标题做排序和分词推荐。

逐点清洗意味着每个文件都要 import 一个 `getPlainTitle()`。更要命的是覆盖不完整：OG 分享图走的是 `getCollection("posts")`，根本不经过 `getSortedPosts()`。漏掉任何一处，那个位置就会把字面 `<br>` 或 `\n` 直接展示给读者——而且是那种上线上好久才发现的 bug。以后新增一个用标题的组件，还得记得再洗一遍。

这条路的问题不是工作量大，是**结构性脆弱**。

## 四、换方向：在数据层归一化一次

既然每个消费点都需要单行标题，那就让数据在进入业务代码之前就是单行的。posts 的 zod schema 本来就是所有取数路径的必经之地（`getSortedPosts` 和 `getCollection` 都会被它解析），在末尾挂一个 `.transform()`：

```ts
schema: z.object({
	/* 字段原样不动 */
}).transform((data) => {
	const titleLines = data.title
		.split(TITLE_LINE_BREAK_RE)
		.map((line) => line.trim())
		.filter(Boolean);
	return {
		...data,
		titleLines,
		title: titleLines.join(" ") || data.title,
	};
}),
```

一次 transform 同时交付两个东西：

- `title`：归一化后的单行文本，全部 25+ 个消费点原样不动，自动正确；
- `titleLines`：拆好的行数组，供详情页分行渲染。

从此「漏洗」这类 bug 在结构上不可能发生——任何取数方式拿到的 `data.title` 都已经是干净的，未来新增组件也不需要知道这个约定的存在。

类型层面也几乎零成本：Astro 7 用的 zod v4 泛型是协变的，`ZodPipe`（transform 的产物）可以直接赋给手写的 `ContentCollection<PostData>` 注解，`PostData` 补一个 `titleLines: string[]` 就完事。

## 五、详情页：唯一需要分行的渲染点

两处大标题（普通模式和封面覆盖模式）从 `{entry.data.title}` 换成：

```astro
{entry.data.titleLines.map((line, i) => (
  <Fragment>
    {i > 0 && <br />}
    {i > 0 && " "}
    {line}
  </Fragment>
))}
```

一个不起眼的细节：`<br />` 后面补的那个 `{" "}`。Pagefind 从 DOM 的 textContent 建索引，`<br>` 在 textContent 里是空字符串，两行文字会直接黏在一起（`第一行第二行`），英文标题的搜索就废了。补一个空格文本节点后 textContent 恢复正常，而 CSS 的空白折叠规则会把行首空格吃掉，肉眼完全不可见。

没有换行标记时 `titleLines` 就是单元素数组，渲染结果和改动前逐字节相同——老文章零影响。

## 六、已知取舍

- **字面 `\n` 有误伤面**：如果某篇文章的标题本身要讲「`\n` 这个转义字符」，它会被当成换行吃掉。这类标题换用 `<br>` 之外的措辞即可，属于可接受的约定成本。
- **合并用空格连接**：英文标题折行后合并必须有空格，否则单词粘连；代价是中文标题在 `<title>`、RSS 这类纯文本场景会多出一个半角空格，影响很小。
- **字面标记的泄露风险归零，但约定仍需文档**：schema 归一化是全局的，如果哪天有人想拿到带标记的原始标题，得去 `entry.rawData` 找——正常业务不应该有这个需求。

## 七、小结

整个功能最终落在两个文件：`content.config.ts` 加一个正则和一个 transform，`[...slug].astro` 改两处渲染点。回头看，最大的弯路是想在 12 个文件里逐点打补丁——当同一个字段有几十个消费点时，答案往往不在消费端，而在数据进入系统的那个入口上。

至于本文标题的两行效果，你已经在页面最上方看到了。
