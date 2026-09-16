import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { glob } from "glob";
import matter from "gray-matter";
import { resolveSiteRoot } from "./site-root";

const sourceRoot = path.resolve("src/content/posts");
const outputRoot = path.resolve(resolveSiteRoot(), "ai");

async function main(): Promise<void> {
	const files = (
		await glob("**/*.{md,mdx}", { cwd: sourceRoot, nodir: true })
	).sort();
	const articles = [];
	const bodies: Array<{ id: string; content: string }> = [];

	for (const file of files) {
		// Astro 的 glob loader 会把目录 index.md 归一化为父目录 ID。
		const id = file
			.replace(/\\/g, "/")
			.replace(/\.(md|mdx)$/i, "")
			.replace(/\/index$/, "");
		const { data, content } = matter(
			await readFile(path.join(sourceRoot, file), "utf8"),
		);
		// 密码文章的目录和正文都不导出，避免 AI 绕过站点访问控制。
		if (
			data.draft === true ||
			(typeof data.password === "string" && data.password.trim())
		)
			continue;
		if (typeof data.title !== "string" || !(data.published instanceof Date)) {
			throw new Error(`Invalid post frontmatter: ${file}`);
		}
		const url = `/posts/${id}/`;
		const tags = Array.isArray(data.tags)
			? data.tags.filter((tag): tag is string => typeof tag === "string")
			: [];
		articles.push({
			id,
			title: data.title,
			description: typeof data.description === "string" ? data.description : "",
			url,
			tags,
			category: typeof data.category === "string" ? data.category : "",
			publishedAt: data.published.toISOString().slice(0, 10),
		});
		bodies.push({ id, content: content.trim() });
	}

	articles.sort(
		(a, b) =>
			b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id),
	);
	// 只清理本脚本专属的构建目录，避免旧文章 JSON 留在部署产物中。
	await rm(outputRoot, { recursive: true, force: true });
	await mkdir(path.join(outputRoot, "articles"), { recursive: true });
	for (const body of bodies) {
		const article = articles.find((item) => item.id === body.id);
		if (!article) throw new Error(`Missing article metadata: ${body.id}`);
		const target = path.join(outputRoot, "articles", `${body.id}.json`);
		await mkdir(path.dirname(target), { recursive: true });
		await writeFile(
			target,
			JSON.stringify({
				id: body.id,
				title: article.title,
				url: article.url,
				tags: article.tags,
				content: body.content,
			}),
			"utf8",
		);
	}
	await writeFile(
		path.join(outputRoot, "articles.json"),
		JSON.stringify({
			version: 1,
			generatedAt: new Date().toISOString(),
			articles,
		}),
		"utf8",
	);
	console.log(
		`Generated FurinaBot index with ${articles.length} public articles in ${outputRoot}`,
	);
}

await main();
