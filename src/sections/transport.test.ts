import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Iso, Painter, Pt } from './landscape.ts';
import { landscape, ROAD } from './landscape.ts';
import { RAIL, transport } from './transport.ts';
import { RAIL_SPEED } from './rail-motion.ts';

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
    y1: oy + (((phone ? 432 : 864) - ox) / unit + 2 * RAIL.tram) * unit / 2 + 36 * unit / 12,
  };
}

function points(markup: string): Pt[] {
  const lists = [...markup.matchAll(/points="([^"]+)"/g)].map(([, list = '']) => list.split(' '));
  // 也包含尾迹、桅杆和曲线屋檐的控制点，曲线不会越出控制点的包围盒。
  lists.push(...[...markup.matchAll(/ d="([^"]+)"/g)].map(([, path = '']) => path.match(/[-\d.]+,[-\d.]+/g) ?? []));
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

function railFrames(css: string, name: string) {
  const duration = Number(css.match(new RegExp(`\\.${name}\\{animation:z${name} ([\\d.]+)s`))?.[1]);
  const keys = css.match(new RegExp(`@keyframes z${name}\\{(.*?)\\n`))?.[1] ?? '';
  return [...keys.matchAll(/([\d.,%]+)\{transform:translate\(([-\d.]+)px,([-\d.]+)px\)(?:;animation-timing-function:cubic-bezier\(([-\d.,]+)\))?\}/g)]
    .flatMap(([, times = '', x, y, curve]) => times.split(',').map(time => ({
      time: Number(time.replace('%', '')) / 100 * duration,
      x: Number(x), y: Number(y), curve: curve?.split(',').map(Number),
    })));
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

test('高铁进站减速，客舱对齐站台停靠三秒，再缓慢加速恢复原巡航速度', () => {
  for (const phone of [false, true]) {
    const iso = projection(phone);
    const { css, back } = transport(iso, painter);
    const duration = Number(css.match(/\.express\{animation:zexpress ([\d.]+)s/)?.[1]);
    const keys = css.match(/@keyframes zexpress\{(.*?)\n/)?.[1] ?? '';
    const frames = [...keys.matchAll(/([\d.,%]+)\{transform:translate\(([-\d.]+)px,([-\d.]+)px\)(?:;animation-timing-function:cubic-bezier\(([-\d.,]+)\))?\}/g)]
      .flatMap(([, times = '', x, y, curve]) => times.split(',').map(time => ({
        time: Number(time.replace('%', '')) / 100 * duration,
        x: Number(x), y: Number(y), curve: curve?.split(',').map(Number),
      })));
    assert.equal(frames.length, 6);
    const [entry, brake, arrive, depart, cruise, exit] = frames;
    assert.ok(entry && brake && arrive && depart && cruise && exit);
    assert.ok(Math.abs(depart.time - arrive.time - 3) < 0.02, '停站时间不是三秒');
    assert.deepEqual([arrive.x, arrive.y], [depart.x, depart.y], '停站时仍在滑动');
    for (let i = 1; i < frames.length; i++) {
      assert.ok(frames[i]!.time > frames[i - 1]!.time);
      assert.ok(frames[i]!.x >= frames[i - 1]!.x, '高铁出现倒车或回跳');
    }

    // 匀减速和匀加速段的平均速度是巡航速度的一半，接入、离开停站时均为零速。
    const speed = (a: typeof entry, b: typeof entry): number => (b.x - a.x) / (b.time - a.time);
    const incoming = speed(entry, brake);
    const outgoing = speed(cruise, exit);
    assert.ok(Math.abs(incoming / outgoing - 1) < 0.01, '进出站的巡航速度不一致');
    const braking = brake.curve;
    const acceleration = depart.curve;
    assert.ok(braking?.length === 4 && acceleration?.length === 4, '进出站缺少速度曲线');
    const brakeStart = speed(brake, arrive) * braking[1]! / braking[0]!;
    const accelerationEnd = speed(depart, cruise) * (1 - acceleration[3]!) / (1 - acceleration[2]!);
    assert.ok(Math.abs(brakeStart / incoming - 1) < 0.01, '进站减速与巡航未平滑衔接');
    assert.ok(Math.abs(accelerationEnd / outgoing - 1) < 0.01, '出站加速与巡航未平滑衔接');
    assert.equal(braking[3], 1, '减速曲线末端未停稳');
    assert.equal(acceleration[1], 0, '离站时没有从零速起步');
    assert.ok(cruise.time - depart.time > arrive.time - brake.time, '出站加速应比进站减速更缓');
    const projectedSpeed = RAIL_SPEED.express * (iso.xy(1, 0)[0] - iso.xy(0, 0)[0]);
    assert.ok(Math.abs(outgoing / projectedSpeed - 1) < 0.01, '高铁未达到提速后的巡航速度');

    const markup = back.match(/<g class="express"[^>]*>(.*?)<\/g>/)?.[1] ?? '';
    const wheels = [...markup.matchAll(/<ellipse cx="([-\d.]+)"/g)].map(([, x]) => Number(x));
    assert.equal(wheels.length, 8);
    const ox = iso.xy(0, 0)[0];
    const unit = iso.xy(1, 0)[0] - ox;
    const wheelU = wheels.map(x => (x + arrive.x - ox) / unit + RAIL.express + 0.27);
    // 轮轴离客舱端部各 0.25 格；核对四节客舱都在现有站台范围内。
    assert.ok(Math.min(...wheelU) - 0.25 >= -7.7, '车尾客舱没有对齐站台');
    assert.ok(Math.max(...wheelU) + 0.25 <= -0.7, '车头客舱没有对齐站台');
    const vertices = points(markup);
    for (const end of [entry, exit]) {
      assert.ok(outside(iso, vertices.map(([x, y]): Pt => [x + end.x, y + end.y])), '循环切换时车厢还在画面里');
    }
  }
});

test('电车双向停站，驶出右边框后才折返；进出站平滑变速且最高速度低于高铁', () => {
  for (const phone of [false, true]) {
    const iso = projection(phone);
    const { css, tram, shore } = transport(iso, painter);
    const frames = railFrames(css, 'tram');
    const pauses = frames.flatMap((frame, i) => i > 0 && frame.x === frames[i - 1]!.x ? [{ arrive: frames[i - 1]!, depart: frame, i }] : []);
    assert.equal(pauses.length, 6, '往返需要四次停站和两次画外折返');
    assert.equal(pauses[0]!.arrive.x, pauses[4]!.arrive.x);
    assert.equal(pauses[1]!.arrive.x, pauses[3]!.arrive.x);
    assert.notEqual(pauses[0]!.arrive.x, pauses[1]!.arrive.x);
    const vertices = points(tram);
    for (const index of [2, 5]) {
      const frame = pauses[index]!.arrive;
      assert.ok(outside(iso, vertices.map(([x, y]): Pt => [x + frame.x, y + frame.y])), '列车尚未完全出画便折返');
    }
    for (const index of [0, 1, 3, 4]) {
      const pause = pauses[index]!;
      assert.ok(Math.abs(pause.depart.time - pause.arrive.time - 2.8) < .02);
      assert.equal(frames[pause.i - 2]!.curve?.[3], 1, '进站时没有减速到零');
      assert.equal(pause.depart.curve?.[1], 0, '出站时没有从零速起步');
    }
    const unit = iso.xy(1, 0)[0] - iso.xy(0, 0)[0];
    let topSpeed = 0;
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i - 1]!;
      const b = frames[i]!;
      const slopes = a.curve ? [a.curve[1]! / a.curve[0]!, (1 - a.curve[3]!) / (1 - a.curve[2]!)] : [1];
      topSpeed = Math.max(topSpeed, Math.abs((b.x - a.x) / (b.time - a.time) / unit) * Math.max(...slopes));
    }
    assert.ok(Math.abs(topSpeed - RAIL_SPEED.tram) < .01);
    assert.ok(topSpeed < RAIL_SPEED.express);
    assert.deepEqual([frames[0]!.x, frames[0]!.y], [frames.at(-1)!.x, frames.at(-1)!.y]);
    assert.ok(Math.max(...points(shore).map(p => p[0])) > iso.x1, '滨海铁轨没有延伸到右边框之外');
  }
});

test('标注空白处有餐馆、亭子、摩天轮与过山车；建筑基座避开轨道并留在画幅内', () => {
  for (const phone of [false, true]) {
    const iso = projection(phone);
    const network = transport(iso, painter);
    for (const name of ['restaurant', 'pavilion']) assert.match(network.landmarks, new RegExp(`data-landmark="${name}"`));
    assert.match(network.landmarks, /data-door-facing="station"/);
    for (const name of ['ferris-wheel', 'roller-coaster']) assert.match(network.back, new RegExp(`data-ride="${name}"`));
    const restaurant = network.landmarks.split('data-landmark="restaurant">')[1]?.split('data-landmark="station"')[0] ?? '';
    const entrance = network.landmarks.split('data-landmark="restaurant-entrance">')[1]?.split('data-landmark="plaza"')[0] ?? '';
    for (const [x] of points(restaurant + entrance)) assert.ok(x > iso.x0 && x < iso.x1, '餐馆屋檐或门口被左右边框截断');
    assert.ok(network.landmarks.indexOf('data-landmark="station-ground"') < network.landmarks.indexOf('data-landmark="restaurant"'), '站前地面盖住餐馆');
    assert.ok(network.landmarks.indexOf('data-landmark="pavilion-ground"') < network.landmarks.indexOf('data-landmark="plaza"'), '亭子地面盖住广场长椅');
    const pavilion = network.landmarks.split('data-landmark="pavilion">')[1] ?? '';
    const ground = network.landmarks.split('data-landmark="pavilion-ground">')[1] ?? '';
    const footprint = points(ground.match(/<polygon[^>]+\/>/)?.[0] ?? '');
    for (const p of footprint) assert.ok(waterCoordinate(iso, p) < ROAD.inner, '亭子广场压住滨海路');
    for (const [x, y] of points(pavilion)) {
      assert.ok(x > iso.x0 && x < iso.x1, '亭子被左右边框截断');
      assert.ok(y < iso.y1 - 24 * iso.k, '亭子落入底边淡出区域');
    }
    const parkFloor = network.back.match(/data-landmark="amusement-park">(<polygon[^>]+\/>)/)?.[1] ?? '';
    for (const p of points(parkFloor)) assert.ok(waterCoordinate(iso, p) < RAIL.express - .54, '游乐园基座与高架重叠');
  }
});

test('餐馆与站前广场连成整体，门顶避开站厅；中式亭子的折角庭院铺满右侧余地', () => {
  const contains = (vertices: Pt[], [x, y]: Pt): boolean => {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const [a, b] = [vertices[i]!, vertices[j]!];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  };
  for (const phone of [false, true]) {
    const iso = projection(phone);
    const { landmarks: svg } = transport(iso, painter);
    const ground = (name: string) => points(svg.match(new RegExp(`data-landmark="${name}">(<polygon[^>]+/>)`))?.[1] ?? '');
    const station = ground('station-ground');
    const restaurant = ground('restaurant-ground');
    const joined = iso.xy(-8.35, 0);
    assert.ok(contains(station, joined) && contains(restaurant, joined), '餐馆与高铁站的地面存在断缝');
    assert.ok(restaurant.some(([x]) => Math.abs(x - iso.x0) < .02), '左上角地面没有延伸至边框');
    const doorway = points(svg.match(/data-door-facing="station">(<polygon[^>]+\/>)/)?.[1] ?? '');
    assert.equal(doorway.length, 4);
    const [ox, oy] = iso.xy(0, 1.2);
    for (const [x, y] of doorway) assert.ok(y > oy + (x - ox) / 2 + iso.k, '餐馆门顶仍进入站厅遮挡范围');
    assert.ok(svg.indexOf('data-landmark="restaurant"') < svg.indexOf('data-landmark="station"'));
    assert.ok(svg.indexOf('data-landmark="station"') < svg.indexOf('data-landmark="restaurant-entrance"'), '前厅的门口被后面的站厅覆盖');
    const garden = ground('pavilion-ground');
    assert.ok(garden.length > 4, '亭子仍使用方形地基');
    assert.ok(garden.some(([x]) => Math.abs(x - iso.x1) < .02), '右下角庭院没有铺到边框');
    const unit = iso.xy(1, 0)[0] - iso.xy(0, 0)[0];
    const right = (iso.x1 - iso.xy(0, 0)[0]) / unit;
    assert.ok(contains(garden, iso.xy(right + 6.95 - .05, 6.95)), '边框与滨海路之间仍有空缺');
    for (const p of garden) assert.ok(waterCoordinate(iso, p) < ROAD.inner, '扩展庭院压到了道路');
    assert.match(svg, /data-roof="upturned-eaves"><path d="[^"]*Q/);
  }
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
