import { furinaBotSiteConfig } from "../../site-config";

export interface PageContext {
	articleId?: string;
	title: string;
	url: string;
}

// 每次发送时读取当前 DOM，适配 Swup 的站内导航。
export function getPageContext(): PageContext | null {
	const page = document.querySelector<HTMLElement>("#swup-container");
	// 404 页面通过随 Swup 容器更新的标记排除，避免沿用上一页的上下文。
	if (page?.dataset.furinabotPageContext === "disabled") return null;
	const articleId = document.querySelector<HTMLMetaElement>(
		`meta[name="${furinaBotSiteConfig.articleIdMetaName}"]`,
	)?.content;
	return {
		articleId,
		title: page?.dataset.furinabotPageTitle || document.title,
		url: location.pathname,
	};
}
