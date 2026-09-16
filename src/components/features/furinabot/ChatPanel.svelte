<script lang="ts">
import ChatHeader from "./ChatHeader.svelte";
import Composer from "./Composer.svelte";
import MessageList from "./MessageList.svelte";
import type { chat } from "./chat.svelte";

interface Props {
	chat: typeof chat;
	closing: boolean;
	onClose: () => void;
}

let { chat, closing, onClose }: Props = $props();
</script>

<section
	class={closing ? "furina-panel is-closing" : "furina-panel"}
	role="dialog"
	aria-label="FurinaBot 聊天窗口"
>
	<ChatHeader
		onClose={onClose}
		onClear={chat.clearMessages}
		hasMessages={chat.messages.length > 0}
	/>
	<MessageList
		messages={chat.messages}
		isGenerating={chat.isGenerating}
		onSuggestion={chat.sendMessage}
	/>
	<Composer
		isGenerating={chat.isGenerating}
		onSend={chat.sendMessage}
		onStop={chat.stopGeneration}
	/>
</section>
