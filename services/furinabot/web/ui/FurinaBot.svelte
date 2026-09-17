<script lang="ts">
import { onDestroy, onMount } from "svelte";
import ChatPanel from "./ChatPanel.svelte";
import { chat } from "./chat.svelte";
import "./furinabot.css";

let open = $state(false);
let closing = $state(false);
let modelAvailable = $state(false);
let closeTimer: ReturnType<typeof setTimeout> | null = null;

function updateModelLauncher(): void {
	const model = document.getElementById("furina-live2d");
	const trigger = model?.querySelector<HTMLButtonElement>(
		".furina-live2d-trigger",
	);
	modelAvailable = Boolean(
		model && !model.hidden && trigger && !trigger.hidden,
	);
}

function openPanel(): void {
	if (closeTimer) clearTimeout(closeTimer);
	closeTimer = null;
	closing = false;
	open = true;
}

function closePanel(): void {
	if (closing) return;
	closing = true;
	closeTimer = setTimeout(() => {
		open = false;
		closing = false;
		closeTimer = null;
	}, 200);
}

onMount(() => {
	// 模型成功加载且可见时由模型接管入口；移动端或加载失败仍保留按钮。
	updateModelLauncher();
	window.addEventListener("furinabot:model-state", updateModelLauncher);
	window.addEventListener("furinabot:open", openPanel);
	return () => {
		window.removeEventListener("furinabot:model-state", updateModelLauncher);
		window.removeEventListener("furinabot:open", openPanel);
	};
});

onDestroy(() => {
	if (closeTimer) clearTimeout(closeTimer);
	chat.dispose();
});
</script>

<div class="furina-bot">
	{#if !open && !modelAvailable}
		<button class="furina-launcher" type="button" onclick={openPanel} aria-label="打开 FurinaBot">
			<span class="launcher-copy" aria-hidden="true">
				<span>问问 Furina</span>
				<span class="launcher-arrow">↗</span>
			</span>
			<span class="launcher-spark" aria-hidden="true">✦</span>
		</button>
	{:else if open}
		<ChatPanel {chat} {closing} onClose={closePanel} />
	{/if}
</div>
