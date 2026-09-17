<script lang="ts">
import { onDestroy } from "svelte";
import { chat } from "./chat.svelte";
import ChatPanel from "./ChatPanel.svelte";
import "./furinabot.css";

let open = $state(false);
let closing = $state(false);
let closeTimer: ReturnType<typeof setTimeout> | null = null;

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

onDestroy(() => {
	if (closeTimer) clearTimeout(closeTimer);
	chat.dispose();
});
</script>

<div class="furina-bot">
	{#if !open}
		<button class="furina-launcher" type="button" onclick={openPanel} aria-label="打开 FurinaBot">
			<span class="launcher-copy" aria-hidden="true">
				<span>问问 Furina</span>
				<span class="launcher-arrow">↗</span>
			</span>
			<span class="launcher-spark" aria-hidden="true">✦</span>
		</button>
	{:else}
		<ChatPanel {chat} {closing} onClose={closePanel} />
	{/if}
</div>
