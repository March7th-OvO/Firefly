import type { IdCardConfig } from "@/types/idCard";

/** About 页面身份名片的全部文本内容。 */
export const idCardConfig: IdCardConfig = {
	documentTitle: "胡小桃的个人名片", //无障碍描述，用于供屏幕阅读器识别这个内嵌区域
	brand: "NETWORK IDENTITY",
	status: "ONLINE · REGION EARTH",
	latinNameLines: ["HU", "XIAOTAO"],
	localName: "胡小桃",
	fields: [
		{
			label: "Website",
			value: "furinafans.com",
		},
		{
			label: "GitHub",
			value: "@March7th-OvO",
		},
		{
			label: "Stack",
			value: "Java · Python",
		},
	],
	statementLines: ["Across the Great Wall,", "And into the World."],
	interactionHint: "MOVE POINTER · 3D PARALLAX ENABLED",
	networkAriaLabel: "全球网络节点和链路", //无障碍描述，用于向无障碍设备描述网络部分
};
