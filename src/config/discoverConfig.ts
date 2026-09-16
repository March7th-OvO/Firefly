import type { DiscoverConfig } from "@/types/discoverConfig";

/**
 * 探索页配置。
 * 页面总开关位于 siteConfig.pages.discover；这里负责页面内容与默认交互偏好。
 */
export const discoverConfig: DiscoverConfig = {
	title: "探索",
	description: "从此刻出发，搜索网络或快速前往站内常用页面。",
	wallpaper: {
		// daily：每日壁纸；random：随机壁纸；site：沿用站点壁纸。
		defaultPreference: "site",
		// 这两个地址需要直接返回图片；不可用时页面会自动回退到站点壁纸。
		dailyUrl:
			"https://bing.biturl.top/?resolution=1920&format=image&index=0&mkt=zh-CN",
		randomUrl: "https://t.alcy.cc/pc",
		dimmed: true,
		blur: 0,
	},
	search: {
		placeholder: "探索一下",
		defaultEngine: "bing",
		engines: [
			{
				id: "baidu",
				name: "百度",
				url: "https://www.baidu.com/s?wd={query}",
				badge: "百",
			},
			{
				id: "bing",
				name: "必应",
				url: "https://cn.bing.com/search?q={query}",
				badge: "B",
			},
			{
				id: "google",
				name: "Google",
				url: "https://www.google.com/search?q={query}",
				badge: "G",
			},
			{
				id: "sogou",
				name: "搜狗",
				url: "https://www.sogou.com/web?query={query}",
				badge: "S",
			},
			{
				id: "so360",
				name: "360 搜索",
				url: "https://www.so.com/s?q={query}",
				badge: "360",
			},
			{
				id: "weibo",
				name: "微博",
				url: "https://s.weibo.com/weibo?q={query}",
				badge: "微",
			},
			{
				id: "bilibili",
				name: "BiliBili",
				url: "https://search.bilibili.com/all?keyword={query}",
				badge: "B站",
			},
			{
				id: "github",
				name: "GitHub",
				url: "https://github.com/search?q={query}",
				badge: "GH",
			},
			{
				id: "zhihu",
				name: "知乎",
				url: "https://www.zhihu.com/search?q={query}",
				badge: "知",
			},
		],
		suggestions: true,
		openInNewTab: true,
		suggestionItems: ["Furina", "Firefly Astro", "最新文章", "项目", "相册"],
	},
	time: {
		showSeconds: false,
		showLunar: true,
		use12Hour: false,
	},
	quickLinks: [
		{
			name: "主页",
			url: "/",
			icon: "material-symbols:home",
		},
		{
			name: "归档",
			url: "/archive/",
			icon: "material-symbols:archive",
		},
		{
			name: "项目",
			url: "/projects/",
			icon: "material-symbols:star",
			pageKey: "projects",
		},
		{
			name: "相册",
			url: "/gallery/",
			icon: "material-symbols:photo-library",
			pageKey: "gallery",
		},
		{
			name: "书签",
			url: "/booknav/",
			icon: "material-symbols:link",
			pageKey: "booknav",
		},
	],
};
