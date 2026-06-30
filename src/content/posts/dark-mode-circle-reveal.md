---
title: 为 FurinaFans 暗色模式切换实现圆形扩散动画
published: 2026-06-20
description: "记录使用 View Transitions API + clip-path: circle() 替换传统淡入淡出，实现从点击位置圆形扩散的主题切换动画。"
tags: [Astro, View Transitions API, CSS, 视觉交互, 前端]
category: 开发记录
draft: false
---

主题切换是一个几乎所有博客都会有的功能，但绝大多数实现都是生硬的「闪切」—— 点击按钮，页面瞬间从亮变暗，中间没有过渡。稍微讲究一点的做法是给 `html` 加一个 transition，让背景色和文字色在几百毫秒内平滑过渡。Firefly 之前用的 View Transitions API 淡入淡出方案已经比「闪切」好很多，但它仍然是一个全局的、均质的过渡 —— 动画从页面整体发生，没有方向感，也没有「谁在驱动这次变化」的叙事。

这次的目标是把主题切换做成**圆形扩散**效果：从鼠标点击的位置，一个新主题的「圆」向外扩散，直到覆盖整个视口。用户点击按钮的一瞬间，视觉上就能感知到「新主题从这里长出来」。

## 一、三个切入点

实现之前，先把问题拆清楚：

1. **动画起点** —— 用户点击主题按钮的坐标必须被捕获，并作为 `circle()` 的圆心。
2. **动画机制** —— 用什么 API 能在主题切换（DOM 修改）的同时驱动 clip-path 动画。
3. **兜底兼容** —— 不支持的浏览器怎么办。

这三个点各自有各自的技术选择，不能混在一起想。

## 二、View Transitions API 的基本模型

View Transitions API 的核心是 `document.startViewTransition(callback)`。调用时：

- 浏览器**截取当前页面**作为「旧视图」快照。
- 执行 `callback`（里面做 DOM 修改，比如给 `<html>` 加 `dark` class）。
- 浏览器**截取修改后的页面**作为「新视图」快照。
- 将两张快照分别放在 `::view-transition-old(root)` 和 `::view-transition-new(root)` 两个伪元素里，开放给 CSS 控制动画。

关键在于：**旧视图和新视图是独立的两张截图**，你可以在 CSS 里对它们分别施加任意动画，互不干扰。

Firefly 此前已经用了这个 API，但只在 CSS 里写了 fade-in / fade-out。这次要做的，是把 `::view-transition-new(root)` 的动画从 opacity 淡入，改成 clip-path 圆形展开。

## 三、核心实现

### 3.1 捕获点击坐标

在 Svelte 的 `LightDarkSwitch` 组件中，让按钮的 `onclick` 传递 `MouseEvent`：

```svelte
<!-- 之前 -->
onclick={() => switchScheme(DARK_MODE)}

<!-- 之后 -->
onclick={(e) => switchScheme(DARK_MODE, e)}
```

在 `switchScheme` 中提取坐标并调用带动画的切换函数：

```ts
function switchScheme(newMode: LIGHT_DARK_MODE, e?: MouseEvent) {
    mode = newMode;
    if (e) {
        setThemeWithAnimation(newMode, e.clientX, e.clientY);
    } else {
        setTheme(newMode);  // 程序化触发时不用动画
    }
    updateDisplayedMode();
}
```

### 3.2 用 startViewTransition 驱动

`setting-utils.ts` 中新增 `setThemeWithAnimation`：

```ts
export function setThemeWithAnimation(
    theme: LIGHT_DARK_MODE,
    clickX: number,
    clickY: number,
): void {
    // 将点击坐标写入 CSS 变量
    document.documentElement.style.setProperty("--click-x", `${clickX}px`);
    document.documentElement.style.setProperty("--click-y", `${clickY}px`);

    if (document.startViewTransition) {
        document.startViewTransition(() => {
            setThemeCore(theme);  // 实际改 dark class + 写 localStorage
        });
    } else {
        setThemeCore(theme);  // 兜底
    }
}
```

这里有一个重要的设计决策：把 `setTheme` 拆成两层。外层 `setTheme` / `setThemeWithAnimation` 负责「怎么切换」（有无动画、什么动画），内层 `setThemeCore` 负责「切换什么」（改 DOM class、写 localStorage）。这样拆分后，所有调用方 —— 包括系统主题监听、程序化切换、其他组件 —— 都能毫无感知地继续使用 `setTheme`，不会因为引入动画而破坏现有逻辑。

### 3.3 CSS：从 fade 到 circle

`main.css` 中的改动是核心：

```css
/* 旧视图不动，保持底层 */
::view-transition-old(root) {
    animation: none;
    z-index: 0;
}

/* 新视图从点击位置圆形扩散 */
::view-transition-new(root) {
    animation: theme-circle-expand 0.5s cubic-bezier(0.4, 0, 0.2, 1) both;
    clip-path: circle(0% at var(--click-x, 50%) var(--click-y, 50%));
    z-index: 1;
}

@keyframes theme-circle-expand {
    0%   { clip-path: circle(0%   at var(--click-x, 50%) var(--click-y, 50%)); }
    100% { clip-path: circle(150% at var(--click-x, 50%) var(--click-y, 50%)); }
}
```

`circle()` 的半径从 `0%` 到 `150%`，保证覆盖视口最远角。CSS 变量 `--click-x` / `--click-y` 由 JS 在触发前写入，没写入时 fallback 到 `50% 50%`（屏幕中心）。

动画曲线选 `cubic-bezier(0.4, 0, 0.2, 1)` —— 这是一个先快后慢的缓出曲线。圆形扩散动画本身带有「加速展开」的物理感，用 ease-out 曲线可以让后期减速显得更自然，而不是戛然而止。

整个动画逻辑其实很简单：**旧截图保持不动，新截图从圆心处出现并逐渐覆盖整个视口**。旧截图被新截图「吃掉」的视觉效果，本质上就是 clip-path 圆越来越大。

## 四、旧代码中可以删掉的遗留问题

在改 CSS 的过程中注意到一个细节：之前的 `::view-transition-old(root)` 和 `::view-transition-new(root)` 共享了动画时长和缓动函数的声明，然后各自的 `animation-name` 又分别绑定到 `theme-fade-out` 和 `theme-fade-in`。这种写法在淡入淡出的场景下没问题，但改成圆形扩散后，旧视图根本不需要任何动画 —— 它只需要安静地待在底层等待被覆盖。所以新代码中只给 `new` 赋动画，`old` 直接 `animation: none`，结构更清晰。

## 五、兜底策略

View Transitions API 目前只在 Chromium 系浏览器中可用（Chrome、Edge、Arc 等）。Firefox 和 Safari 的用户量虽然不大，但不能让他们在点击主题按钮后没有任何反应。

所以兜底逻辑很简单：

```ts
if (document.startViewTransition) {
    // 有 View Transitions → 圆形扩散动画
} else {
    setThemeCore(theme);  // 没有 → 直接切换，无动画
}
```

不做 fallback 动画。在 Safari/Firefox 上做一个 JS 驱动的 canvas 圆扩散虽然技术上可行，但代价太大 —— 引入额外的 DOM 元素、管理动画生命周期、处理高 DPI 渲染 —— 对于「主题切换动画」这样一个锦上添花的功能来说不划算。简洁比完美更重要。

## 六、用 astro check 而非 type-check 验证

Firefly 项目启用了 `tsc --noEmit --isolatedDeclarations`，这是一个相当严格的检查模式。本次改动在 `setting-utils.ts` 中新增了两个函数（`setThemeWithAnimation` 和 `setThemeCore`），好在已有的 type-check 错误集中在其他文件的 `--isolatedDeclarations` 合规性上，新代码没有引入额外问题。

真正管用的是 `pnpm check`（`astro check`），它负责检查所有 `.astro` 和 `.svelte` 文件的类型正确性。改完三个文件后跑 `astro check`，157 个文件 0 errors 0 warnings，可以放心提交。

---

回顾这次改动，最满意的地方不是动画效果本身 —— 圆形扩散这种效果网上有很多现成的 demo —— 而是 **View Transitions API 在工程中恰好是一个正确的选择**。

它不需要你手动管理 DOM 节点，不需要在 JS 里写 setTimeout 猜测渲染时机，不需要处理两张截图之间的闪烁。浏览器替你做了最麻烦的事：截图、合成、渲染。你只需要在 CSS 里决定这两张截图之间怎么过渡。

而 `clip-path: circle()` 配合 CSS 变量传递坐标，刚好把「动画原点」和「动画形式」解耦了。坐标由 JS 在真实用户交互中捕获，动画形式由 CSS 声明式定义，两者各司其职，互不污染。这种分工在 UI 开发中是一种很舒服的模式。
