import assert from "node:assert/strict";
import {
	coast,
	damp,
	wave,
	type Spring,
} from "../src/components/archive/timeline-motion";

// 真实需求回归：快慢滑动不能变成固定追加格数，且不同刷新率不能改变滑行距离。
function glide(speed: number, fps: number): number {
	const state: Spring = { value: 10, velocity: speed };
	for (let i = 0; i < fps * 2; i++) coast(state, 1 / fps, 100);
	return state.value - 10;
}
assert.ok(glide(12, 60) > glide(3, 60) * 3.9, "释放速度必须决定滑行距离");
assert.ok(
	Math.abs(glide(12, 30) - glide(12, 120)) < 1e-8,
	"30/120 Hz 的惯性积分应一致",
);

const state: Spring = { value: 8, velocity: 5 };
damp(state, 12, 4.2, 0.1);
const interrupted = { ...state };
damp(state, 2, 4.2, 1 / 120);
assert.ok(
	Math.abs(state.value - interrupted.value) < 0.2,
	"反向输入应从当前显示位置接续",
);
for (let i = 0; i < 600; i++) damp(state, 2, 4.2, 1 / 120);
assert.ok(Math.abs(state.value - 2) < 0.001, "反向后应收敛到最新目标");

for (const velocity of [-100, 100]) {
	const edge = { value: 5, velocity };
	for (let i = 0; i < 180; i++) coast(edge, 1 / 60, 10);
	assert.ok(edge.value >= 0 && edge.value <= 10, "惯性不能越过有限时间线首尾");
	assert.equal(edge.velocity, 0, "碰到边界必须停止惯性");
}
assert.ok(
	Array.from({ length: 100 }, (_, i) => wave(4, i / 30)).some(
		(value) => value < 0,
	),
	"保留基线负波谷",
);
console.log(
	"文章时间线：速度差异、刷新率一致性、反向接续、首尾约束与基线波谷检查通过。",
);
