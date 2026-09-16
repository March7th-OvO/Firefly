<script lang="ts">
interface Props {
	disabled: boolean;
	onSuggestion: (content: string) => void;
}

const suggestions = [
	{ icon: "✧", label: "总结当前文章", message: "请总结当前文章" },
	{ icon: "⌘", label: "这篇文章讲了什么？", message: "这篇文章讲了什么？" },
	{ icon: "↗", label: "推荐相关文章", message: "请推荐相关文章" },
];

let { disabled, onSuggestion }: Props = $props();
</script>

<div class="furina-empty">
	<div class="empty-ornament" aria-hidden="true"><span>✦</span></div>
	<p class="empty-eyebrow">YOUR COMPANION IN FONTAINE</p>
	<h2>你好，旅行者。</h2>
	<p class="empty-description">欢迎来到 FurinaFans。<br />有什么想探索的？让我陪你一起看看。</p>
	<div class="suggestion-list">
		{#each suggestions as suggestion (suggestion.label)}
			<button type="button" {disabled} onclick={() => onSuggestion(suggestion.message)}>
				<span class="suggestion-icon" aria-hidden="true">{suggestion.icon}</span>
				<span>{suggestion.label}</span>
				<span class="suggestion-arrow" aria-hidden="true">↗</span>
			</button>
		{/each}
	</div>
	<p class="empty-footnote">✦ 一段对话，从一个问题开始</p>
</div>
