// 列车沿直轨的行程。速度用地面坐标的格/秒表示，两种画幅保持相同的相对速度。
export const RAIL_SPEED = { express: 3.4, tram: 2.35 };
export const ACCELERATE = 'cubic-bezier(.333333,0,.666667,.333333)';
export const BRAKE = 'cubic-bezier(.333333,.666667,.666667,1)';

export type RailFrame = { time: number; u: number; easing: string };
type Stop = { u: number; pause: number };

/** 先加速、巡航、减速，再停靠；画外也可以作为停留和折返的位置。 */
export function railMotion(stops: Stop[], speed: number, acceleration: number, braking: number): RailFrame[] {
  const first = stops[0];
  if (!first) return [];
  const frames: RailFrame[] = [{ time: 0, u: first.u, easing: 'linear' }];
  const push = (seconds: number, u: number): void => {
    frames.push({ time: frames.at(-1)!.time + seconds, u, easing: 'linear' });
  };
  if (first.pause) push(first.pause, first.u);
  for (let i = 1; i < stops.length; i++) {
    const from = stops[i - 1]!;
    const to = stops[i]!;
    const distance = Math.abs(to.u - from.u);
    const direction = Math.sign(to.u - from.u);
    const share = from.pause && to.pause ? .4 : .75;
    const a = from.pause ? Math.min(acceleration, distance * share) : 0;
    const b = to.pause ? Math.min(braking, distance * share) : 0;
    if (a) {
      frames.at(-1)!.easing = ACCELERATE;
      push(2 * a / speed, from.u + direction * a);
    }
    push((distance - a - b) / speed, to.u - direction * b);
    if (b) {
      frames.at(-1)!.easing = BRAKE;
      push(2 * b / speed, to.u);
    }
    if (to.pause) push(to.pause, to.u);
  }
  return frames;
}
