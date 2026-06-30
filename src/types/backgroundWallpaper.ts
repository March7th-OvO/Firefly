export type BackgroundWallpaperConfig = {
	mode: "banner" | "fullscreen" | "overlay" | "none";
	switchable?: boolean;
	playerEnable?: boolean;
	src:
		| string
		| string[]
		| {
				desktop?: string | string[];
				mobile?: string | string[];
				playerUrl?: string | string[];
		  };
	common?: {
		dimOpacity?: number;
		playerMode?: "order" | "random";
		homeText?: {
			enable: boolean;
			switchable?: boolean;
			title?: string;
			titleAccent?: string;
			subtitle?: string | string[];
			titleSize?: string;
			subtitleSize?: string;
			typewriter?: {
				enable: boolean;
				speed: number;
				deleteSpeed: number;
				pauseTime: number;
			};
		};
		navbar?: {
			transparentMode?: "semi" | "full" | "semifull";
			enableBlur?: boolean;
			blur?: number;
		};
		waves?: {
			enable:
				| boolean
				| {
						desktop: boolean;
						mobile: boolean;
				  };
			switchable?: boolean;
		};
		gradient?: {
			enable:
				| boolean
				| {
						desktop: boolean;
						mobile: boolean;
				  };
			height?: string;
			switchable?: boolean;
		};
		carousel?: {
			enable: boolean;
			interval?: number;
			transitionEffect?: "fade" | "zoom" | "slide" | "kenburns";
			switchable?: boolean;
		};
	};
	banner?: {
		position?:
			| "top"
			| "center"
			| "bottom"
			| "top left"
			| "top center"
			| "top right"
			| "center left"
			| "center center"
			| "center right"
			| "bottom left"
			| "bottom center"
			| "bottom right"
			| "left top"
			| "left center"
			| "left bottom"
			| "right top"
			| "right center"
			| "right bottom"
			| string;
	};
	overlay?: {
		switchable?:
			| boolean
			| {
					opacity?: boolean;
					blur?: boolean;
					cardOpacity?: boolean;
			  };
		zIndex?: number;
		opacity?: number;
		blur?: number;
		cardOpacity?: number;
	};
	fullscreen?: {
		position?: string;
	};
};
