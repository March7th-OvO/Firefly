<script lang="ts">
import type { ChatMessage } from "./types";

interface Props {
	message: ChatMessage;
}

let { message }: Props = $props();
</script>

<div class="message-row user-row">
	<div class="user-bubble">{message.content}</div>
</div>
