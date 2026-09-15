const REVEAL_SELECTOR = ".scroll-reveal:not(.scroll-reveal-visible)";
const REVEAL_THRESHOLD = 0.25;
const STAGGER_INTERVAL_MS = 80;

let revealObserver: IntersectionObserver | null = null;

/**
 * 让同一批进入视口的元素按文档顺序依次出现；这里只改变视觉状态，
 * 页面内容始终已经存在于 DOM 中，不参与懒加载。
 */
function revealEntries(entries: IntersectionObserverEntry[]): void {
	const visibleEntries = entries
		.filter((entry) => entry.isIntersecting)
		.sort((a, b) => {
			if (a.target === b.target) return 0;
			return a.target.compareDocumentPosition(b.target) &
				Node.DOCUMENT_POSITION_FOLLOWING
				? -1
				: 1;
		});

	visibleEntries.forEach((entry, index) => {
		const element = entry.target as HTMLElement;
		element.style.setProperty(
			"--scroll-reveal-delay",
			`${index * STAGGER_INTERVAL_MS}ms`,
		);
		const markFinished = (event: AnimationEvent) => {
			// 子元素的 animationend 会冒泡，只响应当前显现动画本身。
			if (
				event.target !== element ||
				event.animationName !== "scroll-reveal-in"
			) {
				return;
			}
			element.classList.add("scroll-reveal-finished");
			element.removeEventListener("animationend", markFinished);
		};
		element.addEventListener("animationend", markFinished);
		element.classList.add("scroll-reveal-visible");
		revealObserver?.unobserve(element);
	});
}

function getRevealObserver(): IntersectionObserver | null {
	if (!("IntersectionObserver" in window)) return null;
	if (revealObserver) return revealObserver;

	revealObserver = new IntersectionObserver(revealEntries, {
		threshold: REVEAL_THRESHOLD,
	});
	return revealObserver;
}

/** 初始化当前页面及 Swup 换页后新增的滚动显现元素。 */
export function initScrollReveal(root: ParentNode = document): void {
	const elements = Array.from(
		root.querySelectorAll<HTMLElement>(REVEAL_SELECTOR),
	);
	if (elements.length === 0) return;

	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
		for (const element of elements) {
			element.classList.add("scroll-reveal-visible");
		}
		return;
	}

	const observer = getRevealObserver();
	if (!observer) {
		for (const element of elements) {
			element.classList.add("scroll-reveal-visible");
		}
		return;
	}

	for (const element of elements) observer.observe(element);
}

/** 注册一次全局监听，兼容首次加载与 Astro/Swup 客户端导航。 */
export function setupScrollReveal(): void {
	document.documentElement.classList.add("scroll-reveal-enabled");
	const scan = () => requestAnimationFrame(() => initScrollReveal());

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", scan, { once: true });
	} else {
		scan();
	}

	document.addEventListener("astro:page-load", scan);
	document.addEventListener("swup:contentReplaced", scan);
}
