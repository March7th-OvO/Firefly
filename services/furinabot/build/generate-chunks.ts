import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveSiteRoot } from "../../../scripts/site-root";

interface ArticleMeta {
	id: string;
	title: string;
	url: string;
	tags: string[];
	publishedAt: string;
}

interface Chunk extends Omit<ArticleMeta, "id"> {
	id: string;
	articleId: string;
	heading: string;
	content: string;
}

const aiRoot = path.resolve(resolveSiteRoot(), "ai");
const maxChars = 1600;

function headingKey(value: string): string {
	return (
		value
			.toLowerCase()
			.replace(/[^\p{L}\p{N}]+/gu, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 64) || "intro"
	);
}

function splitSection(
	article: ArticleMeta,
	heading: string,
	paragraphs: string[],
	occurrence: number,
): Chunk[] {
	const result: Chunk[] = [];
	let part = 0;
	let text = "";
	const push = () => {
		if (!text.trim()) return;
		result.push({
			id: `${article.id}#${headingKey(heading)}-${String(occurrence).padStart(2, "0")}-${String(++part).padStart(2, "0")}`,
			articleId: article.id,
			title: article.title,
			url: article.url,
			heading,
			content: text.trim(),
			tags: article.tags,
			publishedAt: article.publishedAt,
		});
		text = "";
	};
	for (const paragraph of paragraphs) {
		// 特别长的段落按字符切开，确保没有正文被静默丢弃。
		for (let start = 0; start < paragraph.length; start += maxChars) {
			const piece = paragraph.slice(start, start + maxChars);
			if (text && text.length + piece.length + 2 > maxChars) push();
			text += `${text ? "\n\n" : ""}${piece}`;
		}
	}
	push();
	return result;
}

function chunkArticle(article: ArticleMeta, content: string): Chunk[] {
	const chunks: Chunk[] = [];
	const counts = new Map<string, number>();
	let heading = "正文";
	let paragraphs: string[] = [];
	let paragraph: string[] = [];
	let inFence = false;
	const flushParagraph = () => {
		if (paragraph.length) paragraphs.push(paragraph.join("\n").trim());
		paragraph = [];
	};
	const flushSection = () => {
		flushParagraph();
		const key = headingKey(heading);
		const occurrence = (counts.get(key) ?? 0) + 1;
		counts.set(key, occurrence);
		chunks.push(...splitSection(article, heading, paragraphs, occurrence));
		paragraphs = [];
	};
	for (const line of content.split(/\r?\n/)) {
		if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
		const match = !inFence && line.match(/^#{1,6}\s+(.+?)\s*#*$/);
		if (match) {
			flushSection();
			heading = match[1];
		} else if (!line.trim() && !inFence) {
			flushParagraph();
		} else {
			paragraph.push(line);
		}
	}
	flushSection();
	return chunks;
}

const index = JSON.parse(
	await readFile(path.join(aiRoot, "articles.json"), "utf8"),
) as {
	version: number;
	articles: ArticleMeta[];
};
if (index.version !== 1 || !Array.isArray(index.articles))
	throw new Error("Invalid FurinaBot article index");
const chunks: Chunk[] = [];
for (const article of index.articles) {
	const body = JSON.parse(
		await readFile(path.join(aiRoot, "articles", `${article.id}.json`), "utf8"),
	) as {
		id: string;
		content: string;
	};
	if (body.id !== article.id || typeof body.content !== "string")
		throw new Error(`Invalid article: ${article.id}`);
	chunks.push(...chunkArticle(article, body.content));
}
await writeFile(
	path.join(aiRoot, "chunks.json"),
	JSON.stringify({ version: 1, chunks }),
	"utf8",
);
console.log(
	`Generated ${chunks.length} FurinaBot chunks from ${index.articles.length} public articles`,
);
