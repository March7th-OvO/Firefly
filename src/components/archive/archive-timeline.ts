import type { TimelineScene } from "./timeline-scene";

interface Article {
	id: string;
	title: string;
	url: string;
	date: string;
	year: number;
	category: string;
	tags: string[];
	summary: string;
}

/** 自定义元素的生命周期对应 Swup 的插入/移除，避免路由重访重复创建 renderer。 */
class ArchiveTimelineElement extends HTMLElement {
	private abort?: AbortController;
	private scene?: TimelineScene;
	private articles: Article[] = [];
	private selected = 0;
	private listMode = false;
	private available = false;
	private announcement = 0;
	private animations: Animation[] = [];
	private query<T extends HTMLElement = HTMLElement>(name: string): T {
		return this.querySelector<T>(`[data-${name}]`)!;
	}

	connectedCallback(): void {
		// 升级或 Swup 插入时等待子节点完整；每次连接都有独立取消令牌。
		this.abort = new AbortController();
		const signal = this.abort.signal;
		queueMicrotask(() => {
			if (this.isConnected && !signal.aborted) this.init(signal);
		});
	}
	disconnectedCallback(): void {
		this.abort?.abort();
		this.scene?.dispose();
		this.scene = undefined;
		clearTimeout(this.announcement);
		for (const animation of this.animations) animation.cancel();
	}
	private init(signal: AbortSignal): void {
		const all = JSON.parse(
			this.query<HTMLScriptElement>("articles").textContent || "[]",
		) as Article[];
		const params = new URLSearchParams(location.search);
		const tags = params.getAll("tag"),
			categories = params.getAll("category"),
			uncategorized = !!params.get("uncategorized");
		// 与 ArchivePanel 保持相同组合语义：组内 OR，标签/分类之间 AND。
		this.articles = all.filter(
			(article) =>
				(!tags.length || article.tags.some((tag) => tags.includes(tag))) &&
				(!categories.length || categories.includes(article.category)) &&
				(!uncategorized || !article.category),
		);
		this.selected = 0;
		this.available = false;
		this.query("count").textContent = String(this.articles.length);
		this.query("filter").textContent = [
			...categories,
			...tags.map((tag) => `#${tag}`),
			...(uncategorized ? ["未分类"] : []),
		].join(" / ");
		const years = this.query("years");
		years.replaceChildren();
		for (const year of new Set(this.articles.map((article) => article.year))) {
			const button = document.createElement("button");
			button.type = "button";
			button.textContent = String(year);
			button.dataset.year = String(year);
			button.addEventListener(
				"click",
				() =>
					this.select(
						this.articles.findIndex((article) => article.year === year),
					),
				{ signal },
			);
			years.append(button);
		}
		const range = this.query<HTMLInputElement>("range");
		range.max = String(Math.max(0, this.articles.length - 1));
		range.addEventListener("input", () => this.select(Number(range.value)), {
			signal,
		});
		this.query("prev").addEventListener(
			"click",
			() => this.select(this.selected - 1),
			{ signal },
		);
		this.query("next").addEventListener(
			"click",
			() => this.select(this.selected + 1),
			{ signal },
		);
		this.query("mode").addEventListener(
			"click",
			() => this.setListMode(!this.listMode),
			{ signal },
		);
		this.setListMode(false);
		this.render(false);
		if (!this.articles.length) {
			this.fail("没有符合筛选条件的文章，可通过顶部导航重新选择分类。");
			return;
		}
		this.query("status").hidden = false;
		this.query("status").textContent = "正在准备档案场景…";
		// Three.js 只进入归档页的异步代码块，不增加首页的初始执行成本。
		void import("./timeline-scene")
			.then((module) => {
				if (signal.aborted) return;
				return module.createTimelineScene(this.query("stage"), {
					count: this.articles.length,
					model: this.dataset.model!,
					signal,
					onSelect: (index) => {
						this.selected = index;
						this.render(true);
					},
					onFailure: () =>
						this.fail("三维场景暂不可用，文章列表仍可正常阅读。"),
				});
			})
			.then((scene) => {
				if (!scene) return;
				if (signal.aborted) {
					scene.dispose();
					return;
				}
				this.scene = scene;
				this.available = true;
				this.query("status").hidden = true;
				scene.select(this.selected);
				this.setListMode(this.listMode);
			})
			.catch((error) => {
				if (!signal.aborted) {
					console.error("Archive timeline:", error);
					this.fail("三维场景加载失败，已保留完整文章列表。刷新页面可重试。");
				}
			});
	}
	private fail(message: string): void {
		this.available = false;
		this.query("status").hidden = false;
		this.query("status").textContent = message;
		this.query("list").hidden = false;
		this.query("mode").setAttribute("aria-expanded", "true");
		this.scene?.dispose();
		this.scene = undefined;
	}
	private select(index: number): void {
		index = Math.max(0, Math.min(this.articles.length - 1, index));
		if (index === this.selected) return;
		this.selected = index;
		this.render(true);
		this.scene?.select(index);
	}
	private setListMode(value: boolean): void {
		this.listMode = value;
		this.query("list").hidden = this.available && !value;
		this.query("visual").hidden = value;
		this.query("mode").textContent = value ? "三维视图 ↗" : "列表视图 ↗";
		this.query("mode").setAttribute(
			"aria-expanded",
			String(value || !this.available),
		);
		this.scene?.suspend(value);
	}
	private render(animate: boolean): void {
		const article = this.articles[this.selected];
		this.query("preview").hidden = !article;
		this.query<HTMLInputElement>("range").disabled = !article;
		this.query<HTMLButtonElement>("prev").disabled =
			!article || this.selected === 0;
		this.query<HTMLButtonElement>("next").disabled =
			!article || this.selected === this.articles.length - 1;
		if (!article) return;
		this.query("number").textContent = String(this.selected + 1).padStart(
			3,
			"0",
		);
		this.query("date").textContent = article.date;
		this.query("title").textContent = article.title;
		this.query("summary").textContent = article.summary;
		this.query("meta").textContent = [
			article.category || "未分类",
			...article.tags.slice(0, 3).map((tag) => `#${tag}`),
		].join(" / ");
		this.query<HTMLAnchorElement>("read").href = article.url;
		this.query<HTMLInputElement>("range").value = String(this.selected);
		this.query<HTMLInputElement>("range").setAttribute(
			"aria-valuetext",
			`${article.date} ${article.title}`,
		);
		this.query("boundary").textContent =
			this.selected === 0
				? "最新文章"
				: this.selected === this.articles.length - 1
					? "最早文章"
					: `${article.year} 年`;
		this.query("progress").textContent =
			`${String(this.selected + 1).padStart(2, "0")} / ${String(this.articles.length).padStart(2, "0")}`;
		for (const button of this.query(
			"years",
		).querySelectorAll<HTMLButtonElement>("button"))
			button.setAttribute(
				"aria-current",
				String(Number(button.dataset.year) === article.year),
			);
		for (const animation of this.animations) animation.cancel();
		this.animations = [];
		if (animate && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
			this.animations = ["title", "number"].map((name) =>
				this.query(name).animate(
					[
						{
							transform: "translateY(7px)",
							opacity: 0.25,
							filter: "blur(1px)",
						},
						{ transform: "translateY(0)", opacity: 1, filter: "blur(0)" },
					],
					{ duration: 300, easing: "cubic-bezier(.2,.7,.2,1)" },
				),
			);
		}
		clearTimeout(this.announcement);
		this.announcement = window.setTimeout(() => {
			this.query("announcement").textContent =
				`${article.date}，${article.title}`;
		}, 250);
	}
}

if (!customElements.get("archive-timeline"))
	customElements.define("archive-timeline", ArchiveTimelineElement);
