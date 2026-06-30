# feat: 实现黑暗模式圆形扩散动画 PR 后续修改建议

## 背景

当前上游 PR 标题已经改为 `feat: 实现黑暗模式圆形扩散动画`。该 PR 的核心功能是为浅色、深色、跟随系统主题切换增加基于 View Transitions API 的圆形扩散动画。

当前实现方向没有明显问题，但 Sourcery review 提出了几个值得处理的细节。建议在本地拉取远程仓库后，让 Codex 按本文档完成修复，再追加提交到同一个 PR 分支。

## 目标

在不改变现有主题切换功能的前提下，补齐以下细节：

1. 修复 `circle(150%)` 在极宽屏、极高屏或角落点击时可能无法覆盖整个视口的问题。
2. 处理键盘触发或非鼠标触发时 `clientX/clientY` 为 `0`，导致动画从左上角扩散的问题。
3. 尊重 `prefers-reduced-motion`，减少动效偏好的用户不应看到完整 0.5s 圆形扩散动画。
4. 保持不支持 `document.startViewTransition` 的浏览器继续直接切换主题。
5. 保持初始化、系统主题变化、程序化主题切换仍走无动画入口 `setTheme`。

## 需要修改的文件

预计涉及以下文件：

- `src/styles/main.css`
- `src/utils/setting-utils.ts`
- `src/components/controls/LightDarkSwitch.svelte`

## 修改建议一：将圆形扩散半径改为 `vmax`

当前 `src/styles/main.css` 中的关键帧大致为：

```css
@keyframes theme-circle-expand {
    0% {
        clip-path: circle(0% at var(--click-x, 50%) var(--click-y, 50%));
    }
    100% {
        clip-path: circle(150% at var(--click-x, 50%) var(--click-y, 50%));
    }
}
```

建议修改为：

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

原因：`circle(150%)` 的百分比半径在不同浏览器实现和极端视口比例下不如 `vmax` 稳定。`150vmax` 基于视口较长边计算，更能保证从任意点击位置覆盖完整屏幕。

## 修改建议二：增加 `prefers-reduced-motion` 处理

在 `src/styles/main.css` 的 View Transitions 样式附近增加：

```css
@media (prefers-reduced-motion: reduce) {
    ::view-transition-group(root),
    ::view-transition-old(root),
    ::view-transition-new(root) {
        animation-duration: 0.01ms;
        animation-name: none;
    }
}
```

如果希望更保守，也可以只禁用新视图的圆形扩散：

```css
@media (prefers-reduced-motion: reduce) {
    ::view-transition-new(root) {
        animation: none;
        clip-path: none;
    }
}
```

推荐第一种，处理更完整。

## 修改建议三：处理键盘触发和无效坐标

当前 `setThemeWithAnimation` 直接接收 `clickX` 和 `clickY`：

```ts
export function setThemeWithAnimation(
    theme: LIGHT_DARK_MODE,
    clickX: number,
    clickY: number,
): void {
    // ...
}
```

问题：键盘触发 click 事件时，`event.clientX` / `event.clientY` 可能为 `0`，动画会从左上角扩散，观感不自然。

建议将函数改为接收可选坐标，并在坐标无效时回退到视口中心：

```ts
export function setThemeWithAnimation(
    theme: LIGHT_DARK_MODE,
    clickX?: number,
    clickY?: number,
): void {
    if (typeof document === "undefined") {
        setThemeCore(theme);
        return;
    }

    const originX = typeof clickX === "number" && clickX > 0
        ? clickX
        : window.innerWidth / 2;
    const originY = typeof clickY === "number" && clickY > 0
        ? clickY
        : window.innerHeight / 2;

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

## 修改建议四：更精细地使用触发元素中心点

如果想更贴近 Sourcery 的建议，可以在 `LightDarkSwitch.svelte` 中不要只传 `event.clientX` / `event.clientY`，而是在鼠标坐标无效时使用当前菜单项元素中心点。

示例思路：

```ts
function getEventOrigin(event?: MouseEvent): { x: number; y: number } | undefined {
    if (!event) return undefined;

    if (event.clientX > 0 || event.clientY > 0) {
        return { x: event.clientX, y: event.clientY };
    }

    const target = event.currentTarget as HTMLElement | null;
    if (!target) return undefined;

    const rect = target.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
    };
}
```

然后在 `switchScheme` 中使用：

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

也可以更简单：始终调用 `setThemeWithAnimation(newMode, origin?.x, origin?.y)`，让工具函数内部兜底到视口中心。

## 推荐最终方案

推荐组合：

1. `main.css` 中将 `circle(150%)` 改为 `circle(150vmax)`。
2. `main.css` 中增加 `prefers-reduced-motion: reduce` 媒体查询。
3. `LightDarkSwitch.svelte` 中增加 `getEventOrigin`，鼠标点击用点击坐标，键盘触发用菜单项中心点。
4. `setting-utils.ts` 中让 `setThemeWithAnimation` 接收可选坐标，并兜底到视口中心。

这样能同时满足可访问性、极端屏幕覆盖、非鼠标交互和浏览器兼容性。

## 验证步骤

修改完成后建议执行：

```bash
pnpm astro check
pnpm build
```

如果项目脚本中没有 `pnpm astro check`，则使用仓库现有脚本，例如：

```bash
pnpm check
pnpm build
```

还需要手动验证：

1. Chrome / Edge 中点击浅色、深色、跟随系统主题，动画从点击位置扩散。
2. 使用键盘 Tab 聚焦主题菜单项后按 Enter，动画不应从左上角扩散。
3. 浏览器或系统设置为减少动态效果后，主题切换不应播放完整圆形扩散动画。
4. 不支持 View Transitions API 的浏览器仍能正常切换主题。
5. 初始化和系统主题变化不会意外播放动画。

## PR 回复建议

修复完成并推送后，可以在 PR 中回复：

```md
已根据 review 补充处理：

- 将圆形扩散终点从 `150%` 改为 `150vmax`，保证极端视口比例和角落点击时也能覆盖完整屏幕。
- 增加 `prefers-reduced-motion` 处理，减少动效偏好下禁用完整圆形扩散动画。
- 为键盘触发或无效点击坐标增加 fallback，避免动画从左上角异常扩散。

已重新执行本地检查。
```
