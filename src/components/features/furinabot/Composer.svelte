<script lang="ts">
interface Props {
	disabled?: boolean;
	isGenerating: boolean;
	onSend: (message: string) => void;
	onStop: () => void;
}

let { disabled = false, isGenerating, onSend, onStop }: Props = $props();
let value = $state("");
const canSend = $derived(!disabled && !isGenerating && value.trim().length > 0);

function handleSubmit(event: SubmitEvent): void {
	event.preventDefault();
	if (!canSend) return;
	onSend(value.trim());
	value = "";
}

function handleKeydown(event: KeyboardEvent): void {
	if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
	event.preventDefault();
	(event.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
}
</script>

<form class="furina-composer" onsubmit={handleSubmit}>
	<div class="composer-field">
		<textarea
			bind:value
			onkeydown={handleKeydown}
			placeholder="向 Furina 提问..."
			aria-label="向 Furina 提问"
			rows={2}
			{disabled}
		></textarea>
		{#if isGenerating}
			<button class="composer-action stop-action" type="button" onclick={onStop} aria-label="停止生成" title="停止生成">
				<span></span>
			</button>
		{:else}
			<button class="composer-action send-action" type="submit" disabled={!canSend} aria-label="发送消息" title="发送消息">↑</button>
		{/if}
	</div>
	<div class="composer-caption">
		<span>FURINABOT · LIVE</span>
		<span>Enter 发送 · Shift + Enter 换行</span>
	</div>
</form>
