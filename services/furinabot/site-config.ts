// FurinaBot 的站点侧配置集中在服务目录，避免与上游主题的通用配置耦合。
export interface FurinaLive2DConfig {
	enable: boolean;
	path: string;
	coreUrl: string;
	position: "bottom-left" | "bottom-right";
	size: { width: number; height: number };
	scale: number;
	articleRightOffset: string;
	responsive: { hideOnMobile: boolean; mobileBreakpoint: number };
}

export const furinaBotSiteConfig: {
	enable: boolean;
	chatEndpoint: string;
	articleIdMetaName: string;
	live2d: FurinaLive2DConfig;
} = {
	enable: true,
	chatEndpoint: "/api/agent/chat/",
	articleIdMetaName: "furinabot:article-id",
	live2d: {
		enable: true,
		path: "/furinabot/live2d/Furina/Furina.model3.json",
		coreUrl:
			"https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js",
		position: "bottom-right",
		size: { width: 240, height: 300 },
		scale: 1,
		articleRightOffset: "4.5rem",
		responsive: { hideOnMobile: true, mobileBreakpoint: 768 },
	},
};
