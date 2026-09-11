export interface Spring {
	value: number;
	velocity: number;
}

/** 临界阻尼解析解：切换目标时保留当前速度，不重播动画。 */
export function damp(
	state: Spring,
	target: number,
	rate: number,
	dt: number,
): void {
	const delta = state.value - target;
	const impulse = state.velocity + rate * delta;
	const decay = Math.exp(-rate * dt);
	state.value = target + (delta + impulse * dt) * decay;
	state.velocity = (state.velocity - rate * impulse * dt) * decay;
}

/** 有限时间线先按真实速度滑行，低速时才吸附；不循环、不追加固定格数。 */
export function coast(state: Spring, dt: number, last: number): boolean {
	const decay = Math.exp(-2.4 * dt);
	state.value += (state.velocity * (1 - decay)) / 2.4;
	state.velocity *= decay;
	if (state.value <= 0 || state.value >= last) {
		state.value = Math.max(0, Math.min(last, state.value));
		state.velocity = 0;
	}
	return Math.abs(state.velocity) >= 0.6;
}

/** 沿单行采样原项目带正负波谷的选中波浪。 */
export function wave(distance: number, age: number): number {
	if (age < 0 || age > 3.2) return 0;
	const t = Math.min(1, age / 0.2);
	const enter = t * t * t * (10 + t * (-15 + 6 * t));
	const phase = Math.abs(distance) - age * 8;
	return (
		0.8 *
		enter *
		Math.exp(-age * 1.15) *
		Math.cos(phase * 0.58) *
		Math.exp(-0.5 * (phase / 3.4) ** 2)
	);
}
