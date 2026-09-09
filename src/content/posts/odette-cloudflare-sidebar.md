---
title: 向 Cloudflare 借一点顺滑：Odette 侧边栏的打磨记录
published: 2026-09-07
updated: 2026-09-08
description: "从 Cloudflare 侧边栏获得灵感，记录 Odette 从点击折叠到悬停展开的改进过程：260ms 缓动、Grid 文字展开、稳定的内容布局，以及顺眼背后的工程取舍。"
tags: [React, CSS, Cloudflare, 视觉交互, 前端]
category: 开发记录
draft: false
---

有些界面很奇妙。第一次用的时候，并不会觉得它在展示什么复杂技术，只是鼠标移过去，菜单展开，操作完成，再自然地收回去。一切都很顺手，甚至不太会留意动画本身。

Cloudflare Dashboard 的侧边栏就给了我这样的感觉。于是，在改进 Odette 时，我想把这种体验搬过来：平时安静地留在页面左侧，需要使用时再展开，让图片始终是界面的主角。

真正拆解后才发现，“顺滑顺眼”并不是加一行 `transition` 就能得到的。它来自运动节奏、布局稳定性和视觉细节的配合。一个组件可以已经能用，却仍然有不少值得打磨的地方。

## 一、从“能收起来”到“自然地展开”

这次改进可以分成三个阶段。

| 阶段 | 提交 | 侧边栏发生的变化 |
| --- | --- | --- |
| 建立导航结构 | [`2177bb0`](https://github.com/March7th-OvO/Odette/commit/2177bb0179afe73fe7daea692ae4e6a85628e84e) | 添加独立的 `Sidebar` 组件，提供图片库、上传图片入口，使用按钮控制折叠 |
| 改成悬停展开 | [`cb5a104`](https://github.com/March7th-OvO/Odette/commit/cb5a104597d4383c90268008950b4bf9c8beeba1) | 移除折叠按钮，默认保留 80px 图标栏，鼠标悬停或键盘焦点进入时展开 |
| 打磨展开过程 | [`de62e1e`](https://github.com/March7th-OvO/Odette/commit/de62e1e6d44a23ec6400a3e8d8ee6de53e009d13) | 引入显式交互状态、260ms 缓动、文字延迟与 Grid 展开，并固定主内容区的布局占位 |

第二次提交是“实现文件夹导航和当前目录上传功能”，但它的差异中也包含侧边栏的交互改动。

最初的按钮折叠方案很直接：维护一个 `collapsed` 状态，点击按钮后改变宽度，隐藏标签。这解决了功能问题，但每次展开都要多点一下。

改成悬停后，操作变得轻了。不过，这一版文字仍然通过 `display: none` 与 `display: block` 切换；展开时还会切换对齐方式和导航上方的间距。外壳正在移动，里面的内容却突然出现或换位置，整个过程就容易显得不连贯。

第三版开始处理这些“过程里的细节”。

## 二、运动节奏：大约四分之一秒，先响应，再停稳

最初 F12 分析参考样式时，我注意到的是大约 250ms 的动画时长。Odette 最终代码里采用的具体参数是：

```css
:root {
  --motion-duration: 160ms;
  --sidebar-motion-duration: 260ms;
  --sidebar-easing: cubic-bezier(.22, 1, .36, 1);
  --sidebar-label-delay: 45ms;
}
```

260ms 负责侧边栏的主要展开动作，160ms 用于文字透明度等较轻的反馈，45ms 则让文字稍晚一点进入。

这种时间尺度：足够短，操作不需要等；又足够长，能看清界面从收起到展开的过程。组件尺寸、移动距离和使用频率都会影响感受。

缓动曲线同样重要。`cubic-bezier(.22, 1, .36, 1)` 在前段快速推进，后段逐渐减速。鼠标刚进入时，界面立刻给出明显反馈；临近终点时，再轻轻停住。

所谓“物理感”，就是这种速度变化带来的感受。它没有真的计算质量或惯性，也不是弹簧模拟，但比机械的匀速伸缩更符合我想要的节奏。

还有一个很小的先后关系：外壳先让出空间，文字再跟上。45ms 的延迟并不会形成明显停顿，却能避免所有元素在同一瞬间争着出现。按声明时长计算，文字的 Grid 过渡约在触发后 305ms 结束，因此“260ms 动画”也不是所有细节同时结束的意思。

## 三、文字展开：添加中间状态

这一版没有给标签增加独立的水平位移动画，而是让它占据的空间逐渐打开。以下为仓库中的核心样式：

```css
.sidebar-label {
  display: grid;
  grid-template-columns: 0fr;
  min-width: 0;
  opacity: 0;
  pointer-events: none;
  transition:
    grid-template-columns var(--sidebar-motion-duration) var(--sidebar-easing),
    opacity var(--motion-duration) ease;
}

.sidebar-label-content {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

.sidebar[data-state='expanded'] .sidebar-label {
  grid-template-columns: 1fr;
  opacity: 1;
  pointer-events: auto;
  transition-delay: var(--sidebar-label-delay);
}
```

这里用的是 **`grid-template-columns`，不是 `grid-template-rows`**。参考分析里的 `0fr → 1fr` 常用于纵向子菜单，而 Odette 要打开的是图标旁边的横向文字空间。

外层 Grid 负责控制空间，内层负责裁切内容。`min-width: 0` 允许内容收缩，`overflow: hidden` 隐藏超出部分，`white-space: nowrap` 避免标签在狭窄的中间状态突然折成两行。再叠加透明度过渡，文字就有了逐渐显露的过程。

Grid 轨道尺寸支持插值，因此可以在兼容的轨道定义之间连续过渡；这正是这种写法成立的基础。它的价值是用 CSS 表达内容展开，而不必在 JavaScript 中逐帧测量和设置尺寸。[web.dev：CSS animated grid layouts](https://web.dev/articles/css-animated-grid-layouts)

这让我对动效多了一点理解：收起和展开两个终点好看还不够，宽度只有一半、文字刚露出来的时候，也应该有合理的样子。

## 四、更关键的一步：让图片区域留在原地

如果只关注侧边栏，很容易忽略它旁边的内容。

旧版布局给侧边栏分配的是自动宽度轨道：

```css
/* 改进前 */
.app-shell {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
}
```

当左侧宽度变化时，右侧工作区的可用空间也会跟着变化。对于图片管理页面，这会干扰正在浏览的内容。

新版把导航的布局占位固定下来：

```css
/* 改进后 */
.app-shell {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr);
  min-height: 100dvh;
}
```

侧边栏默认是 80px，在大屏展开到 224px，超出占位的部分覆盖在工作区上方，并用阴影表达层级。更窄的桌面或平板视口下，展开宽度分别调整到 208px、184px。

这样，导航可以运动，图片区域却不必跟着让位。对于需要频繁浏览图片的工具，我更愿意接受展开时短暂覆盖一小块内容，换取视觉上的稳定。

这也是“顺眼”中很容易漏掉的一环：动画主体很流畅，如果它让整个页面跟着挪动，整体体验仍然会显得忙乱。

## 五、Grid 有布局成本，顺滑也需要证据


**Grid 轨道动画依然会触发布局计算。** Odette 同时还在过渡 `width`、`padding-inline` 和 `box-shadow`。`overflow: hidden` 负责裁切，也不等于裁切之外的内容完全不参与布局。

对于能用位移或淡入淡出表达的效果，`transform` 与 `opacity` 通常更有机会在合成阶段完成。代码中的 `will-change: width` 也只是提示，不会把宽度变化变成免费的 GPU 动画。[web.dev：高性能 CSS 动画指南](https://web.dev/articles/animations-guide)

因此，使用 Grid 管理文字的自然展开，同时通过固定工作区占位，避免导航宽度变化牵动主内容布局。它是表达能力与成本之间的取舍，而不是找到了某个“最省性能”的万能属性。

同样，传统 CSS 过渡不能直接平滑插值 `height: 0` 与 `height: auto`，主要涉及数值与内在尺寸之间的插值限制。如今也有 `interpolate-size` 等能力可以处理部分场景，使用时仍需确认浏览器兼容性，不能再笼统地说 `auto` 永远不能动画。[MDN：interpolate-size](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/interpolate-size)

这篇记录基于提交差异和源码分析，没有附带性能数据。“顺滑”是这次追求的体验，而不是一丝不苟的测试结论。

## 六、参考设计里的视觉润滑剂

在我对参考样式的观察中，另一些让人舒服的细节，是滚动边缘的渐隐、展开箭头的旋转，以及文字和图标的轻微滑入。

渐变遮罩让滚动内容接近边缘时逐渐淡去，减少硬裁切的突兀感；箭头旋转把展开状态传达出来；小幅位移则为内容出现提供方向。它们不一定显眼，却能让界面的变化更容易理解。

不过，在本次侧边栏优化改进里，暂时没有进一步添加滚动边缘渐变遮罩，没有子菜单箭头的 90° 旋转，也没有标签的独立 `translateX` 过渡。

现在的 Odette 只有图片库和上传两个主要导航入口，也没有必要为了复刻参考界面而增加一个复杂的滚动菜单。等导航内容变多，再考虑边缘羽化和分组动效，会更符合实际需要。


## 七、鼠标之外，展开也要有一致的逻辑

在 React 中分别记录指针和键盘焦点状态，再合成一个展开条件：

```tsx
const [pointerInside, setPointerInside] = useState(false);
const [keyboardFocusInside, setKeyboardFocusInside] = useState(false);
const expanded = pointerInside || keyboardFocusInside;
```

组件通过 `data-state` 驱动 CSS。指针进入和离开会更新状态；焦点进入时检查 `:focus-visible`，离开时判断下一个焦点是否仍在侧边栏内。这样，键盘导航也有展开路径，指针移开时也不必立刻打断仍在内部的键盘操作。

导航链接保留 `aria-label`，使图标状态下仍有可访问名称。这里记录的是源码提供的支持，不代表已经完成所有辅助技术的验证。

小屏幕则改成横向导航，不要求触屏用户依赖悬停。对于开启“减少动态效果”的用户，样式把动画时长和标签延迟都设为零：

```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-duration: 0ms;
    --sidebar-motion-duration: 0ms;
    --sidebar-label-delay: 0ms;
  }
}
```

动效可以改善反馈，也应该允许用户跳过。一个侧边栏是否好用，最终还要看不同输入方式下能不能顺利完成操作。

