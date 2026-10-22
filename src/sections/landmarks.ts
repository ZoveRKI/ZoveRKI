// 标注空白处的设施：车站旁的小餐馆、广场尽端的亭子，以及高架后方的滨海游乐园。
import type { Iso, Painter, Pt } from './landscape.ts';
import { r2, shade } from '../svg.ts';

const pt = ([x, y]: Pt): string => `${r2(x)},${r2(y)}`;
const polygon = (points: Pt[], fill: string): string => `<polygon points="${points.map(pt).join(' ')}" fill="${fill}"/>`;
const line = (points: Pt[], color: string, width: number, extra = ''): string => `<path d="M${points.map(pt).join('L')}" fill="none" stroke="${color}" stroke-width="${r2(width)}"${extra}/>`;

function block(iso: Iso, u0: number, u1: number, v0: number, v1: number, z: number, h: number, color: string): string {
  const { xy } = iso;
  const [T, R, B, L] = [xy(u0, v0, z), xy(u1, v0, z), xy(u1, v1, z), xy(u0, v1, z)];
  const lift = ([x, y]: Pt): Pt => [x, y - h];
  return polygon([L!, B!, lift(B!), lift(L!)], shade(color, .72)) + polygon([B!, R!, lift(R!), lift(B!)], shade(color, .5)) + polygon([T!, R!, B!, L!].map(lift), color);
}

/** 在世界坐标里沿边框裁出斜边，地面能贴边，建筑和屋檐仍留在画幅内。 */
function trim(footprint: Pt[], distance: (p: Pt) => number): Pt[] {
  return footprint.flatMap((b, i) => {
    const a = footprint[(i + footprint.length - 1) % footprint.length]!;
    const da = distance(a);
    const db = distance(b);
    const crossing: Pt[] = (da < 0) !== (db < 0) ? [[a[0] + (b[0] - a[0]) * da / (da - db), a[1] + (b[1] - a[1]) * da / (da - db)]] : [];
    return db >= 0 ? [...crossing, b] : crossing;
  });
}

function restaurant(iso: Iso, P: Painter): { ground: string; rear: string; front: string } {
  const { xy, k } = iso;
  const phone = k < .8;
  const unit = xy(1, 0)[0] - xy(0, 0)[0];
  const left = (iso.x0 - xy(0, 0)[0]) / unit;
  const fit = (points: Pt[], margin = 6): Pt[] => trim(points, ([u, v]) => u - v - left - margin * k / unit);
  const project = (points: Pt[], z = 0): Pt[] => points.map(([u, v]) => xy(u, v, z));
  const stone = P.paint(P.snow ? '#59697a' : '#24343e');
  // 与站前广场共用同一条地面边界，左侧沿边框截成楔形，不再另放方形底座。
  const forecourt = fit([[-20, -2.5], [-8.2, -2.5], [-8.2, 1.5], [-5.1, 1.5], [-5.1, 6.9], [-20, 6.9]], 0);
  let ground = polygon(project(forecourt), stone);
  for (const v of [-1.55, 2.8, 5.8]) {
    const start = Math.max(left + v + .3, -13.8);
    const end = v < 0 ? -8.4 : -5.2;
    if (start < end) ground += line([xy(start, v), xy(end, v)], P.paint('#475458'), .45 * k);
  }
  const bedU = left - 1.5;
  const bed = fit([[bedU - .45, -2.25], [bedU + 1, -2.25], [bedU + 1, -1.5], [bedU - .45, -1.5]], 4);
  ground += polygon(project(bed, k), P.paint(P.snow ? '#91a7a7' : '#3c6251'));
  for (let i = 0; i < 3; i++) {
    const plant = xy(bedU + .25 + i * .28, -1.95, (2.8 + i % 2) * k);
    ground += `<circle cx="${r2(plant[0])}" cy="${r2(plant[1])}" r="${r2(1.6 * k)}" fill="${P.paint(P.snow ? '#bed0d0' : '#54735d')}"/>`;
  }

  const wall = P.paint('#b39a79');
  const roof = P.paint(P.snow ? '#cddce5' : '#925951');
  const glass = P.paint(P.lights ? '#f2cc94' : '#3c616b');
  // 后厅与前厅组成折角，背面的厅在车站后面，前厅确实落在站厅前方的空地上。
  const hall = fit([[-12.2, -1.2], [-7.5, -1.2], [-7.5, 1.35], [-12.2, 1.35]]);
  const endU = phone ? -5.3 : -6.5;
  const endV = phone ? 3.35 : 3.9;
  const entry = fit([[-12.2, 1.35], [endU, 1.35], [endU, endV], [-12.2, endV]]);
  const walls = (footprint: Pt[], height: number): string => {
    const floor = project(footprint, k);
    const top = project(footprint, height * k);
    let svg = '';
    for (let i = 0; i < floor.length; i++) {
      const j = (i + 1) % floor.length;
      const [a, b] = [floor[i]!, floor[j]!];
      const [u0, v0] = footprint[i]!;
      const [u1, v1] = footprint[j]!;
      if (v1 - v0 - (u1 - u0) <= 1e-6) continue;
      svg += polygon([a, b, top[j]!, top[i]!], shade(wall, b[0] > a[0] ? .85 : .67));
    }
    return svg + polygon(top, wall);
  };
  let rear = walls(hall, 13);
  const center: Pt = [hall.reduce((sum, p) => sum + p[0], 0) / hall.length, hall.reduce((sum, p) => sum + p[1], 0) / hall.length];
  const hip = xy(center[0], center[1], 20 * k);
  for (let i = 0; i < hall.length; i++) rear += polygon([xy(...hall[i]!, 13 * k), xy(...hall[(i + 1) % hall.length]!, 13 * k), hip], shade(roof, .72 + .07 * i));
  // 临街的斜边橱窗也沿建筑轮廓展开，避免把裁成楔形的墙画回矩形。
  const shopWindows = (footprint: Pt[], height: number): string => footprint.map((a, i) => {
    const b = footprint[(i + 1) % footprint.length]!;
    if (b[1] - a[1] - (b[0] - a[0]) <= 1e-6 || (a[0] === endU && b[0] === endU)) return '';
    const count = Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / .8);
    const at = (f: number, z: number) => xy(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, z * k);
    return Array.from({ length: count }, (_, n) => polygon([at((n + .18) / count, 3), at((n + .78) / count, 3), at((n + .78) / count, height), at((n + .18) / count, height)], glass)).join('');
  }).join('');
  rear += shopWindows(hall, 9);
  let front = walls(entry, 11.5) + shopWindows(entry, 8.2);
  const canopy = project(entry, 12.1 * k);
  front += polygon(canopy, shade(roof, .86)) + line([...canopy, canopy[0]!], P.paint('#b58169'), .65 * k);
  // 正门朝 +u 的站前广场，门顶也低于站厅投影的底边，不能靠图层强行透出。
  const middle = phone ? 2.65 : 3.15;
  front += block(iso, endU, endU + .42, middle - .56, middle + .56, 0, .8 * k, P.paint('#81908b'));
  const door = [xy(endU + .02, middle - .43, 1.1 * k), xy(endU + .02, middle + .43, 1.1 * k), xy(endU + .02, middle + .43, 8.3 * k), xy(endU + .02, middle - .43, 8.3 * k)];
  front += `<g data-door-facing="station">${polygon(door, glass)}</g>`;
  front += line([...door, door[0]!], P.paint('#705547'), .65 * k);
  front += line([xy(endU + .03, middle, 1.1 * k), xy(endU + .03, middle, 8.3 * k)], P.paint('#6b5144'), .8 * k);
  for (const side of [-.11, .11]) front += line([xy(endU + .04, middle + side, 3.8 * k), xy(endU + .04, middle + side, 5.3 * k)], P.paint('#dcc69a'), .55 * k);
  for (let i = 0; i < 6; i++) {
    const v0 = middle - .63 + i * .21;
    front += polygon([xy(endU, v0, 10 * k), xy(endU + .45, v0, 9 * k), xy(endU + .45, v0 + .21, 9 * k), xy(endU, v0 + .21, 10 * k)], P.paint(i % 2 ? '#d6c3a3' : '#986454'));
  }
  // 餐盘、餐具和门边暖灯，无需额外文字或字体。
  const sign = xy(endU + .03, middle - .9, 8.5 * k);
  front += `<circle cx="${r2(sign[0])}" cy="${r2(sign[1])}" r="${r2(2 * k)}" fill="${P.paint('#d8c49f')}"/>`;
  front += line([[sign[0] - 3 * k, sign[1] - 2 * k], [sign[0] - 3 * k, sign[1] + 2 * k]], P.paint('#e5d8ba'), .65 * k);
  return { ground: `<g data-landmark="restaurant-ground">${ground}</g>`, rear: `<g data-landmark="restaurant">${rear}</g>`, front: `<g data-landmark="restaurant-entrance">${front}</g>` };
}

function pavilion(iso: Iso, P: Painter): { ground: string; building: string } {
  const { xy, k, weeks } = iso;
  const unit = xy(1, 0)[0] - xy(0, 0)[0];
  const right = (iso.x1 - xy(0, 0)[0]) / unit;
  const v = 5.55;
  const u = Math.min(weeks + 9.4, right - 12 * k / unit + v - 1.85);
  // 庭院接到既有广场，并一直铺到右边框、滨海路内沿，保留折角而非方形地基。
  const outline = trim([[weeks + 5.7, -.05], [right + 9, -.05], [right + 9, 7.02], [weeks + 5.6, 7.02], [weeks + 5.6, 6.4], [weeks + 5.05, 5.85], [weeks + 5.65, 4.8]], ([u, v]) => right - u + v);
  let ground = polygon(outline.map(([u, v]) => xy(u, v)), P.paint(P.snow ? '#647477' : '#2b4140'));
  ground += line([xy(weeks + 5.65, 6.97), xy(right + 6.97, 6.97)], P.paint('#687b75'), .65 * k);
  const path = [xy(Math.min(weeks + 5.8, u - 1.4), 5.8), xy(u + .1, 6.1), xy(u + 1.8, 6.55), xy(right + 6.55 - .2, 6.55)];
  ground += `<path d="M${pt(path[0]!)}Q${pt(path[1]!)} ${pt(path[2]!)}L${pt(path[3]!)}" fill="none" stroke="${P.paint('#8b9382')}" stroke-width="${r2(2.3 * k)}" stroke-linecap="round"/>`;
  for (const [du, dv, size] of [[2.1, 1.12, .35], [2.8, 1.1, .24], [3.25, 1.04, .3]]) {
    const x = u + du!;
    const y = v + dv!;
    ground += polygon([xy(x - size!, y, .6 * k), xy(x, y - size!, 2.5 * k), xy(x + size!, y, 1.5 * k), xy(x + .1, y + size!, .6 * k)], P.paint('#7a8681'));
  }
  const bambooV = k < .8 ? 4.35 : 3.2;
  const bambooU = right + bambooV - .75;
  for (let i = 0; i < 3; i++) {
    const at = (z: number) => xy(bambooU + i * .12, bambooV + i * .17, z * k);
    ground += line([at(0), at(8 + i)], P.paint(P.snow ? '#aabdb6' : '#5d8270'), .75 * k);
    for (const z of [4, 6]) {
      const [x, y] = at(z);
      ground += line([[x - 2 * k, y - 1.5 * k], [x, y], [x + 1.7 * k, y - 2.4 * k]], P.paint(P.snow ? '#c2d2cb' : '#62836d'), k);
    }
  }
  const ring = (radius: number, z: number): Pt[] => Array.from({ length: 8 }, (_, i) => xy(u + radius * Math.cos(i * Math.PI / 4), v + radius * Math.sin(i * Math.PI / 4), z));
  const base = ring(1.17, 0);
  const deck = ring(1.17, 1.8 * k);
  let svg = '';
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8;
    if ((base[i]![1] + base[j]![1]) / 2 > xy(u, v)[1]) svg += polygon([base[i]!, base[j]!, deck[j]!, deck[i]!], P.paint('#606d6a'));
  }
  svg += polygon(deck, P.paint('#61776c'));
  const columns = Array.from({ length: 8 }, (_, i) => [u + .83 * Math.cos(i * Math.PI / 4), v + .83 * Math.sin(i * Math.PI / 4)] as Pt);
  for (const [cu, cv] of [...columns].sort((a, b) => a[0] + a[1] - b[0] - b[1])) {
    svg += line([xy(cu, cv, 1.8 * k), xy(cu, cv, 14.5 * k)], P.paint('#a7574c'), 1.7 * k);
    svg += block(iso, cu - .1, cu + .1, cv - .1, cv + .1, 12.7 * k, 1.5 * k, P.paint('#ae8962'));
  }
  // 两侧朱红栏杆留出正中的入口。
  for (const i of [2, 7]) {
    const [a, b] = [columns[i]!, columns[(i + 1) % 8]!];
    svg += line([xy(...a, 5.5 * k), xy(...b, 5.5 * k)], P.paint('#a9604d'), k);
    for (const f of [.2, .5, .8]) {
      const cu = a[0] + (b[0] - a[0]) * f;
      const cv = a[1] + (b[1] - a[1]) * f;
      svg += line([xy(cu, cv, 2 * k), xy(cu, cv, 5.5 * k)], P.paint('#a9604d'), .6 * k);
    }
  }
  for (const i of [0, 2]) {
    const [cu, cv] = columns[i]!;
    const [x, y] = xy(cu, cv, 9.3 * k);
    svg += line([xy(cu, cv, 13 * k), [x, y - 1.7 * k]], P.paint('#b99c6a'), .55 * k);
    svg += `<ellipse cx="${r2(x)}" cy="${r2(y)}" rx="${r2(1.5 * k)}" ry="${r2(2 * k)}" fill="${P.paint('#b75e4e')}"/><path d="M${pt([x, y - k])}V${r2(y + k)}" stroke="${P.paint(P.lights ? '#ffdb95' : '#d6ab78')}" stroke-width="${r2(k)}"/>`;
  }
  // 八角攒尖顶：曲线屋面在檐口下垂，角梁向上挑起，金色脊线和宝顶强调中式轮廓。
  const roof = P.paint(P.snow ? '#cbdce5' : '#427d79');
  const peak = xy(u, v, 27 * k);
  let tiles = '';
  // 先画后坡再画前坡，檐口的厚度和瓦垄也遵守同一遮挡关系。
  const slopes = Array.from({ length: 8 }, (_, i) => i).sort((a, b) => Math.cos((a + .5) * Math.PI / 4) + Math.sin((a + .5) * Math.PI / 4) - Math.cos((b + .5) * Math.PI / 4) - Math.sin((b + .5) * Math.PI / 4));
  for (const i of slopes) {
    const a = i * Math.PI / 4;
    const b = (i + 1) * Math.PI / 4;
    const edge = (angle: number) => xy(u + 1.6 * Math.cos(angle), v + 1.6 * Math.sin(angle), 16.5 * k);
    const shoulder = (angle: number) => xy(u + .7 * Math.cos(angle), v + .7 * Math.sin(angle), 17.5 * k);
    const middle = xy(u + .8 * (Math.cos(a) + Math.cos(b)), v + .8 * (Math.sin(a) + Math.sin(b)), 11 * k);
    tiles += `<path d="M${pt(peak)}Q${pt(shoulder(a))} ${pt(edge(a))}Q${pt(middle)} ${pt(edge(b))}Q${pt(shoulder(b))} ${pt(peak)}Z" fill="${shade(roof, .68 + .3 * (1 + Math.cos(a)) / 2)}"/>`;
    for (const t of [.62, .82]) {
      const at = (control: Pt, end: Pt): Pt => [0, 1].map(axis => (1 - t) ** 2 * peak[axis]! + 2 * t * (1 - t) * control[axis]! + t * t * end[axis]!) as Pt;
      const shoulders: Pt = [(shoulder(a)[0] + shoulder(b)[0]) / 2, (shoulder(a)[1] + shoulder(b)[1]) / 2];
      tiles += `<path d="M${pt(at(shoulder(a), edge(a)))}Q${pt(at(shoulders, middle))} ${pt(at(shoulder(b), edge(b)))}" fill="none" stroke="${P.paint(P.snow ? '#e1ebed' : '#79a397')}" stroke-width="${r2(.4 * k)}" stroke-opacity=".7"/>`;
    }
    tiles += `<path d="M${pt(edge(a))}Q${pt(middle)} ${pt(edge(b))}" fill="none" stroke="${P.paint('#2d514d')}" stroke-width="${r2(1.5 * k)}"/>`;
    tiles += `<path d="M${pt(edge(a))}Q${pt(middle)} ${pt(edge(b))}M${pt(edge(a))}Q${pt(shoulder(a))} ${pt(peak)}" fill="none" stroke="${P.paint('#b9a16e')}" stroke-width="${r2(.5 * k)}"/>`;
  }
  svg += `<g data-roof="upturned-eaves">${tiles}</g>`;
  const top = xy(u, v, 29 * k);
  svg += line([peak, top], P.paint('#c5ad75'), k) + `<circle cx="${r2(top[0])}" cy="${r2(top[1])}" r="${r2(1.1 * k)}" fill="${P.paint('#c5ad75')}"/>`;
  return { ground: `<g data-landmark="pavilion-ground">${ground}</g>`, building: `<g data-landmark="pavilion">${svg}</g>` };
}

/** 把设施的完整运动包络写入 SVG，供飞机航线与遮挡检查使用。 */
const bounds = (points: Pt[], margin: number): string => {
  const xs = points.map(p => p[0]);
  const ys = points.map(p => p[1]);
  return [Math.min(...xs) - margin, Math.min(...ys) - margin, Math.max(...xs) + margin, Math.max(...ys) + margin].map(r2).join(',');
};

function amusement(iso: Iso, P: Painter): { svg: string; css: string } {
  const { xy, k } = iso;
  const unit = xy(1, 0)[0] - xy(0, 0)[0];
  const end = Math.min(iso.weeks - 4, (iso.x1 - xy(0, 0)[0] - 12 * k) / unit - 10.5);
  const start = end - 12;
  let svg = polygon([xy(start, -10.5), xy(end, -10.5), xy(end, -5.2), xy(start, -5.2)], P.paint(P.snow ? '#52676b' : '#153133'));
  svg += line([xy(start, -5.2), xy(end, -5.2), xy(end, -10.5)], P.paint('#477575'), .8 * k);
  const css: string[] = [];

  const base = xy(start + 3.3, -7.8);
  const center: Pt = [base[0], base[1] - 35 * k];
  const radius = 25 * k;
  const around = (f: number): Pt => {
    const x = radius * Math.cos(f * Math.PI * 2);
    return [center[0] + x, center[1] + x * .5 + radius * Math.sin(f * Math.PI * 2)];
  };
  const feet = [xy(start + 1.6, -7.4, 2 * k), xy(start + 4.9, -7.4, 2 * k)];
  const wheelBounds = bounds([...Array.from({ length: 128 }, (_, i) => around(i / 128)), ...feet], 5.5 * k);
  let wheel = line([feet[0]!, center, feet[1]!], P.paint('#76969c'), 2 * k);
  wheel += `<g transform="translate(${pt(center)})"><g transform="matrix(1 .5 0 1 0 0)"><g class="wheel"><circle r="${r2(radius)}" fill="none" stroke="${P.paint('#88bbc3')}" stroke-width="${r2(1.4 * k)}"/>`;
  for (let i = 0; i < 10; i++) wheel += line([[0, 0], [radius * Math.cos(i * Math.PI / 5), radius * Math.sin(i * Math.PI / 5)]], P.paint('#537e89'), .65 * k);
  wheel += `</g></g><circle r="${r2(2 * k)}" fill="${P.paint('#c9dce2')}"/></g>`;
  css.push(`@keyframes zwheel{to{transform:rotate(360deg)}}\n.wheel{animation:zwheel 48s linear infinite;transform-origin:0px 0px}`);
  for (let i = 0; i < 10; i++) {
    const frames = Array.from({ length: 65 }, (_, j) => `${j * 100 / 64}%{transform:translate(${around(i / 10 + j / 64).map(n => `${r2(n)}px`).join(',')})}`);
    css.push(`@keyframes zgondola${i}{${frames.join('')}}\n.gondola${i}{animation:zgondola${i} 48s linear infinite}`);
    const color = P.paint(['#bf8f99', '#66a8ad', '#c1a06d'][i % 3]!);
    wheel += `<g class="gondola${i}" transform="translate(${pt(around(i / 10))})"><path d="M0 0V${r2(2 * k)}" stroke="${P.paint('#889ba5')}" stroke-width="${r2(.6 * k)}"/><rect x="${r2(-2.4 * k)}" y="${r2(1.2 * k)}" width="${r2(4.8 * k)}" height="${r2(3.3 * k)}" rx="${r2(.8 * k)}" fill="${color}"/><path d="M${r2(-1.5 * k)} ${r2(2 * k)}H${r2(1.5 * k)}" stroke="${P.lights ? P.paint('#e4e4bd') : P.paint('#345463')}" stroke-width="${r2(k)}"/></g>`;
  }
  svg += `<g data-ride="ferris-wheel" data-airspace="${wheelBounds}">${wheel}</g>`;

  // 三维闭合轨道：高处的提升坡、连续落差和低处回转，立柱始终落在园区地面上。
  const knots = [
    [start + 6.2, -5.9, 6], [start + 7, -7.1, 13], [start + 8, -8.8, 42],
    [start + 10.3, -9.7, 45], [start + 11.5, -8.8, 12], [start + 10.7, -7, 7],
    [start + 9, -5.7, 29], [start + 7.4, -5.6, 25],
  ];
  const route = (f: number): [number, number, number] => {
    const at = f * knots.length;
    const i = Math.floor(at) % knots.length;
    const q = at - Math.floor(at);
    const p = [-1, 0, 1, 2].map(offset => knots[(i + offset + knots.length) % knots.length]!);
    return [0, 1, 2].map(axis => .5 * (2 * p[1]![axis]! + (-p[0]![axis]! + p[2]![axis]!) * q + (2 * p[0]![axis]! - 5 * p[1]![axis]! + 4 * p[2]![axis]! - p[3]![axis]!) * q * q + (-p[0]![axis]! + 3 * p[1]![axis]! - 3 * p[2]![axis]! + p[3]![axis]!) * q * q * q)) as [number, number, number];
  };
  const track = Array.from({ length: 129 }, (_, j) => { const [u, v, z] = route(j / 128); return xy(u, v, z * k); });
  let coaster = '';
  for (const [u, v, z] of knots) coaster += line([xy(u!, v!, 1.5 * k), xy(u!, v!, z! * k)], P.paint('#495f72'), .85 * k);
  for (let i = 0; i < knots.length; i++) {
    const a = knots[i]!;
    const b = knots[(i + 1) % knots.length]!;
    if (Math.max(a[2]!, b[2]!) < 20) continue;
    coaster += line([xy(a[0]!, a[1]!, 3 * k), xy(b[0]!, b[1]!, b[2]! * .75 * k)], P.paint('#536a7b'), .55 * k, ' stroke-opacity=".6"');
    coaster += line([xy(b[0]!, b[1]!, 3 * k), xy(a[0]!, a[1]!, a[2]! * .75 * k)], P.paint('#536a7b'), .55 * k, ' stroke-opacity=".6"');
  }
  coaster += line(track, P.paint('#304c5d'), 3.4 * k, ' stroke-linejoin="round"');
  coaster += line(track, P.paint('#cf97a2'), 1.2 * k, ' stroke-linejoin="round"');
  const lengths = [0];
  for (let i = 1; i < track.length; i++) lengths.push(lengths[i - 1]! + Math.hypot(track[i]![0] - track[i - 1]![0], track[i]![1] - track[i - 1]![1]));
  const total = lengths.at(-1)!;
  const sample = (f: number): { p: Pt; angle: number } => {
    const distance = ((f % 1 + 1) % 1) * total;
    const i = Math.max(1, lengths.findIndex(length => length >= distance));
    const a = track[i - 1]!;
    const b = track[i]!;
    const q = (distance - lengths[i - 1]!) / (lengths[i]! - lengths[i - 1]!);
    return { p: [a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q], angle: Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI };
  };
  for (let i = 0; i < 3; i++) {
    let previous = sample(-i * 7.5 * k / total).angle;
    const frames = Array.from({ length: 129 }, (_, j) => {
      const point = sample(j / 128 - i * 7.5 * k / total);
      let angle = point.angle;
      while (angle - previous > 180) angle -= 360;
      while (angle - previous < -180) angle += 360;
      previous = angle;
      return `${j * 100 / 128}%{transform:translate(${r2(point.p[0])}px,${r2(point.p[1])}px) rotate(${r2(angle)}deg)}`;
    });
    css.push(`@keyframes zcoaster${i}{${frames.join('')}}\n.coaster${i}{animation:zcoaster${i} 18s linear infinite}`);
    const initial = sample(-i * 7.5 * k / total);
    coaster += `<g class="coaster${i}" transform="translate(${pt(initial.p)}) rotate(${r2(initial.angle)})"><rect x="${r2(-3 * k)}" y="${r2(-3.3 * k)}" width="${r2(6 * k)}" height="${r2(3.3 * k)}" rx="${r2(.8 * k)}" fill="${P.paint(i % 2 ? '#c9a569' : '#b97b8a')}"/><path d="M${r2(-2 * k)} ${r2(-2.5 * k)}H${r2(2 * k)}" stroke="${P.lights ? P.paint('#eddbac') : P.paint('#334a5b')}" stroke-width="${r2(k)}"/></g>`;
  }
  const supports = knots.map(([u, v]) => xy(u!, v!, 1.5 * k));
  svg += `<g data-ride="roller-coaster" data-airspace="${bounds([...track, ...supports], 7 * k)}">${coaster}</g>`;
  // 园区入口的小摊和沿路暖灯，把设施与高架后方的地面联系起来。
  svg += block(iso, start + .3, start + 1.6, -6.5, -5.5, 0, 5 * k, P.paint('#6d7568'));
  svg += polygon([xy(start + .2, -6.6, 5 * k), xy(start + 1.7, -6.6, 5 * k), xy(start + 1.7, -5.4, 5 * k), xy(start + .2, -5.4, 5 * k)], P.paint(P.snow ? '#cddce5' : '#b08a77'));
  if (P.lights) for (let u = start + .5; u < end; u += 2) {
    const lamp = xy(u, -5.25, 3 * k);
    svg += `<circle cx="${r2(lamp[0])}" cy="${r2(lamp[1])}" r="${r2(.85 * k)}" fill="${P.paint('#ffd59a')}"/>`;
  }
  return { svg: `<g data-landmark="amusement-park">${svg}</g>`, css: css.join('\n') };
}

export function landmarks(iso: Iso, P: Painter): { far: string; restaurantGround: string; restaurant: string; restaurantFront: string; pavilionGround: string; pavilion: string; css: string } {
  const park = amusement(iso, P);
  const shelter = pavilion(iso, P);
  const diner = restaurant(iso, P);
  return { far: park.svg, restaurantGround: diner.ground, restaurant: diner.rear, restaurantFront: diner.front, pavilionGround: shelter.ground, pavilion: shelter.building, css: park.css };
}
