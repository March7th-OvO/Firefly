import type { FontDefinition, FontSelectionConfig } from "@/types/fontConfig";

export const fontsList: FontDefinition[] = [
	{
		name: "Google Sans",
		cssVariable: "--font-google-sans",
		provider: "local",
		options: {
			variants: [
				{
					src: ["./public/assets/fonts/GoogleSans-Regular.ttf"],
					weight: "400",
					style: "normal",
				},
				// {
				// 	src: ["./public/assets/fonts/GoogleSans-Medium.ttf"],
				// 	weight: "500",
				// 	style: "normal",
				// },
				// {
				// 	src: ["./public/assets/fonts/GoogleSans-Bold.ttf"],
				// 	weight: "700",
				// 	style: "normal",
				// },
			],
		},
		fallbacks: ["sans-serif"],
		display: "swap",
	},
	{
		name: "Parisienne",
		cssVariable: "--font-parisienne",
		provider: "local",
		options: {
			variants: [
				{
					src: ["./public/assets/fonts/Parisienne-Regular.ttf"],
					weight: "400",
					style: "normal",
				},
			],
		},
		fallbacks: ["cursive", "sans-serif"],
		display: "swap",
	},
	{
		name: "Zen Maru Gothic",
		cssVariable: "--font-zen-maru-gothic",
		provider: "fontsource",
		weights: ["300", "400", "500", "600", "700"],
		styles: ["normal"],
		subsets: ["latin", "cyrillic"],
		fallbacks: ["sans-serif"],
	},
	{
		name: "Inter",
		cssVariable: "--font-inter",
		provider: "fontsource",
		weights: ["300", "400", "500", "600", "700"],
		styles: ["normal"],
		subsets: ["latin", "cyrillic"],
		fallbacks: ["sans-serif"],
	},
	{
		name: "JetBrains Mono",
		cssVariable: "--font-jetbrains-mono",
		provider: "fontsource",
		weights: ["400", "700"],
		styles: ["normal"],
		subsets: ["latin", "cyrillic"],
		fallbacks: [
			"ui-monospace",
			"SFMono-Regular",
			"Menlo",
			"Monaco",
			"Consolas",
			"Liberation Mono",
			"Courier New",
			"monospace",
		],
	},
	{
		name: "GreatVibes Regular 2",
		cssVariable: "--font-greatvibes",
		provider: "local",
		options: {
			variants: [
				{
					src: ["./public/assets/fonts/GreatVibes-Regular-2.otf"],
				},
			],
		},
		fallbacks: ["sans-serif"],
	},
];

export const fontConfig: FontSelectionConfig = {
	enable: true,
	selected: ["system"],
	bannerTitleFont: "--font-google-sans",
	bannerTitleAccentFont: "--font-parisienne",
	bannerSubtitleFont: "--font-inter",
	navbarTitleFont: "",
	codeFont: "--font-jetbrains-mono",
	subsetFonts: {
		"--font-google-sans": {
			extraChars: "",
		},
		"--font-parisienne": {
			extraChars: "",
		},
		"--font-greatvibes": {
			extraChars: "",
		},
	},
};
