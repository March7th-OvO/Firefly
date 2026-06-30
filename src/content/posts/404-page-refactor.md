---
title: 404 页面沉浸式重构：CSS 作用域锁定与 Nginx SPA 回退的两次排障
published: 2026-06-22
description: "记录将 404 页面改造为沉浸式设计的过程中踩的两个坑：全局 CSS 泄漏到其他页面的样式污染，以及 Nginx SPA 回退导致不存在的路径显示主页而非 404。"
tags: [Astro, CSS, Nginx, 前端, 调试, Firefly]
category: 开发记录
draft: false
---

Firefly 原来的 404 页面就是一个大号「404」数字配一个 sad face 图标，功能正常但毫无设计感。这次的目标是做一个沉浸式的 404 页面：毛玻璃质感的天空蓝背景、Parisienne 手写体的「404 Not Furina」、定制插画、俏皮的「芙芙现在不在家~」文案，再让全局黄金螺旋装饰线从背景中透出。

踩了两个坑，根因分别在 CSS 和 Nginx 两个完全不同的层面。

## 一、架构决策：从 MainGridLayout 到 Layout

在写任何视觉代码之前，先把 404 页面从 `MainGridLayout` 剥离到 `Layout`。

`MainGridLayout` 会带上导航栏、侧边栏、壁纸系统、页脚。一个 404 页面不需要这些——用户已经迷路了，再给导航入口只会加重困惑。`Layout` 是 Firefly 最轻量的壳层，只提供 `<html>` 壳、字体管理、主题初始化和黄金螺旋背景。404 页面成为一个独立的画布。

这个决策是正确的，但它也意味着 404 页面不再拥有 `MainGridLayout` 提供的 Swup 容器。后续第一个坑的修复和这个有直接关系。

## 二、字体本地化与配置驱动

新 404 页面用了两个 Google Fonts：Parisienne（手写英文）和 ZCOOL KuaiLe（中文快乐体）。国内网络环境下 Google Fonts 被 DNS 污染，直接引用会导致字体永远加载不到。

解决方法是把字体下载到 `public/fonts/`，同时在 `fontConfig.ts` 中新增配置条目：

```ts
parisienne: {
    id: "parisienne", src: "/fonts/Parisienne.ttf",
    family: "Parisienne", weight: 400,
    display: "swap", format: "truetype",
},
"zcool-kuaile": {
    id: "zcool-kuaile", src: "/fonts/ZCOOLKuaiLe.ttf",
    family: "ZCOOL KuaiLe", weight: 400,
    display: "swap", format: "truetype",
},
```

404 页面通过 `fontConfig.fonts` 读取字体定义、自行生成 `@font-face`，与 `FontManager.astro` 处理本地字体的模式一致。字体成为被配置描述的数据，而非硬编码的 CSS 文件。

## 三、坑一：蓝底泄漏到文章页

### 现象

在某个文章页修改了 slug 来触发 404 测试之后，随便点进任何一篇文章，页面背景都变成了 `#66CCFF` 的天空蓝。刷新、清理缓存都没用。

### 排障过程

最初怀疑是 Swup 的 `updateHead: true` 把 404 页的 `<style>` 块注入了当前页面的 `<head>`，导航离开后没有清理。

于是尝试了几种方案：

- 用 `html[data-page-type="404"]` 属性选择器限制作用域（需要 JS 写入 data 属性，侵入性强）
- 在 Swup 的 `content:replace` 钩子中检测 404 并强制全页跳转（钩子可能不触发，因为 404 页缺少 Swup 容器）

这些方案本质上都是在「拦截泄漏」而不是「防止泄漏」。

### 真正的根因

回退到 commit 状态后重新审视：**问题不在 Swup 运行时注入，而在 Astro 构建阶段**。

Astro 使用 CSS code splitting，构建时会将全局样式打入页面的 CSS bundle。404 页的 `<style is:global>` 包含：

```css
html { background-color: #66CCFF !important; }
```

这个规则被打包进 `/_astro/404.*.css`。因为 `!important` + `html` 选择器足够宽，**只要这个 CSS 文件被任何页面引用，它就会覆盖该页面的背景**。

而 Swup 的 preload 机制会在用户 hover 链接时预取目标页面的 CSS。这意味着即使没有实际导航到 404 页面，只要 hover 了某个指向失效路径的链接，`404.*.css` 就可能被预加载到当前页面。

### 最终修复

**CSS 选择器层级的解决方案**——`:has()` 伪类：

```css
/* 之前 — 全局污染 */
html { background-color: #66CCFF !important; }

/* 之后 — 只在 404 页面生效 */
html:has(.not-found-page) { background-color: #66CCFF !important; }
```

`html:has(.not-found-page)` 选择「包含 class 为 `.not-found-page` 元素的 html」。只有真正的 404 页面 DOM 中才有 `.not-found-page`，其他页面不存在这个元素，选择器自然匹配不上。

同理，黄金螺旋线的白色覆盖也做了作用域锁定：

```css
html:has(.not-found-page) .golden-spiral-path  { stroke: rgba(255,255,255, 0.95) }
html:has(.not-found-page) .golden-spiral-rect  { stroke: rgba(255,255,255, 0.75) }
html:has(.not-found-page) .golden-spiral-diag  { stroke: rgba(255,255,255, 0.55) }
```

**零 JS、零额外属性、纯 CSS 结构选择器解决作用域问题**。即使 CSS 文件被 Swup 预加载到任意页面，选择器在 DOM 中匹配不到目标，样式就不会生效。

`html.dark:has(.not-found-page)` 同样处理暗色模式。

## 四、坑二：不存在的路径跳回主页

### 现象

直接访问 `https://furinafans.com/asdfgh` 这样的不存在路径，浏览器显示的是**主页内容**，而不是 404 页面。

### 根因

Nginx 配置使用了经典的 SPA 回退规则：

```nginx
try_files $uri $uri/ /index.html;
```

这行配置的意思是：先尝试请求路径对应的文件 → 再尝试目录 → 都不存在就回退到 `/index.html` 并返回 **HTTP 200**。

这对于 React/Vue 等纯前端 SPA 是正确的（前端路由接管未知路径），但对于 Astro 这种 MPA（多页应用）是错误的。Astro 的每个路由都有独立的 HTML 文件，`/asdfgh` 应该返回 404，而不是回退到主页。

而且 HTTP 200 状态码意味着搜索引擎和浏览器认为这个路径存在有效内容，会将其索引。

### 修复

```nginx
# 之前 — SPA 回退
try_files $uri $uri/ /index.html;

# 之后 — 返回真正的 404
try_files $uri $uri/ =404;
error_page 404 /404.html;
```

改为 `=404` 后，不存在的路径返回 HTTP 404 状态码，Nginx 再通过 `error_page` 指令展示自定义的 `404.html`。现在请求一个不存在的路径：

- 返回 **HTTP 404**（语义正确）
- 显示自定义 404 页面（视觉完整）
- Swup 检测到 404 响应状态码后不会尝试替换内容（SPA 安全）

## 五、经验总结

1. **全局 CSS 的作用域问题不能被 Swup 的 `updateHead` 掩盖**。根本修复应该在 CSS 选择器层面完成——构建时打包的 CSS 就已经决定了它会影响哪些页面。`:has()` 伪类提供了一种零侵入的作用域锁定方式：样式是否生效由 DOM 结构决定，而不依赖运行时状态。

2. **`try_files /index.html` 只适用于前端路由 SPA**。Astro 是 MPA，每个页面有独立的 HTML。Nginx 配置应该区分「真实文件不存在」和「前端路由未命中」，前者应该返回 404。

3. **CSS 排障时，先确认问题发生在哪个阶段**。`<style is:global>` 的泄漏既可能是运行时注入（Swup），也可能是构建时打包（Astro CSS code splitting + preload）。后者的排查路径完全不同——需要看构建产物中 CSS 文件的引用关系，而不是 DevTools 的 Network 面板。
