import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Iso, Painter, Pt } from './landscape.ts';
import { landscape, ROAD } from './landscape.ts';
import { RAIL, transport } from './transport.ts';

const painter: Painter = { paint: (c) => c, phase: 'night', lights: true, snow: false };

/** 使用和真实年度贡献图一样的投影，分别验证两种画幅 */
function projection(phone: boolean): Iso {
  const unit = phone ? 6.5 : 12;
  const [ox, oy] = phone ? [70.5, 277] : [164, 264];
  return {
    xy: (u, v, z = 0) => [ox + (u - v) * unit, oy + (u + v) * unit / 2 - z],
    weeks: 53,
    k: unit / 12,
    x0: phone ? 8 : 16,
    x1: phone ? 432 : 864,
    y0: phone ? 213 : 152,
    y1: phone ? 511.93 : 686.9,
  };
}

function points(markup: string): Pt[] {
  const lists = [...markup.matchAll(/points="([^"]+)"/g)].map(([, list = '']) => list.split(' '));
  // 包含船尾的三条尾迹和竖直桅杆，确保测试不只验证船身。
  lists.push(...[...markup.matchAll(/ d="M([-\d.,L]+)"/g)].map(([, list = '']) => list.split('L')));
  const vertices = lists.flat().map((p) => p.split(',').map(Number) as Pt);
  for (const [, x, y, radius] of markup.matchAll(/cx="([-\d.]+)" cy="([-\d.]+)" r="([\d.]+)"/g)) {
    for (const dx of [-Number(radius), Number(radius)]) for (const dy of [-Number(radius), Number(radius)]) vertices.push([Number(x) + dx, Number(y) + dy]);
  }
  for (const [, x, y, rx, ry] of markup.matchAll(/cx="([-\d.]+)" cy="([-\d.]+)" rx="([\d.]+)" ry="([\d.]+)"/g)) {
    for (const dx of [-Number(rx), Number(rx)]) for (const dy of [-Number(ry), Number(ry)]) vertices.push([Number(x) + dx, Number(y) + dy]);
  }
  return vertices;
}

function outside(iso: Iso, vertices: Pt[]): boolean {
  assert.ok(vertices.length > 8, '没有提取到完整交通工具');
  return vertices.every(([x]) => x < iso.x0) || vertices.every(([x]) => x > iso.x1) || vertices.every(([, y]) => y < iso.y0) || vertices.every(([, y]) => y > iso.y1 + 0.65 * iso.k);
}

/** SVG 默认变换在动画尚未开始、处于正延迟或减少动态效果时同样有效 */
function initialPoints(markup: string): Pt[] {
  const offset = markup.match(/transform="translate\(([-\d.]+),([-\d.]+)\)"/);
  assert.ok(offset, '缺少画外的默认位置');
  return points(markup).map(([x, y]) => [x + Number(offset[1]), y + Number(offset[2])]);
}

function waterCoordinate(iso: Iso, [x, y]: Pt): number {
  const [ox, oy] = iso.xy(0, 0);
  const unit = iso.xy(1, 0)[0] - ox;
  return ((y - oy) * 2 - (x - ox)) / (2 * unit);
}

test('两种画幅下五艘船从画外依次入场，正延迟期间和关闭动画时也不会出现在海面中间', () => {
  for (const phone of [false, true]) {
    const iso = projection(phone);
    const { boats, css } = transport(iso, painter);
    const ships = boats.split(/<g class="boat" data-vessel="/).slice(1);
    assert.equal(ships.length, 5);
    assert.deepEqual(new Set(ships.map((s) => s.split('"')[0])), new Set(['ferry', 'speedboat', 'sailboat', 'fishing']));
    for (const [i, ship] of ships.entries()) {
      assert.ok(outside(iso, initialPoints(ship)), `第 ${i + 1} 艘船在入场前已经可见`);
      assert.ok(Number(ship.match(/animation-delay:([-\d.]+)s/)?.[1]) >= 0, '不应跳过首次入场');
      const start = css.match(new RegExp(`@keyframes zsail${i}\\{0%\\{transform:translate\\(([-\\d.]+)px,([-\\d.]+)px\\)`));
      const fallback = ship.match(/transform="translate\(([-\d.]+),([-\d.]+)\)"/);
      assert.deepEqual(start?.slice(1), fallback?.slice(1), '默认位置和动画首帧不一致');
    }
  }
});

test('汽车入场前连头灯光束也在画外，六辆车均不使用负延迟', () => {
  for (const phone of [false, true]) {
    const iso = projection(phone);
    const { traffic } = landscape(iso, null);
    const cars = [...traffic.matchAll(/<g class="(ca|cb)" style="animation-delay:([-\d.]+)s">(.*?)<\/g>/g)];
    assert.equal(cars.length, 6);
    for (const [, lane, delay, car = ''] of cars) {
      assert.ok(Number(delay) >= 0, `${lane} 跳过了首次入场`);
      assert.ok(outside(iso, points(car)), `${lane} 的车身或头灯光束在加载时已经可见`);
    }
  }
});

test('高铁和电车都从画外开始，等待发车和关闭动画时也保持在画外', () => {
  for (const phone of [false, true]) {
    const iso = projection(phone);
    const network = transport(iso, painter);
    for (const name of ['express', 'tram'] as const) {
      const markup = (name === 'express' ? network.back : network.tram).match(new RegExp(`<g class="${name}"[^>]*>.*?<\\/g>`))?.[0] ?? '';
      assert.ok(outside(iso, initialPoints(markup)), `${name} 的首帧已经在轨道中间`);
      assert.ok(Number(markup.match(/animation-delay:([-\d.]+)s/)?.[1]) >= 0);
    }
  }
});

test('电车入场后仍在两端停站，出场后从相同的画外位置开始下一个循环', () => {
  const { css } = transport(projection(false), painter);
  const keys = css.match(/@keyframes ztram\{(.*?)\n/)?.[1] ?? '';
  const frames = new Map([...keys.matchAll(/([\d.,%]+)\{transform:translate\(([-\d.]+)px,([-\d.]+)px\)/g)]
    .flatMap(([, times = '', x, y]) => times.split(',').map(time => [Number(time.replace('%', '')), [Number(x), Number(y)]] as const)));
  assert.equal(frames.size, 8);
  assert.deepEqual(frames.get(0), frames.get(100));
  assert.notDeepEqual(frames.get(0), frames.get(6));
  assert.notDeepEqual(frames.get(6), frames.get(47));
  for (const time of [12, 88, 94]) assert.deepEqual(frames.get(6), frames.get(time));
  assert.deepEqual(frames.get(47), frames.get(53));
});

test('整条航线连船帆和尾迹也有安全间隔，任意动画相位都不会相撞、越岸或穿过码头', () => {
  for (const phone of [false, true]) {
    const iso = projection(phone);
    const { css, boats } = transport(iso, painter);
    const ships = boats.split(/<g class="boat" data-vessel="/).slice(1);
    const corridors: Pt[] = [];
    const directions = new Set<number>();
    for (const [i, ship] of ships.entries()) {
      const keys = css.match(new RegExp(`@keyframes zsail${i}\\{(.*?)\\n`))?.[1] ?? '';
      const moves = [...keys.matchAll(/translate\(([-\d.]+)px,([-\d.]+)px\)/g)].map(([, x, y]) => [Number(x), Number(y)] as Pt);
      assert.equal(moves.length, 17);
      directions.add(Math.sign(moves.at(-1)![0] - moves[0]![0]));
      const vertices = points(ship);
      const across: number[] = [];
      for (const [dx, dy] of [moves[0]!, moves.at(-1)!]) {
        const end = vertices.map(([x, y]): Pt => [x + dx, y + dy]);
        assert.ok(end.every(([x]) => x < iso.x0) || end.every(([x]) => x > iso.x1) || end.every(([, y]) => y < iso.y0) || end.every(([, y]) => y > iso.y1), `第 ${i + 1} 艘船循环重置时仍留在画面内 (${phone ? '手机' : '桌面'})：${JSON.stringify([Math.min(...end.map(p => p[0])), Math.max(...end.map(p => p[0])), Math.min(...end.map(p => p[1])), Math.max(...end.map(p => p[1]))])}`);
      }
      // 位移在关键帧之间线性插值；海岸是直线，两端的所有顶点在海上即可保证整个线段安全。
      for (const [dx, dy] of moves) {
        for (const [x, y] of vertices) across.push(waterCoordinate(iso, [x + dx, y + dy]));
      }
      // 再把 bob 的完整上下起伏算进去。v 对屏幕位移是线性的，所以包络覆盖关键帧之间的所有时刻。
      const corridor: Pt = [Math.min(...across) - 0.65 / 12, Math.max(...across)];
      assert.ok(corridor[0] > ROAD.coast, `第 ${i + 1} 艘船越上海岸`);
      assert.ok(corridor[0] > 11.2 + 0.5, `第 ${i + 1} 艘船与码头重叠`);
      const previous = corridors.at(-1);
      if (previous) assert.ok(corridor[0] - previous[1] > 0.7, `第 ${i}、${i + 1} 艘船航道重叠：${previous} / ${corridor}`);
      corridors.push(corridor);
    }
    assert.deepEqual(directions, new Set([1, -1]));
  }
});

test('两端有车站和海滨广场，高铁在后景、电车在前景，夜间灯塔发光', () => {
  const iso = projection(false);
  const night = transport(iso, painter);
  assert.match(night.back, /data-rail="express"/);
  assert.doesNotMatch(night.tram, /class="express"/);
  assert.match(night.tram, /class="tram"/);
  assert.match(night.landmarks, /data-landmark="station"/);
  assert.match(night.landmarks, /data-landmark="plaza"/);
  assert.match(night.harbor, /data-landmark="harbor"/);
  assert.match(night.harbor, /class="harbor-light"/);
  assert.doesNotMatch(transport(iso, { ...painter, phase: 'day', lights: false }).harbor, /class="harbor-light"/);
  // 位移沿着地面 u 轴，所有列车在移动时都留在自己的直轨道上。
  for (const name of ['express', 'tram']) {
    const keys = night.css.match(new RegExp(`@keyframes z${name}\\{(.*?)\\n`))?.[1] ?? '';
    for (const [, x, y] of keys.matchAll(/translate\(([-\d.]+)px,([-\d.]+)px\)/g)) assert.ok(Math.abs(Number(y) - Number(x) / 2) < 0.02);
  }
});

test('灯塔底座在电车轨道外，电车的受电弓与接触线高度一致', () => {
  for (const phone of [false, true]) {
    const iso = projection(phone);
    const network = transport(iso, painter);
    const lighthouse = network.harbor.split('<g data-landmark="lighthouse">')[1] ?? '';
    const base = [...lighthouse.matchAll(/<polygon[^>]+\/>/g)].slice(0, 3).map(([p]) => p).join('');
    assert.ok(points(base).length > 8);
    for (const p of points(base)) assert.ok(waterCoordinate(iso, p) > RAIL.tram + 0.54 + 0.1, '灯塔底座压住轨道');
    const path = (markup: string): Pt[] => [...markup.matchAll(/ d="M([-\d.,L]+)"/g)].flatMap(([, list = '']) => list.split('L').map((p) => p.split(',').map(Number) as Pt));
    const [ox, oy] = iso.xy(0, RAIL.tram);
    const height = ([x, y]: Pt): number => oy + (x - ox) / 2 - y;
    const pantograph = Math.max(...path(network.tram).map(height));
    const wire = height(path(network.overhead)[0]!);
    assert.ok(Math.abs(pantograph - wire) < 0.03, `受电弓与电线未接触：${pantograph} / ${wire}`);
  }
});
