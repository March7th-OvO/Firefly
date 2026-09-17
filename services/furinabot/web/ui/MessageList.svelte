<script lang="ts">
import { tick } from "svelte";
import EmptyState from "./EmptyState.svelte";
import MessageItem from "./MessageItem.svelte";
import type { ChatMessage } from "./types";

interface Props {
	messages: ChatMessage[];
	isGenerating: boolean;
	onSuggestion: (content: string) => void;
}

let { messages, isGenerating, onSuggestion }: Props = $props();
let listElement: HTMLDivElement | undefined;
let shouldFollow = true;
let previousCount = 0;

$effect(() => {
	const messageCount = messages.length;
	const latestContent = messages.at(-1)?.content;

	if (!listElement) return;
	if (messageCount === 0) {
		listElement.scrollTop = 0;
		previousCount = 0;
		return;
	}

	// 新一轮对话必定滚到底部；流式增量仅在用户没有向上阅读时跟随。
	if (messageCount !== previousCount) shouldFollow = true;
	previousCount = messageCount;
	void latestContent;
	void tick().then(() => {
		if (shouldFollow && listElement) {
			listElement.scrollTop = listElement.scrollHeight;
		}
	});
});

function handleScroll(): void {
	if (!listElement) return;
	shouldFollow =
		listElement.scrollHeight -
			listElement.scrollTop -
			listElement.clientHeight <
		72;
}
</script>

<div
	class="furina-message-list"
	bind:this={listElement}
	onscroll={handleScroll}
	role="log"
	aria-label="聊天消息"
>
	{#if messages.length === 0}
		<EmptyState onSuggestion={onSuggestion} disabled={isGenerating} />
	{:else}
		{#each messages as message (message.id)}
			<MessageItem {message} />
		{/each}
	{/if}
</div>
