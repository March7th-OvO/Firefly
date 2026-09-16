<script lang="ts">
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import TypingIndicator from "./TypingIndicator.svelte";
import type { ChatMessage } from "./types";

interface Props {
	message: ChatMessage;
}

let { message }: Props = $props();

function renderMarkdown(content: string): string {
	const html = marked.parse(content, { async: false, gfm: true });
	return sanitizeHtml(html, {
		allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
		allowedAttributes: {
			...sanitizeHtml.defaults.allowedAttributes,
			a: ["href", "name", "target", "rel"],
			img: ["src", "alt", "title", "width", "height", "loading"],
		},
		allowedSchemes: ["http", "https", "mailto", "tel"],
		transformTags: {
			a: sanitizeHtml.simpleTransform("a", {
				rel: "noopener noreferrer",
				target: "_blank",
			}),
		},
	});
}

const markdown = $derived(renderMarkdown(message.content));
</script>

<div class="message-row assistant-row">
	<div class="assistant-avatar" aria-hidden="true">✦</div>
	<div class="assistant-body">
		<div class="assistant-name">FURINA</div>
		{#if message.content}
			<div class="assistant-markdown">{@html markdown}</div>
		{:else if message.status !== "error"}
			<TypingIndicator />
		{/if}
		{#if message.status === "error"}
			<span class="message-error" role="alert">回复失败，请重新发送。</span>
		{/if}
		{#if message.status === "streaming" && message.content}
			<span class="stream-cursor" aria-label="正在生成"></span>
		{/if}
	</div>
</div>
