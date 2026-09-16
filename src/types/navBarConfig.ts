export type NavBarLink = {
	name: string;
	url: string;
	external?: boolean;
	icon?: string; // 菜单项图标
	children?: NavBarLink[]; // 支持子菜单
	pageKey?: string;
	/** 跳过 Swup，适用于使用独立页面骨架的入口。 */
	noSwup?: boolean;
};

export enum NavBarSearchMethod {
	PageFind = 0,
}

export type NavBarSearchConfig = {
	method: NavBarSearchMethod;
};

export type NavBarConfig = {
	links: NavBarLink[];
};
