export interface PageContext {
	articleId?: string;
	title: string;
	url: string;
}

// 每次发送时读取当前 DOM，适配 Swup 的站内导航。
export function getPageContext(): PageContext {
	const articleId = document.querySelector<HTMLMetaElement>(
		'meta[name="furinabot:article-id"]',
	)?.content;
	return { articleId, title: document.title, url: location.pathname };
}
