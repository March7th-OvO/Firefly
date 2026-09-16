import type { SiteConfig } from "./siteConfig";

export type DiscoverWallpaperPreference = "daily" | "random" | "site";

export type DiscoverSearchEngine = {
	id: string;
	name: string;
	/** 搜索地址模板，使用 {query} 作为关键词占位符。 */
	url: string;
	/** 搜索框左侧显示的短标识，建议使用 1～2 个字符。 */
	badge: string;
};

export type DiscoverQuickLink = {
	name: string;
	url: string;
	icon: string;
	external?: boolean;
	/** 关联 siteConfig.pages；对应页面关闭时快捷入口会自动隐藏。 */
	pageKey?: keyof SiteConfig["pages"];
};

export type DiscoverConfig = {
	title: string;
	description: string;
	wallpaper: {
		defaultPreference: DiscoverWallpaperPreference;
		/** 每日壁纸图片地址，可指向会直接返回图片的 API。 */
		dailyUrl: string;
		/** 随机壁纸图片地址，可指向会直接返回图片的 API。 */
		randomUrl: string;
		dimmed: boolean;
		blur: number;
	};
	search: {
		placeholder: string;
		defaultEngine: string;
		engines: DiscoverSearchEngine[];
		suggestions: boolean;
		openInNewTab: boolean;
		suggestionItems: string[];
	};
	time: {
		showSeconds: boolean;
		showLunar: boolean;
		use12Hour: boolean;
	};
	quickLinks: DiscoverQuickLink[];
};
