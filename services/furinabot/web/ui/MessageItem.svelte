<script lang="ts">
import AssistantMessage from "./AssistantMessage.svelte";
import type { ChatMessage } from "./types";
import UserMessage from "./UserMessage.svelte";

interface Props {
	message: ChatMessage;
}

let { message }: Props = $props();
</script>

{#if message.role === "user"}
	<UserMessage {message} />
{:else}
	<AssistantMessage {message} />
{/if}
