---
title: 黑暗模式圆形扩散动画：从初版实现到二次修正
published: 2026-06-20
updated: 2026-07-01
description: "记录 FurinaFans 使用 View Transitions API 与 clip-path: circle() 实现黑暗模式圆形扩散动画，并在 review 后补齐极端视口、键盘触发和减少动态效果等边界处理。"
tags: [Astro, View Transitions API, CSS, 视觉交互, 前端]
category: 开发记录
draft: false
---

主题切换是博客里很常见的功能，但它很容易被做成一个只有结果、没有过程的交互：点击按钮，页面瞬间从浅色变成深色，或者从深色变回浅色。功能是完成了，视觉上却像是整页突然被替换掉。

FurinaFans 原本已经使用了 View Transitions API 做淡入淡出，比直接闪切好一些。但淡入淡出仍然是一个全局、均质的变化：页面整体慢慢换色，动画没有方向，也看不出这次变化是由哪个交互触发的。

这次想做的是另一种反馈：**新主题从用户点击的位置向外扩散**。当用户点击主题菜单项时，一个属于新主题的圆从点击点展开，直到覆盖整个视口。它不是单纯让颜色变得更平滑，而是把「用户在哪里触发了主题切换」也纳入动画叙事。

这篇文章记录完整过程：初版如何实现，review 后发现了哪些边界问题，以及最终如何补齐。

## 一、为什么用 View Transitions API

主题切换本质上是一次 DOM 状态变化：给 `<html>` 添加或移除 `dark` class，同时更新代码块主题、localStorage、系统主题监听等状态。难点在于，动画要发生在「旧页面状态」和「新页面状态」之间。

View Transitions API 正好解决这个问题。调用：

```ts
document.startViewTransition(() => {
    // 在这里修改 DOM 状态
});
```

浏览器会做四件事：

1. 截取当前页面，作为旧视图快照。
2. 执行回调，应用新的 DOM 状态。
3. 截取更新后的页面，作为新视图快照。
4. 把两张快照暴露为 `::view-transition-old(root)` 和 `::view-transition-new(root)`，交给 CSS 控制动画。

这意味着主题切换不需要手写额外遮罩层，也不需要用 `setTimeout` 猜测渲染时机。JS 负责切换主题状态，CSS 负责定义两张快照如何过渡，职责边界比较干净。

## 二、初版实现：从点击点扩散

初版的思路很直接：

1. 在主题菜单点击时拿到 `MouseEvent`。
2. 把 `event.clientX` / `event.clientY` 写入 CSS 变量。
3. 用 `clip-path: circle()` 让新视图从这个坐标展开。

Svelte 组件里的入口大致是这样：

```ts
function switchScheme(newMode: LIGHT_DARK_MODE, event?: MouseEvent) {
    mode = newMode;

    if (event) {
        setThemeWithAnimation(newMode, event.clientX, event.clientY);
    } else {
        setTheme(newMode);
    }

    updateDisplayedMode();
}
```

主题工具函数中再包一层动画入口：

```ts
export function setThemeWithAnimation(
    theme: LIGHT_DARK_MODE,
    clickX: number,
    clickY: number,
): void {
    document.documentElement.style.setProperty("--click-x", `${clickX}px`);
    document.documentElement.style.setProperty("--click-y", `${clickY}px`);

    if (document.startViewTransition) {
        document.startViewTransition(() => {
            setThemeCore(theme);
        });
        return;
    }

    setThemeCore(theme);
}
```

CSS 里旧视图不动，新视图做圆形展开：

```css
::view-transition-old(root) {
    animation: none;
    z-index: 0;
}

::view-transition-new(root) {
    animation: theme-circle-expand 0.5s cubic-bezier(0.4, 0, 0.2, 1) both;
    clip-path: circle(0% at var(--click-x, 50%) var(--click-y, 50%));
    z-index: 1;
}

@keyframes theme-circle-expand {
    0% {
        clip-path: circle(0% at var(--click-x, 50%) var(--click-y, 50%));
    }

    100% {
        clip-path: circle(150% at var(--click-x, 50%) var(--click-y, 50%));
    }
}
```

这版能跑，也能看到预期中的圆形扩散效果。但它有一个问题：它只验证了「正常鼠标点击、普通屏幕比例、默认动效设置」这条路径。

review 之后发现，真实交互还需要覆盖更多边界。

## 三、二次修改：补齐三个边界

Sourcery review 提醒了三个值得处理的问题：

1. `circle(150%)` 在极宽屏、极高屏或角落点击时，不一定稳定覆盖整个视口。
2. 键盘触发 click 事件时，`clientX` / `clientY` 可能是 `0`，动画会从左上角扩散。
3. 用户如果设置了 `prefers-reduced-motion: reduce`，不应该看到完整的 0.5s 圆形扩散动画。

这些不是核心思路错误，而是工程实现里必须补齐的细节。

## 四、半径从 150% 改成 150vmax

初版用的是：

```css
circle(150% at var(--click-x, 50%) var(--click-y, 50%))
```

看起来 150% 已经很大，但 `clip-path: circle()` 的百分比半径在不同视口比例和实现细节下并不如视口单位直观。尤其当圆心在角落附近，最远点可能比想象中更远。

最终改为：

```css
@keyframes theme-circle-expand {
    0% {
        clip-path: circle(0 at var(--click-x, 50%) var(--click-y, 50%));
    }

    100% {
        clip-path: circle(150vmax at var(--click-x, 50%) var(--click-y, 50%));
    }
}
```

`vmax` 取视口宽高中较大的那个值。`150vmax` 比百分比半径更明确，也更适合「从任意位置覆盖完整视口」这个目标。

同时初始状态也从 `0%` 改成 `0`。这里表达的是半径为零，不需要百分比参与计算。

## 五、键盘触发不能从左上角扩散

主题菜单项是按钮。用户可以用鼠标点击，也可以用键盘 Tab 聚焦后按 Enter 或 Space 触发。

鼠标点击时，`event.clientX` 和 `event.clientY` 是有意义的。但键盘触发的 click 事件里，这两个值可能是 `0`。如果直接把 `(0, 0)` 当作圆心，动画就会从屏幕左上角扩散，和用户实际聚焦的菜单项完全不一致。

因此二次修改里新增了 `getEventOrigin`：

```ts
function getEventOrigin(event?: MouseEvent): { x: number; y: number } | undefined {
    if (!event) {
        return undefined;
    }

    if (event.detail > 0 && (event.clientX > 0 || event.clientY > 0)) {
        return { x: event.clientX, y: event.clientY };
    }

    const target = event.currentTarget as HTMLElement | null;
    if (!target) {
        return undefined;
    }

    const rect = target.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
    };
}
```

这里有两个判断：

- `event.detail > 0`：通常表示来自鼠标点击，而不是键盘触发的合成 click。
- `clientX > 0 || clientY > 0`：避免把无效的 `(0, 0)` 当成真实点击点。

如果是键盘触发，就退回到当前菜单项元素的中心点。这样动画仍然从「用户正在操作的控件」附近扩散，而不是从页面角落突然出现。

调用处也随之调整：

```ts
function switchScheme(newMode: LIGHT_DARK_MODE, event?: MouseEvent) {
    mode = newMode;

    const origin = getEventOrigin(event);
    if (origin) {
        setThemeWithAnimation(newMode, origin.x, origin.y);
    } else {
        setTheme(newMode);
    }

    updateDisplayedMode();
}
```

## 六、工具函数也要有兜底

组件里做了事件来源判断，并不代表工具函数可以完全信任入参。`setThemeWithAnimation` 是导出的工具函数，未来其他地方也可能调用它。

所以二次修改里把坐标参数改成可选，并在内部做最后兜底：

```ts
export function setThemeWithAnimation(
    theme: LIGHT_DARK_MODE,
    clickX?: number,
    clickY?: number,
): void {
    if (typeof document === "undefined" || typeof window === "undefined") {
        setThemeCore(theme);
        return;
    }

    const hasValidOrigin =
        typeof clickX === "number" &&
        typeof clickY === "number" &&
        Number.isFinite(clickX) &&
        Number.isFinite(clickY) &&
        (clickX > 0 || clickY > 0);
    const originX = hasValidOrigin ? clickX : window.innerWidth / 2;
    const originY = hasValidOrigin ? clickY : window.innerHeight / 2;

    document.documentElement.style.setProperty("--click-x", `${originX}px`);
    document.documentElement.style.setProperty("--click-y", `${originY}px`);

    const viewTransitionDocument = document as Document & {
        startViewTransition?: (callback: () => void) => void;
    };

    if (typeof viewTransitionDocument.startViewTransition === "function") {
        viewTransitionDocument.startViewTransition(() => {
            setThemeCore(theme);
        });
        return;
    }

    setThemeCore(theme);
}
```

这层兜底解决了两个问题：

1. 如果调用方没传坐标，动画从视口中心开始。
2. 如果传入的是无效数字、`NaN` 或 `(0, 0)`，也不会从左上角误扩散。

同时，不支持 View Transitions API 的浏览器仍然直接调用 `setThemeCore(theme)`。动画能力不应该影响主题切换功能本身。

## 七、减少动态效果偏好

`prefers-reduced-motion` 是一个很容易被忽略的点。圆形扩散本身是视觉冲击比较强的动画，对减少动态效果的用户来说，完整播放 0.5s 并不合适。

最终 CSS 里增加了：

```css
@media (prefers-reduced-motion: reduce) {
    ::view-transition-group(root),
    ::view-transition-old(root),
    ::view-transition-new(root) {
        animation-duration: 0.01ms;
        animation-name: none;
    }

    ::view-transition-new(root) {
        clip-path: none;
    }
}
```

这里不只是把动画时间压短，还额外把新视图的 `clip-path` 清掉。原因是：如果只取消动画名，新视图仍可能保留初始的 `clip-path: circle(0 ...)`，导致新快照被裁剪不可见。

这也是 review 后修改时最值得注意的细节之一。减少动态效果不是「动画播快一点」这么简单，还要确保禁用动画后页面最终状态仍然完整可见。

## 八、为什么保留无动画入口

这次没有把所有主题切换都改成 `setThemeWithAnimation`。初始化、系统主题变化、程序化调用仍然走原来的 `setTheme`：

```ts
export function setTheme(theme: LIGHT_DARK_MODE): void {
    setThemeCore(theme);
}
```

原因很简单：不是所有主题变化都来自用户点击。

- 页面加载时根据 localStorage 初始化主题，不应该播放一次扩散动画。
- 系统主题变化是外部环境变化，不应该假装有一个页面内点击点。
- 其他程序化调用可能没有明确交互来源，直接切换更稳定。

所以最终结构是：

- `setThemeCore`：只负责真正应用主题、保存配置、维护系统主题监听。
- `setTheme`：无动画入口，给初始化和程序化调用使用。
- `setThemeWithAnimation`：用户交互入口，在支持 View Transitions API 时播放圆形扩散。

这个拆分让动画成为增强体验，而不是主题系统的前置依赖。

## 九、最终效果和验证

这次最终版本覆盖了几条关键路径：

1. Chrome / Edge 中鼠标点击浅色、深色、跟随系统主题，动画从点击位置扩散。
2. 键盘触发主题菜单项时，动画从菜单项中心点扩散，不会从左上角出现。
3. 极宽屏、极高屏、角落点击时，`150vmax` 能覆盖完整视口。
4. 开启减少动态效果偏好后，不播放完整圆形扩散动画。
5. 不支持 View Transitions API 的浏览器仍能直接切换主题。
6. 初始化和系统主题变化不触发动画。

本地验证使用的是 `astro check`，结果为 0 errors / 0 warnings / 0 hints。

没有把 `pnpm build` 当作这次文章和 PR 修正的常规验证步骤，是因为项目构建脚本会生成 LQIP、字体子集等派生产物，容易把与本次主题动画无关的文件混进改动里。对这类三文件范围的前端交互修改，`astro check` 加手动交互验证更符合当前提交边界。

## 十、回看这次改动

初版证明了方向：View Transitions API + `clip-path: circle()` 很适合做主题切换的圆形扩散。

二次修改补齐的是工程质量：极端视口、键盘触发、减少动态效果、无效坐标兜底。这些细节单独看都不大，但它们决定了一个动画是「demo 能跑」，还是「能放进真实站点里长期维护」。

这也是这次实现最有价值的地方：动画本身并不复杂，真正需要认真处理的是它和输入方式、用户偏好、浏览器能力、主题系统入口之间的关系。

最后留下的结构比较清楚：

- JS 捕获真实交互来源。
- 工具函数兜底坐标和浏览器能力。
- CSS 声明动画形态和减少动态效果策略。
- 原有主题核心逻辑保持稳定。

这样圆形扩散动画只是主题切换上的一层增强，而不是把主题系统变得更脆弱的复杂度来源。
