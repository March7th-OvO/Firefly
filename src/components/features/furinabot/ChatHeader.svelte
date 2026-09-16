<script lang="ts">
interface Props {
	hasMessages: boolean;
	onClear: () => void;
	onClose: () => void;
}

let { hasMessages, onClear, onClose }: Props = $props();
</script>

<header class="furina-header">
	<div class="furina-avatar" aria-hidden="true">✦</div>
	<div class="header-identity">
		<strong>FurinaBot</strong>
		<span><i></i>随时为你解答</span>
	</div>
	<div class="header-actions">
		{#if hasMessages}
			<button type="button" onclick={onClear} aria-label="清空对话" title="清空对话">↺</button>
		{/if}
		<button type="button" onclick={onClose} aria-label="关闭聊天窗口" title="关闭">×</button>
	</div>
</header>
