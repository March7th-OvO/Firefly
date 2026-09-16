export interface ChatRequest {
	message: string;
}

export interface ChatStreamCallbacks {
	onStart?: () => void;
	onDelta: (text: string) => void;
	onDone?: () => void;
	onError?: (error: Error) => void;
}

interface StreamEvent {
	event: string;
	data: Record<string, unknown>;
}

function parseEvent(frame: string): StreamEvent | null {
	let event = "message";
	const dataLines: string[] = [];

	for (const line of frame.split(/\r?\n/)) {
		if (line.startsWith(":")) continue;
		const separator = line.indexOf(":");
		if (separator < 0) continue;

		const field = line.slice(0, separator);
		const value = line.slice(separator + 1).replace(/^ /, "");
		if (field === "event") event = value;
		if (field === "data") dataLines.push(value);
	}

	if (dataLines.length === 0) return null;
	const parsed: unknown = JSON.parse(dataLines.join("\n"));
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error("服务端返回了无效的流式数据。");
	}

	return { event, data: parsed as Record<string, unknown> };
}

// 只解析 FurinaBot SSE 协议，避免模型供应商的事件格式进入 UI 层。
export async function streamChat(
	request: ChatRequest,
	callbacks: ChatStreamCallbacks,
	signal?: AbortSignal,
): Promise<void> {
	try {
		const response = await fetch("/api/agent/chat", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "text/event-stream",
			},
			body: JSON.stringify({ message: request.message }),
			signal,
		});

		if (!response.ok) throw new Error(`请求失败（HTTP ${response.status}）。`);
		if (!response.headers.get("content-type")?.includes("text/event-stream")) {
			throw new Error("服务端没有返回 SSE 流。");
		}
		if (!response.body) throw new Error("浏览器无法读取流式响应。");

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		let completed = false;

		try {
			while (true) {
				const { value, done } = await reader.read();
				buffer += decoder.decode(value, { stream: !done });

				// 网络 chunk 与 SSE 事件边界无关，因此保留尾部尚未完成的帧。
				let boundary = buffer.search(/\r?\n\r?\n/);
				while (boundary >= 0) {
					const frame = buffer.slice(0, boundary);
					const separator =
						buffer.slice(boundary).match(/^\r?\n\r?\n/)?.[0] ?? "\n\n";
					buffer = buffer.slice(boundary + separator.length);
					const item = parseEvent(frame);

					if (item?.event === "message.start") callbacks.onStart?.();
					if (item?.event === "message.delta") {
						if (typeof item.data.text !== "string") {
							throw new Error("消息增量格式无效。");
						}
						callbacks.onDelta(item.data.text);
					}
					if (item?.event === "message.done") {
						callbacks.onDone?.();
						completed = true;
					}
					if (item?.event === "error") {
						throw new Error(
							typeof item.data.message === "string"
								? item.data.message
								: "服务端生成失败。",
						);
					}
					boundary = buffer.search(/\r?\n\r?\n/);
				}

				if (done) break;
			}
		} finally {
			reader.releaseLock();
		}

		if (!completed) throw new Error("流式响应意外结束，请重试。");
	} catch (error) {
		if (error instanceof Error && error.name !== "AbortError") {
			callbacks.onError?.(error);
		}
		throw error;
	}
}
