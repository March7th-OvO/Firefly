// 开发时由 Astro 将聊天请求转发给本机 FastAPI，生产环境由 Nginx 承担同一职责。
export const furinaBotDevProxy = {
	"/api/agent": {
		target: "http://127.0.0.1:8000",
		changeOrigin: true,
	},
};
