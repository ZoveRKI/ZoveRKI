// 标注空白处的设施：车站旁的小餐馆、广场尽端的亭子，以及高架后方的滨海游乐园。
import type { Iso, Painter, Pt } from './landscape.ts';
import { r2, shade } from '../svg.ts';
import { theme as t } from '../theme.ts';

const pt = ([x, y]: Pt): string => `${r2(x)},${r2(y)}`;
const polygon = (points: Pt[], fill: string): string => `<polygon points="${points.map(pt).join(' ')}" fill="${fill}"/>`;
const line = (points: Pt[], color: string, width: number, extra = ''): string => `<path d="M${points.map(pt).join('L')}" fill="none" stroke="${color}" stroke-width="${r2(width)}"${extra}/>`;
const circle = ([x, y]: Pt, r: number, fill: string, extra = ''): string => `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r)}" fill="${fill}"${extra}/>`;
/** 城市右端海滨广场的地面色；亭子的庭院和广场连成一片，共用这一种颜色 */
export const plazaGround = (P: Painter): string => P.paint(P.snow ? '#455560' : '#203237');
/** 地面上以 (u, v) 为中心、外接圆半径为 r 的正 n 边形，第一个顶点朝 +u */
const ring =(u: number, v: number, r: number, n: number): Pt[] => Array.from({ length: n }, (_, i) => [u + r * Math.cos(i * 2 * Math.PI / n), v + r * Math.sin(i * 2 * Math.PI / n)]);

function block(iso: Iso, u0: number, u1: number, v0: number, v1: number, z: number, h: number, color: string): string {
  const { xy } = iso;
  const [T, R, B, L] = [xy(u0, v0, z), xy(u1, v0, z), xy(u1, v1, z), xy(u0, v1, z)];
  const lift = ([x, y]: Pt): Pt => [x, y - h];
  return polygon([L!, B!, lift(B!), lift(L!)], shade(color, .72)) + polygon([B!, R!, lift(R!), lift(B!)], shade(color, .5)) + polygon([T!, R!, B!, L!].map(lift), color);
}

/** 任意凸多边形底面的直棱柱：只画朝向观众（+u、+v 一侧）的侧面，明暗随朝向连续过渡，与 block 的左右两面一致 */
function prism(iso: Iso, footprint: Pt[], z: number, h: number, color: string, top = color): string {
  const cu = footprint.reduce((sum, p) => sum + p[0], 0) / footprint.length;
  const cv = footprint.reduce((sum, p) => sum + p[1], 0) / footprint.length;
  let svg = '';
  footprint.forEach((a, i) => {
    const b = footprint[(i + 1) % footprint.length]!;
    let [nu, nv] = [b[1] - a[1], a[0] - b[0]];
    if (nu * ((a[0] + b[0]) / 2 - cu) + nv * ((a[1] + b[1]) / 2 - cv) < 0) [nu, nv] = [-nu, -nv];
    if (nu + nv <= 1e-6) return;
    svg += polygon([iso.xy(...a, z), iso.xy(...b, z), iso.xy(...b, z + h), iso.xy(...a, z + h)], shade(color, .61 + .11 * (nv - nu) / Math.hypot(nu, nv)));
  });
  return svg + polygon(footprint.map(p => iso.xy(...p, z + h)), top);
}

/** 正 n 棱锥形的篷顶：apex 是尖顶，rim(a) 是檐口上角度 a 处的点；各面从远到近画、颜色轮流取 colors，朝左前方的面亮一些 */
function cone(n: number, apex: Pt, rim: (a: number) => Pt, colors: string[], light: number): string {
  const step = 2 * Math.PI / n;
  const near = (i: number): number => Math.sin((i + .5) * step + Math.PI / 4);
  return Array.from({ length: n }, (_, i) => i).sort((a, b) => near(a) - near(b))
    .map(i => polygon([apex, rim(i * step), rim((i + 1) * step)], shade(colors[i % colors.length]!, 1 - light + light * Math.cos((i + .5) * step - Math.PI * .6)))).join('');
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
  // 庭院接到既有广场，并一直铺到右边框、滨海路内沿，保留折角而非方形地基；地面和广场同色，看起来是同一片园地。
  // 前沿停在路面内沿（v = 7.1）里侧一点：不压到路面，也不在两者之间漏出一条深色底色的细缝。
  const outline = trim([[weeks + 5.7, -.05], [right + 9, -.05], [right + 9, 7.09], [weeks + 5.6, 7.09], [weeks + 5.6, 6.4], [weeks + 5.05, 5.85], [weeks + 5.65, 4.8]], ([u, v]) => right - u + v);
  let ground = polygon(outline.map(([u, v]) => xy(u, v)), plazaGround(P));
  // 台阶开在右前方那条边上（外法线朝 22.5°）；石板路从最下一级台阶起步，拐个弯垂直接到滨海路内沿，不再从台基底下穿过。
  const facing = Math.PI / 8;
  const local = (x: number, y: number): Pt => [u + x * Math.cos(facing) - y * Math.sin(facing), v + x * Math.sin(facing) + y * Math.cos(facing)];
  const apothem = 1.22 * Math.cos(facing);
  const [a, b, c]: Pt[] = [local(apothem + .34, 0), [u + 2.75, 6.5], [u + 2.75, 7.09]];
  const slabs = Array.from({ length: 13 }, (_, i): [Pt, Pt] => {
    const s = i / 12;
    const [pu, pv] = [0, 1].map(axis => (1 - s) ** 2 * a![axis]! + 2 * s * (1 - s) * b![axis]! + s * s * c![axis]!);
    const [du, dv] = [0, 1].map(axis => (1 - s) * (b![axis]! - a![axis]!) + s * (c![axis]! - b![axis]!));
    const n = Math.hypot(du!, dv!) / .23;
    return [[pu! - dv! / n, pv! + du! / n], [pu! + dv! / n, pv! - du! / n]];
  });
  const seam = P.paint(P.snow ? '#8c9c9e' : '#59625a');
  ground += polygon([...slabs.map(([l]) => xy(...l)), ...slabs.map(([, r]) => xy(...r)).reverse()], P.paint(P.snow ? '#a9b9ba' : '#78816f'));
  ground += `<path d="${slabs.filter((_, i) => i % 2).map(([l, r]) => `M${pt(xy(...l))}L${pt(xy(...r))}`).join('')}" stroke="${seam}" stroke-width="${r2(.4 * k)}"/>`;
  ground += line(slabs.map(([l]) => xy(...l)), seam, .5 * k) + line(slabs.map(([, r]) => xy(...r)), seam, .5 * k);

  // 竹丛贴着右边框，从亭子右后方的屋檐后面探出来；先画，由屋顶盖住重叠的部分。
  const bambooV = 3.3;
  const bambooU = right + bambooV - .8;
  const culms: string[] = [];
  const nodes: string[] = [];
  const leaves: string[][] = [[], []];
  for (const [du, dv, height, lean] of [[-.12, .1, 15, -1.2], [-.03, -.05, 21, .3], [.06, .06, 18, 1.1], [.13, -.07, 12, 1.3]]) {
    const [x, y] = xy(bambooU + du!, bambooV + dv!);
    const at = (f: number): Pt => [x + lean! * k * f * f, y - height! * k * f];
    culms.push(`M${pt([x, y])}Q${pt([x, y - height! * k / 2])} ${pt(at(1))}`);
    for (let f = .2; f < .95; f += .2) nodes.push(`M${pt([at(f)[0] - .6 * k, at(f)[1]])}L${pt([at(f)[0] + .6 * k, at(f)[1]])}`);
    for (const [j, f] of [.55, .7, .84, .97].entries()) {
      const [lx, ly] = at(f);
      const side = j % 2 ? 1 : -1;
      leaves[j % 2]!.push(`M${pt([lx, ly])}L${pt([lx + side * 2.3 * k, ly + 1.1 * k])}M${pt([lx, ly])}L${pt([lx + side * 1.6 * k, ly - .7 * k])}`);
    }
  }
  let svg = `<path d="${culms.join('')}" fill="none" stroke="${P.paint(P.snow ? '#a9bdb5' : '#6d9a7a')}" stroke-width="${r2(.8 * k)}"/>`;
  svg += `<path d="${nodes.join('')}" stroke="${P.paint('#4d7a5d')}" stroke-width="${r2(.45 * k)}"/>`;
  for (const [j, color] of [P.snow ? '#c3d3cc' : '#4d8165', P.snow ? '#d5e2dc' : '#649a7b'].entries()) {
    svg += `<path d="${leaves[j]!.join('')}" stroke="${P.paint(color)}" stroke-width="${r2(1.05 * k)}" stroke-linecap="round"/>`;
  }

  // 两层八角石台基：下层略宽，上层承托柱子，顶边各描一道浅色石棱；两级踏步，最低一级与下层台基齐平。
  const deck = 3 * k;
  const brink = (r: number, z: number): Pt[] => [-1, 0, 1, 2, 3].map(i => xy(u + r * Math.cos(i * Math.PI / 4), v + r * Math.sin(i * Math.PI / 4), z));
  svg += prism(iso, ring(u, v, 1.38, 8), 0, 1.1 * k, P.paint('#58655f'), P.paint(P.snow ? '#d3dee2' : '#6b7872'));
  svg += line(brink(1.38, 1.1 * k), P.paint('#8a978e'), .45 * k);
  svg += prism(iso, ring(u, v, 1.22, 8), 1.1 * k, deck - 1.1 * k, P.paint('#69766f'), P.paint(P.snow ? '#e0e9ec' : '#7c8981'));
  svg += line(brink(1.22, deck), P.paint('#9eaaa0'), .5 * k);
  for (const [x0, x1, z0, z1] of [[1.38 * Math.cos(facing) - .02, apothem + .4, 0, 1.1], [apothem - .02, apothem + .2, 1.1, 2.05]]) {
    svg += prism(iso, [local(x0!, -.31), local(x1!, -.31), local(x1!, .31), local(x0!, .31)], z0! * k, (z1! - z0!) * k, P.paint('#69766f'), P.paint(P.snow ? '#e3ebee' : '#8a968d'));
  }
  const columns = ring(u, v, .83, 8);
  for (const [cu, cv] of [...columns].sort((a, b) => a[0] + a[1] - b[0] - b[1])) {
    svg += line([xy(cu, cv, deck), xy(cu, cv, 14.5 * k)], P.paint('#a7574c'), 1.7 * k);
    svg += block(iso, cu - .1, cu + .1, cv - .1, cv + .1, 12.7 * k, 1.5 * k, P.paint('#ae8962'));
  }
  // 美人靠：台阶所在的入口之外，朝外的三面各有坐凳和朱红靠栏；背面几面藏在屋檐后面，不必画。
  for (const i of [7, 1, 2]) {
    const [p, q] = [columns[i]!, columns[(i + 1) % 8]!];
    const at = (f: number, z: number): Pt => xy(p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, deck + z * k);
    svg += line([at(0, 1.5), at(1, 1.5)], P.paint('#7b5345'), 1.1 * k) + line([at(0, 3.6), at(1, 3.6)], P.paint('#a9604d'), k);
    svg += `<path d="${[.2, .4, .6, .8].map(f => `M${pt(at(f, .2))}L${pt(at(f, 3.6))}`).join('')}" stroke="${P.paint('#a9604d')}" stroke-width="${r2(.55 * k)}"/>`;
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

  // 台阶旁的石灯笼，夜里灯室透出暖光；小路左边一块太湖石，右边两丛灌木。
  const [lu, lv] = [u + 1.85, v - .25];
  const granite = P.paint(P.snow ? '#9eacae' : '#77837d');
  const cap = P.paint(P.snow ? '#e0e9ec' : '#69756f');
  svg += block(iso, lu - .17, lu + .17, lv - .17, lv + .17, 0, k, granite) + block(iso, lu - .07, lu + .07, lv - .07, lv + .07, k, 3.6 * k, granite);
  svg += block(iso, lu - .16, lu + .16, lv - .16, lv + .16, 4.6 * k, .7 * k, granite) + block(iso, lu - .11, lu + .11, lv - .11, lv + .11, 5.3 * k, 1.9 * k, granite);
  const fire = P.paint(P.lights ? '#ffd59a' : '#3e4b48');
  svg += polygon([xy(lu - .05, lv + .11, 5.8 * k), xy(lu + .05, lv + .11, 5.8 * k), xy(lu + .05, lv + .11, 6.8 * k), xy(lu - .05, lv + .11, 6.8 * k)], fire);
  svg += polygon([xy(lu + .11, lv - .05, 5.8 * k), xy(lu + .11, lv + .05, 5.8 * k), xy(lu + .11, lv + .05, 6.8 * k), xy(lu + .11, lv - .05, 6.8 * k)], fire);
  const lid = [xy(lu - .25, lv - .25, 7.2 * k), xy(lu + .25, lv - .25, 7.2 * k), xy(lu + .25, lv + .25, 7.2 * k), xy(lu - .25, lv + .25, 7.2 * k)];
  for (const [i, f] of [[0, .9], [3, .95], [1, .62], [2, .8]]) svg += polygon([lid[i!]!, lid[(i! + 1) % 4]!, xy(lu, lv, 8.8 * k)], shade(cap, f!));
  svg += circle(xy(lu, lv, 9.4 * k), .7 * k, cap);
  if (P.lights) svg += circle(xy(lu, lv, 6.3 * k), 4 * k, 'url(#lampglow)');
  const [rx, ry] = xy(u + 1.4, 6.82);
  const stone = (list: number[][]): Pt[] => list.map(([dx, dy]) => [rx + dx! * k, ry + dy! * k]);
  svg += polygon(stone([[-2.3, 0], [-2.7, -2.1], [-1.7, -4.3], [-.5, -5.5], [.9, -4.6], [1.6, -5.9], [2.6, -4.1], [2.1, -1.9], [2.6, 0]]), P.paint(P.snow ? '#b4c2c5' : '#5c6865'));
  svg += polygon(stone([[-2.3, 0], [-2.7, -2.1], [-1.7, -4.3], [-.5, -5.5], [.1, -3.4], [-.7, -1.3], [-1.1, 0]]), P.paint(P.snow ? '#dce5e8' : '#7f8b86'));
  svg += circle([rx + .8 * k, ry - 2.7 * k], .55 * k, P.paint('#3b4644'));
  for (const [bu, bv, s] of [[u + 3.27, 6.78, 1], [u + 3.55, 6.57, .85]]) {
    const [x, y] = xy(bu!, bv!);
    svg += circle([x, y - 1.7 * s! * k], 2.6 * s! * k, P.paint(P.snow ? '#b9cac6' : '#2f5a48')) + circle([x - .8 * s! * k, y - 2.4 * s! * k], 1.7 * s! * k, P.paint(P.snow ? '#d9e4e0' : '#3f7258'));
  }
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
  const hubU = start + 3.3;
  const hubV = -7.8;
  // 摩天轮和旋转木马都靠一对互逆的旋转：外层公转，里层反向自转，吊厢和木马因此始终直立。
  const css: string[] = [`@keyframes zwheel{to{transform:rotate(360deg)}}
.wheel{animation:zwheel 48s linear infinite;transform-origin:0px 0px}.unwheel{animation:zwheel 48s linear infinite reverse;transform-origin:0px 0px}
.carousel{animation:zwheel 26s linear infinite reverse;transform-origin:0px 0px}.rider{animation:zwheel 26s linear infinite;transform-origin:0px 0px}
@keyframes zgallop{50%{transform:translateY(${r2(-1.3 * k)}px)}}
.gallop0{animation:zgallop 1.6s ease-in-out infinite}.gallop1{animation:zgallop 1.6s ease-in-out .8s infinite}
@keyframes zchain{to{stroke-dashoffset:${r2(-2.2 * k)}}}
.chain{animation:zchain .45s linear infinite}`];
  if (P.lights) css.push(`@keyframes zbulb{50%{opacity:.25}}\n.bulb0{animation:zbulb 1.4s ease-in-out infinite}.bulb1{animation:zbulb 1.4s ease-in-out .7s infinite}`);

  // 园区是一块台地，向右一直铺到边框，沿边框截齐；草坪、入口广场、摩天轮下的候车坪和连到过山车站台的步道分开铺装，外圈一道矮栏杆。
  const right = (iso.x1 - xy(0, 0)[0]) / unit;
  const fit = (points: Pt[]): Pt[] => trim(points, ([u, v]) => right - u + v);
  let svg = polygon(fit([[start, -10.5], [right + 20, -10.5], [right + 20, -5.2], [start, -5.2]]).map(p => xy(...p)), P.paint(P.snow ? '#52676b' : '#153133'));
  svg += line([xy(start, -5.2), xy(right - 5.2, -5.2)], P.paint('#477575'), .8 * k);
  const lawns: Pt[][] = [
    [[start + .1, -10.4], [hubU - 1.45, -10.4], [hubU - 1.45, -7.3], [start + .1, -7.3]],
    [[hubU - 1.45, -10.4], [start + 5.9, -10.4], [start + 5.9, -8.9], [hubU - 1.45, -8.9]],
    [[start + 7, -8.6], [start + 7.9, -9.15], [start + 9.6, -9.35], [start + 10.85, -8.7], [start + 10.85, -7.4], [start + 10, -6.65], [start + 8, -6.35], [start + 6.75, -6.7], [start + 6.65, -7.6]],
    fit([[end, -10.4], [right + 20, -10.4], [right + 20, -7.3], [end, -7.3]]),
  ];
  for (const area of lawns) svg += polygon(area.map(p => xy(...p)), P.paint(P.snow ? '#6b8184' : '#183a33'));
  const plaza: Pt[] = [[start + .1, -7.2], [hubU - 1.35, -7.2], [hubU - 1.35, -8.75], [hubU + 1.35, -8.75], [hubU + 1.35, -7.2], [start + 5.8, -7.2], [start + 5.8, -5.62], [start + 6.9, -5.62], [start + 6.9, -5.3], [start + .1, -5.3]];
  const paving = P.paint(P.snow ? '#879a9d' : '#25423f');
  svg += polygon(plaza.map(p => xy(...p)), paving);
  svg += polygon(fit([[start + 8.1, -5.62], [end, -5.62], [end, -7.2], [right + 20, -7.2], [right + 20, -5.3], [start + 8.1, -5.3]]).map(p => xy(...p)), paving);
  let seams = '';
  for (const v of [-6.72, -6.24, -5.76]) seams += `M${pt(xy(start + .1, v))}L${pt(xy(start + 5.8, v))}M${pt(xy(end, v))}L${pt(xy(right + v, v))}`;
  for (let u = start + .65; u < start + 5.8; u += .65) seams += `M${pt(xy(u, -7.2))}L${pt(xy(u, -5.3))}`;
  for (let u = end + .65; u < right - 5.3; u += .65) seams += `M${pt(xy(u, Math.max(-7.2, u - right)))}L${pt(xy(u, -5.3))}`;
  svg += `<path d="${seams}" stroke="${P.paint(P.snow ? '#9aabae' : '#2e4d4a')}" stroke-width="${r2(.4 * k)}"/>`;
  // 过山车区的右侧栏杆只围到后半段，前面敞开接右侧的入口广场。
  const fence: string[] = [];
  for (const [a, b] of [[[start + .06, -7.3], [start + .06, -10.44]], [[start + .06, -10.44], [right - 10.5, -10.44]], [[end - .06, -10.44], [end - .06, -7.3]]] as [Pt, Pt][]) {
    const n = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / .45);
    fence.push(`M${pt(xy(...a, 1.8 * k))}L${pt(xy(...b, 1.8 * k))}`);
    for (let i = 0; i <= n; i++) {
      const p: Pt = [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n];
      fence.push(`M${pt(xy(...p))}L${pt(xy(...p, 1.8 * k))}`);
    }
  }
  svg += `<path d="${fence.join('')}" fill="none" stroke="${P.paint('#56797c')}" stroke-width="${r2(.55 * k)}"/>`;
  const tree = (u: number, v: number, s: number): string => {
    const [x, y] = xy(u, v);
    const crown = y - 6 * s * k;
    const leafy = `<path d="M${r2(x)} ${r2(y)}V${r2(crown)}" stroke="${P.paint(t.land.trunk)}" stroke-width="${r2(1.1 * s * k)}"/>` + circle([x, crown], 3.3 * s * k, P.paint(t.land.tree[1])) + circle([x - .9 * s * k, crown - .8 * s * k], 2.2 * s * k, P.paint(t.land.tree[0]));
    return P.snow ? leafy + circle([x - .2 * s * k, crown - 2.1 * s * k], 1.7 * s * k, P.paint('#cfd9e6')) : leafy;
  };
  for (const [du, v, s] of [[.5, -8.05, 1], [.6, -9.45, 1.1], [1.4, -10.1, .9], [2.5, -10.15, 1], [4.3, -10.15, 1.05], [5.45, -9.55, .9], [11.75, -10.1, .85]]) svg += tree(start + du!, v!, s!);

  // 摩天轮：前后两圈轮辋由辐条和三角桁架连成整体，两侧 A 字形支架撑起轮轴，吊厢挂在两圈轮辋之间的横轴上。
  // 轮辋在 u-z 平面里转（先错切到这个平面，再在里面旋转）；吊厢随轮辋公转、再反向自转并撤销错切，始终竖直。
  const hubZ = 35 * k;
  const radius = 25 * k;
  const gap = .24;
  const hub = xy(hubU, hubV, hubZ);
  const shifted = (dv: number): Pt => xy(hubU, hubV + dv, hubZ);
  const around = (f: number, dv = 0): Pt => {
    const x = radius * Math.cos(f * Math.PI * 2);
    const [cx, cy] = shifted(dv);
    return [cx + x, cy + x * .5 + radius * Math.sin(f * Math.PI * 2)];
  };
  const rotor = (center: Pt, content: string): string => `<g transform="translate(${pt(center)})"><g transform="matrix(1 .5 0 1 0 0)"><g class="wheel">${content}</g></g></g>`;
  const rim = (front: boolean): string => {
    const steel = P.paint(front ? '#88bbc3' : '#6f9ba3');
    const truss = P.paint(front ? '#5d8d97' : '#4f7881');
    const at = (r: number, a: number): Pt => [r * Math.cos(a), r * Math.sin(a)];
    let g = `<circle r="${r2(radius)}" fill="none" stroke="${steel}" stroke-width="${r2(1.3 * k)}"/><circle r="${r2(radius * .86)}" fill="none" stroke="${truss}" stroke-width="${r2(.7 * k)}"/>`;
    g += line(Array.from({ length: 25 }, (_, i) => at(i % 2 ? radius * .86 : radius, i * Math.PI / 12)), truss, .5 * k);
    g += `<path d="${Array.from({ length: 12 }, (_, i) => `M${pt(at(2.6 * k, (i + .5) * Math.PI / 6))}L${pt(at(radius * .86, (i + .5) * Math.PI / 6))}`).join('')}" stroke="${truss}" stroke-width="${r2(.55 * k)}"/>`;
    g += `<circle r="${r2(2.6 * k)}" fill="none" stroke="${steel}" stroke-width="${r2(.9 * k)}"/>`;
    if (front && P.lights) {
      // 外圈 36 盏灯分两组交替明暗
      const step = Math.PI * 2 * radius / 18;
      g += [0, 1].map(i => `<circle class="bulb${i}" r="${r2(radius)}" fill="none" stroke="${P.paint('#ffe3a3')}" stroke-width="${r2(1.5 * k)}" stroke-linecap="round" stroke-dasharray="0 ${r2(step)}" stroke-dashoffset="${r2(-i * step / 2)}"/>`).join('');
    }
    return g;
  };
  const [ax, ay] = [shifted(gap)[0] - hub[0], shifted(gap)[1] - hub[1]];
  const cabins = ['#c98d99', '#6aaab0', '#cba56c', '#9b93c9'];
  let pods = '';
  for (let i = 0; i < 12; i++) {
    const color = P.paint(cabins[i % 4]!);
    const pod = line([[-ax, -ay], [ax, ay]], P.paint('#8fa4ad'), .7 * k)
      + `<path d="M0 0V${r2(2.6 * k)}" stroke="${P.paint('#8fa4ad')}" stroke-width="${r2(.6 * k)}"/>`
      + `<path d="M${r2(-2.3 * k)} ${r2(2.6 * k)}Q0 ${r2(1.1 * k)} ${r2(2.3 * k)} ${r2(2.6 * k)}Z" fill="${shade(color, .75)}"/>`
      + `<rect x="${r2(-2.5 * k)}" y="${r2(2.5 * k)}" width="${r2(5 * k)}" height="${r2(3.6 * k)}" rx="${r2(.9 * k)}" fill="${color}"/>`
      + `<rect x="${r2(-1.8 * k)}" y="${r2(3.1 * k)}" width="${r2(3.6 * k)}" height="${r2(1.4 * k)}" rx="${r2(.4 * k)}" fill="${P.paint(P.lights ? '#ffe7b0' : '#33505c')}"/>`;
    const a = i * Math.PI / 6;
    pods += `<g transform="translate(${pt([radius * Math.cos(a), radius * Math.sin(a)])})"><g class="unwheel"><g transform="matrix(1 -.5 0 1 0 0)">${pod}</g></g></g>`;
  }
  const frame = (side: number): string => {
    const footV = hubV + side * .62;
    const top = shifted(side * (gap + .1));
    const [left, right] = [xy(hubU - 1.75, footV), xy(hubU + 1.75, footV)];
    const color = P.paint(side > 0 ? '#7b9ca2' : '#5e7c82');
    const brace = (f: number): Pt[] => [left, right].map(([x, y]): Pt => [x + (top[0] - x) * f, y + (top[1] - y) * f]);
    let s = line([left, top, right], color, (side > 0 ? 2.1 : 1.8) * k, ' stroke-linejoin="round"') + line(brace(.36), color, k) + line(brace(.66), color, .8 * k);
    for (const fu of [hubU - 1.75, hubU + 1.75]) s += block(iso, fu - .15, fu + .15, footV - .15, footV + .15, 0, 1.2 * k, P.paint('#566a6f'));
    return s;
  };
  let wheel = frame(-1);
  wheel += block(iso, hubU - .95, hubU + .95, hubV - .4, hubV + .4, 0, 2.8 * k, P.paint('#5e6e72'));
  wheel += line([xy(hubU - .95, hubV + .4, 2.8 * k), xy(hubU + .95, hubV + .4, 2.8 * k)], P.paint('#cfae5f'), .6 * k);
  wheel += block(iso, hubU - .32, hubU + .32, hubV + .4, hubV + .62, 0, 1.4 * k, P.paint('#728286'));
  wheel += block(iso, hubU + .5, hubU + .88, hubV - .3, hubV + .12, 2.8 * k, 3.4 * k, P.paint('#d2c6ae'));
  wheel += polygon([xy(hubU + .5, hubV + .121, 4.2 * k), xy(hubU + .88, hubV + .121, 4.2 * k), xy(hubU + .88, hubV + .121, 5.6 * k), xy(hubU + .5, hubV + .121, 5.6 * k)], P.paint(P.lights ? '#ffd9a0' : '#3d5661'));
  wheel += block(iso, hubU + .45, hubU + .93, hubV - .35, hubV + .17, 6.2 * k, .6 * k, P.paint(P.snow ? '#dbe5e9' : '#4a8590'));
  wheel += rotor(shifted(-gap), rim(false));
  wheel += line([shifted(-gap - .1), shifted(gap + .1)], P.paint('#a3bac1'), 2 * k);
  wheel += rotor(shifted(gap), rim(true));
  wheel += `<g transform="translate(${pt(hub)})"><g transform="matrix(1 .5 0 1 0 0)"><g class="wheel">${pods}</g></g></g>`;
  wheel += circle(shifted(gap + .1), 1.8 * k, P.paint('#c9dce2'));
  wheel += frame(1);
  const wheelReach: Pt[] = [-1, 1].flatMap(side => [xy(hubU - 1.9, hubV + side * .8), xy(hubU + 1.9, hubV + side * .8)]);
  for (let i = 0; i < 96; i++) {
    const [x, y] = around(i / 96);
    wheelReach.push(around(i / 96, -gap), around(i / 96, gap), [x - 2.9 * k, y - 1.5 * k], [x + 2.9 * k, y + 6.2 * k]);
  }
  svg += `<g data-ride="ferris-wheel" data-airspace="${bounds(wheelReach, 2 * k)}">${wheel}</g>`;

  // 过山车：站台直道接链条提升坡，坡顶转弯俯冲，越过一座驼峰后减速回站。双轨、枕木和下方的脊梁按轨道的三维走向偏移；
  // 立柱沿轨道等距排开，高处换成带斜撑的双柱。轨道按前后分段排序绘制，交叉处近处的一段盖住远处的一段。
  const knots = [
    [start + 7.9, -5.75, 5], [start + 6.9, -5.8, 4.5], [start + 6.15, -6.1, 4.8], [start + 6, -6.95, 9],
    [start + 6.35, -8.4, 38], [start + 7.4, -9.5, 46], [start + 9.6, -9.85, 44], [start + 11.35, -9, 14],
    [start + 11.4, -7.3, 5], [start + 10.2, -6.2, 26], [start + 9, -5.75, 12],
  ];
  const route = (f: number): [number, number, number] => {
    const at = f * knots.length;
    const i = Math.floor(at) % knots.length;
    const q = at - Math.floor(at);
    const p = [-1, 0, 1, 2].map(offset => knots[(i + offset + knots.length) % knots.length]!);
    return [0, 1, 2].map(axis => .5 * (2 * p[1]![axis]! + (-p[0]![axis]! + p[2]![axis]!) * q + (2 * p[0]![axis]! - 5 * p[1]![axis]! + 4 * p[2]![axis]! - p[3]![axis]!) * q * q + (-p[0]![axis]! + 3 * p[1]![axis]! - 3 * p[2]![axis]! + p[3]![axis]!) * q * q * q)) as [number, number, number];
  };
  const N = 128;
  const path = Array.from({ length: N + 1 }, (_, j) => route(j / N));
  const track = path.map(([u, v, z]) => xy(u, v, z * k));
  const lateral = path.map((_, j): Pt => {
    const [a, b] = [path[(j + N - 1) % N]!, path[(j + 1) % N]!];
    const n = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(a[1] - b[1]) / n, (b[0] - a[0]) / n];
  });
  const beside = (j: number, d: number, dz = 0): Pt => {
    const [u, v, z] = path[j]!;
    const [su, sv] = lateral[j]!;
    return xy(u + su * d, v + sv * d, z * k + dz);
  };
  const station = { u0: start + 6.7, u1: start + 8.1, v0: -6.22, v1: -5.3 };
  let coaster = '';
  for (const u of [station.u0, station.u1]) coaster += line([xy(u, station.v0), xy(u, station.v0, 10.8 * k)], P.paint('#5b7380'), .9 * k);
  const pieces: { depth: number; svg: string }[] = [];
  for (let c = 0; c < N; c += 8) {
    const ids = Array.from({ length: 9 }, (_, i) => c + i);
    const [su, sv, sz] = path[c + 4]!;
    let piece = '';
    if (!(su > station.u0 - .1 && su < station.u1 + .1 && sv > station.v0)) {
      const legs = sz > 16 ? [-.15, .15] : [0];
      let d = legs.map(s => `M${pt(beside(c + 4, s, -sz * k))}L${pt(beside(c + 4, s, -1.6 * k))}`).join('');
      if (legs.length > 1) for (let h = 1, i = 0; h + 5.5 < sz - 2; h += 5.5, i++) d += `M${pt(beside(c + 4, i % 2 ? .15 : -.15, (h - sz) * k))}L${pt(beside(c + 4, i % 2 ? -.15 : .15, (h + 5.5 - sz) * k))}`;
      piece += `<path d="${d}" stroke="${P.paint('#4b6476')}" stroke-width="${r2(.8 * k)}"/>`;
    }
    piece += line(ids.map(i => beside(i, 0, -1.2 * k)), P.paint('#2e4757'), 2.2 * k, ' stroke-linejoin="round"');
    piece += `<path d="${ids.filter(i => i % 2 === 0).map(i => `M${pt(beside(i, -.17))}L${pt(beside(i, .17))}`).join('')}" stroke="${P.paint('#4d6b7c')}" stroke-width="${r2(.6 * k)}"/>`;
    piece += `<path d="M${ids.map(i => pt(beside(i, -.12))).join('L')}M${ids.map(i => pt(beside(i, .12))).join('L')}" fill="none" stroke="${P.paint('#d69ca8')}" stroke-width="${r2(.7 * k)}" stroke-linejoin="round"/>`;
    pieces.push({ depth: ids.reduce((sum, i) => sum + path[i]![0] + path[i]![1], 0), svg: piece });
  }
  coaster += pieces.sort((a, b) => a.depth - b.depth).map(piece => piece.svg).join('');
  const lift = [Math.ceil(N * 3 / knots.length), Math.floor(N * 4 / knots.length)] as const;
  coaster += line(track.slice(lift[0], lift[1] + 1), P.paint('#9fb1bb'), .8 * k, ` stroke-dasharray="${r2(k)} ${r2(1.2 * k)}" class="chain"`);
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
  const train = ['#d4697a', '#dba552', '#57a6b0'];
  for (let i = 0; i < 3; i++) {
    const color = P.paint(train[i]!);
    let car = `<rect x="${r2(-2.9 * k)}" y="${r2(-1.2 * k)}" width="${r2(5.8 * k)}" height="${r2(1.2 * k)}" fill="${P.paint('#27333e')}"/>`;
    car += `<rect x="${r2(-2.9 * k)}" y="${r2(-3.6 * k)}" width="${r2(5.8 * k)}" height="${r2(2.8 * k)}" rx="${r2(.8 * k)}" fill="${color}"/>`;
    car += `<path d="M${r2(-2.3 * k)} ${r2(-2.9 * k)}H${r2(2.3 * k)}" stroke="${P.lights ? P.paint('#f3e1b4') : shade(color, .72)}" stroke-width="${r2(.7 * k)}"/>`;
    car += [-1.3, 1.1].map(x => `<circle cx="${r2(x * k)}" cy="${r2(-4.2 * k)}" r="${r2(.7 * k)}" fill="${P.paint('#e2c2a4')}"/>`).join('');
    if (i === 0) {
      car += `<path d="M${r2(2.9 * k)} ${r2(-3.5 * k)}Q${r2(4.6 * k)} ${r2(-3.2 * k)} ${r2(4.4 * k)} ${r2(-.9 * k)}H${r2(2.9 * k)}Z" fill="${color}"/>`;
      if (P.lights) car += `<circle cx="${r2(4 * k)}" cy="${r2(-1.9 * k)}" r="${r2(.55 * k)}" fill="#fff4d6"/>`;
    }
    const shift = -i * 7 * k / total;
    let previous = sample(shift).angle;
    const flips: number[] = [];
    const frames = Array.from({ length: 129 }, (_, j) => {
      const point = sample(j / 128 + shift);
      let angle = point.angle;
      while (angle - previous > 180) angle -= 360;
      while (angle - previous < -180) angle += 360;
      previous = angle;
      flips.push(Math.cos(angle * Math.PI / 180) < 0 ? -1 : 1);
      return `${j * 100 / 128}%{transform:translate(${r2(point.p[0])}px,${r2(point.p[1])}px) rotate(${r2(angle)}deg)}`;
    });
    // 车往画面左边开时把车身上下翻过来，乘客始终在上面；方向越过竖直的那一帧里完成翻转。
    const turns = flips.flatMap((s, j) => j === 0 || j === 128 || s !== flips[j - 1] || s !== flips[j + 1] ? [`${r2(j * 100 / 128)}%{transform:scale(1,${s})}`] : []);
    css.push(`@keyframes zcoaster${i}{${frames.join('')}}\n.coaster${i}{animation:zcoaster${i} 18s linear infinite}\n@keyframes zflip${i}{${turns.join('')}}\n.flip${i}{animation:zflip${i} 18s linear infinite}`);
    const initial = sample(shift);
    coaster += `<g class="coaster${i}" transform="translate(${pt(initial.p)}) rotate(${r2(initial.angle)})"><g class="flip${i}" transform="scale(1 ${flips[0]})">${car}</g></g>`;
  }
  // 站台在轨道朝外的一侧，顶棚盖在列车上方，列车从棚下穿过。
  coaster += block(iso, station.u0 + .05, station.u1 - .05, -5.56, -5.32, 0, 2.6 * k, P.paint('#5d6e7a'));
  coaster += line([xy(station.u0 + .05, -5.56, 2.6 * k), xy(station.u1 - .05, -5.56, 2.6 * k)], P.paint('#d9b65e'), .6 * k);
  for (const u of [station.u0, station.u1]) coaster += line([xy(u, station.v1), xy(u, station.v1, 10.8 * k)], P.paint('#6f8994'), .9 * k);
  if (P.lights) coaster += circle(xy((station.u0 + station.u1) / 2, -5.75, 8 * k), 8 * k, 'url(#lampglow)');
  const shelter: Pt[] = [[station.u0 - .1, station.v0 - .1], [station.u1 + .1, station.v0 - .1], [station.u1 + .1, station.v1 + .06], [station.u0 - .1, station.v1 + .06]];
  coaster += prism(iso, shelter, 10.8 * k, 1.1 * k, P.paint('#3a7480'), P.paint(P.snow ? '#dbe6ea' : '#4b8b96'));
  coaster += line([xy(station.u0 - .1, station.v1 + .06, 11.35 * k), xy(station.u1 + .1, station.v1 + .06, 11.35 * k)], P.paint('#e0c46c'), .5 * k);
  const coasterReach = [...track, ...path.map(([u, v]) => xy(u, v)), ...shelter.map(p => xy(...p, 11.9 * k))];
  svg += `<g data-ride="roller-coaster" data-airspace="${bounds(coasterReach, 7 * k)}">${coaster}</g>`;

  // 旋转木马：条纹尖顶篷、金色中柱、一圈上下起伏的木马。木马在地面平面里绕中柱公转，再逐个反向自转，始终直立；
  // 后半圈的木马自然藏在篷子后面。
  const [cu, cv] = [start + 1, -6.25];
  svg += prism(iso, ring(cu, cv, .78, 16), 0, 1.4 * k, P.paint('#6c5752'), P.paint(P.snow ? '#d9e3e7' : '#8a7064'));
  if (P.lights) svg += circle(xy(cu, cv, 6 * k), 10 * k, 'url(#lampglow)');
  svg += line([xy(cu, cv, 1.4 * k), xy(cu, cv, 12 * k)], P.paint('#c9ab6b'), 2.2 * k);
  const ponies = ['#efe3cf', '#e9a9b5', '#a7cde4', '#e6c37d'];
  let riders = '';
  for (let i = 0; i < 8; i++) {
    const color = P.paint(ponies[i % 4]!);
    const pony = `<path d="M0 0V${r2(-10.6 * k)}" stroke="${P.paint('#d4b876')}" stroke-width="${r2(.5 * k)}"/><g class="gallop${i % 2}">`
      + `<rect x="${r2(-1.6 * k)}" y="${r2(-5 * k)}" width="${r2(3 * k)}" height="${r2(1.4 * k)}" rx="${r2(.6 * k)}" fill="${color}"/>`
      + `<path d="M${r2(.8 * k)} ${r2(-4.8 * k)}L${r2(1.8 * k)} ${r2(-6.7 * k)}L${r2(2.6 * k)} ${r2(-6.2 * k)}L${r2(1.7 * k)} ${r2(-4.4 * k)}Z" fill="${color}"/>`
      + `<path d="M${r2(-k)} ${r2(-3.8 * k)}L${r2(-1.5 * k)} ${r2(-2.5 * k)}M${r2(.8 * k)} ${r2(-3.8 * k)}L${r2(1.3 * k)} ${r2(-2.5 * k)}" stroke="${color}" stroke-width="${r2(.5 * k)}"/></g>`;
    const a = i * Math.PI / 4;
    riders += `<g transform="translate(${pt([.56 * unit * Math.cos(a), .56 * unit * Math.sin(a)])})"><g class="rider"><g transform="matrix(.5 -.5 1 1 0 0)">${pony}</g></g></g>`;
  }
  svg += `<g transform="translate(${pt(xy(cu, cv, 1.4 * k))})"><g transform="matrix(1 .5 -1 .5 0 0)"><g class="carousel">${riders}</g></g></g>`;
  const peak = xy(cu, cv, 20.5 * k);
  const brim = (a: number, z: number): Pt => xy(cu + .95 * Math.cos(a), cv + .95 * Math.sin(a), z * k);
  svg += cone(16, peak, a => brim(a, 12), (P.snow ? ['#e6edf0', '#cad7dc'] : ['#c95f6d', '#efe1c6']).map(c => P.paint(c)), .2);
  let valance = `M${pt(brim(-Math.PI / 4, 12))}`;
  for (let i = -1; i <= 6; i++) valance += `L${pt(brim(i * Math.PI / 8, 12))}`;
  valance += `L${pt(brim(6 * Math.PI / 8, 11.2))}`;
  for (let i = 6; i > -2; i--) valance += `Q${pt(brim((i - .5) * Math.PI / 8, 9.8))} ${pt(brim((i - 1) * Math.PI / 8, 11.2))}`;
  svg += `<path d="${valance}Z" fill="${P.paint('#d8b45e')}"/>`;
  if (P.lights) for (let i = 6; i > -2; i--) svg += circle(brim((i - .5) * Math.PI / 8, 10.5), .5 * k, P.paint('#ffe6a8'), ` class="bulb${(i + 2) % 2}"`);
  svg += line([peak, [peak[0], peak[1] - 3.2 * k]], P.paint('#c9ab6b'), .6 * k);
  svg += polygon([[peak[0], peak[1] - 3.2 * k], [peak[0] + 2.8 * k, peak[1] - 2.6 * k], [peak[0], peak[1] - 1.9 * k]], P.paint('#e0606f'));

  // 广场前沿一排条纹遮阳篷的小卖亭、气球摊和路灯
  for (const [u0, awning, roof] of [[start + 2.2, ['#d0616d', '#f0e6d2'], '#9a5b55'], [start + 3.25, ['#3f98a1', '#f0e6d2'], '#3f7f86']] as [number, string[], string][]) {
    const [u1, v0, v1] = [u0 + .62, -6.02, -5.6];
    svg += block(iso, u0, u1, v0, v1, 0, 4.3 * k, P.paint('#cbbda0'));
    svg += polygon([xy(u0 + .1, v1, 1.7 * k), xy(u1 - .1, v1, 1.7 * k), xy(u1 - .1, v1, 3.3 * k), xy(u0 + .1, v1, 3.3 * k)], P.paint(P.lights ? '#ffd9a0' : '#3d5661'));
    svg += polygon([xy(u0 - .06, v0 - .06, 4.3 * k), xy(u1 + .06, v0 - .06, 4.3 * k), xy(u1 + .06, v1, 4.3 * k), xy(u0 - .06, v1, 4.3 * k)], P.paint(P.snow ? '#dbe5e9' : roof));
    for (let i = 0; i < 4; i++) {
      const [a, b] = [u0 - .06 + i * (u1 - u0 + .12) / 4, u0 - .06 + (i + 1) * (u1 - u0 + .12) / 4];
      svg += polygon([xy(a, v1, 4.3 * k), xy(b, v1, 4.3 * k), xy(b, v1 + .3, 3.1 * k), xy(a, v1 + .3, 3.1 * k)], P.paint(P.snow ? '#e3ebee' : awning[i % 2]!));
    }
  }
  const [bu, bv] = [start + 4.6, -5.82];
  svg += block(iso, bu - .16, bu + .16, bv - .12, bv + .12, 0, 1.8 * k, P.paint('#8b6f5c'));
  const hand = xy(bu, bv, 2.2 * k);
  for (const [dx, dz, color] of [[-1.7, 9.6, '#ef8098'], [.4, 11.2, '#f5c26b'], [1.9, 9.2, '#7fd0dc'], [-.3, 8.2, '#b59ae8']] as [number, number, string][]) {
    const at: Pt = [hand[0] + dx * k, hand[1] - dz * k];
    svg += line([hand, [at[0], at[1] + 1.3 * k]], P.paint('#9aa7b0'), .35 * k) + circle(at, 1.35 * k, P.paint(color)) + circle([at[0] - .4 * k, at[1] - .45 * k], .4 * k, '#ffffff', ' fill-opacity=".45"');
  }
  for (const u of [start + .3, start + 3.04, start + 4.1, start + 5.6, end + 1.3]) {
    const head = xy(u, -5.45, 6.4 * k);
    svg += line([xy(u, -5.45), head], P.paint('#58707a'), .7 * k);
    if (P.lights) svg += circle(head, 5.5 * k, 'url(#lampglow)');
    svg += circle(head, k, P.lights ? t.land.lamp : P.paint('#93a5ae'));
  }

  // 右侧一直到边框是入口广场和服务区：后面一座水塔和两棵树；游客中心开着落地窗，门口搭条纹雨篷、两边是花坛，屋顶立着摩天轮标志；
  // 广场前沿是带售票窗的入口拱门，左边摆两张遮阳伞餐桌。这些都比摩天轮和过山车矮得多，不占飞机的航路。
  const [wu, wv] = [end + .75, -9.6];
  const leg = (corner: readonly [number, number], z: number): Pt => xy(wu + corner[0] * (.32 - z / 150), wv + corner[1] * (.32 - z / 150), z * k);
  let tower = '';
  for (const corner of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) tower += `M${pt(leg(corner, 0))}L${pt(leg(corner, 18))}`;
  for (const [a, b] of [[[1, -1], [1, 1]], [[-1, 1], [1, 1]]] as const) for (const z of [0, 6, 12]) tower += `M${pt(leg(a, z))}L${pt(leg(b, z + 6))}M${pt(leg(b, z))}L${pt(leg(a, z + 6))}`;
  svg += `<path d="${tower}" stroke="${P.paint('#5e7c82')}" stroke-width="${r2(.75 * k)}"/>`;
  svg += prism(iso, ring(wu, wv, .42, 12), 18 * k, 7 * k, P.paint('#78aab0'), P.paint(P.snow ? '#e0e9ec' : '#8fbcc1'));
  svg += line([-3, -2, -1, 0, 1, 2, 3].map(i => xy(wu + .425 * Math.cos((i + 1.5) * Math.PI / 6), wv + .425 * Math.sin((i + 1.5) * Math.PI / 6), 21.4 * k)), P.paint('#c95f6d'), 1.4 * k);
  svg += cone(12, xy(wu, wv, 28.6 * k), a => xy(wu + .47 * Math.cos(a), wv + .47 * Math.sin(a), 25 * k), [P.paint(P.snow ? '#e3ebee' : '#3a7480')], .2);
  svg += circle(xy(wu, wv, 29.3 * k), .8 * k, t.city.beacon, ' class="beacon"');
  for (const [u, v, s] of [[end + .2, -8.75, .95], [end + 1.95, -9.05, .85]]) svg += tree(u!, v!, s!);
  const [g0, g1, h0, h1] = [end + .6, end + 2.3, -8.4, -7.25];
  const door = (g0 + g1) / 2;
  const glass = P.paint(P.lights ? '#ffd9a0' : '#3d5661');
  svg += block(iso, g0, g1, h0, h1, 0, 6 * k, P.paint('#d2c6ae'));
  svg += polygon([xy(g0 + .12, h1, 1.4 * k), xy(g1 - .12, h1, 1.4 * k), xy(g1 - .12, h1, 4.6 * k), xy(g0 + .12, h1, 4.6 * k)], glass);
  for (const v of [h0 + .2, h0 + .62]) svg += polygon([xy(g1, v, 2.2 * k), xy(g1, v + .26, 2.2 * k), xy(g1, v + .26, 4.4 * k), xy(g1, v, 4.4 * k)], glass);
  let mullions = '';
  for (let u = g0 + .4; u < g1 - .2; u += .28) mullions += `M${pt(xy(u, h1, 1.4 * k))}L${pt(xy(u, h1, 4.6 * k))}`;
  svg += `<path d="${mullions}" stroke="${P.paint('#8c7f6c')}" stroke-width="${r2(.45 * k)}"/>`;
  svg += polygon([xy(door - .16, h1, 0), xy(door + .16, h1, 0), xy(door + .16, h1, 3.8 * k), xy(door - .16, h1, 3.8 * k)], P.paint(P.lights ? '#ffe7b0' : '#2c4651'));
  for (let i = 0; i < 4; i++) {
    const [a, b] = [door - .3 + i * .15, door - .15 + i * .15];
    svg += polygon([xy(a, h1, 5 * k), xy(b, h1, 5 * k), xy(b, h1 + .28, 4 * k), xy(a, h1 + .28, 4 * k)], P.paint(P.snow ? '#e3ebee' : ['#d0616d', '#f0e6d2'][i % 2]!));
  }
  svg += prism(iso, [[g0 - .06, h0 - .06], [g1 + .06, h0 - .06], [g1 + .06, h1 + .08], [g0 - .06, h1 + .08]], 6 * k, .7 * k, P.paint('#3f7f86'), P.paint(P.snow ? '#dbe5e9' : '#4b8b96'));
  const [s0, s1] = [g0 + .35, g0 + 1.15];
  svg += polygon([xy(s0, h1 - .05, 6.7 * k), xy(s1, h1 - .05, 6.7 * k), xy(s1, h1 - .05, 9.8 * k), xy(s0, h1 - .05, 9.8 * k)], P.paint('#24414b'));
  const logo = xy((s0 + s1) / 2, h1 - .05, 8.4 * k);
  const neon = P.lights ? '#ffd59a' : P.paint('#c9dce2');
  svg += circle(logo, .9 * k, 'none', ` stroke="${neon}" stroke-width="${r2(.4 * k)}"`);
  svg += `<path d="M${pt([logo[0] - .9 * k, logo[1]])}L${pt([logo[0] + .9 * k, logo[1]])}M${pt([logo[0], logo[1] - .9 * k])}L${pt([logo[0], logo[1] + .9 * k])}M${pt([logo[0] - .7 * k, logo[1] + 1.4 * k])}L${pt(logo)}L${pt([logo[0] + .7 * k, logo[1] + 1.4 * k])}" fill="none" stroke="${neon}" stroke-width="${r2(.35 * k)}"/>`;
  for (const [a, b] of [[g0 + .08, door - .28], [door + .28, g1 - .08]]) {
    svg += prism(iso, [[a!, h1 + .02], [b!, h1 + .02], [b!, h1 + .17], [a!, h1 + .17]], 0, .7 * k, P.paint('#5d4c43'), P.paint(P.snow ? '#dfe7ea' : '#3f6b4e'));
    if (!P.snow) [.2, .5, .8].forEach((f, i) => { svg += circle(xy(a! + (b! - a!) * f, h1 + .1, k), .5 * k, P.paint(t.land.flowers[(i + (a! > door ? 2 : 0)) % t.land.flowers.length]!, .5)); });
  }
  for (const [uu, uv, cloth] of [[end + .75, -6.5, '#d0616d'], [end + 1.6, -6.12, '#3f98a1']] as [number, number, string][]) {
    svg += line([xy(uu, uv), xy(uu, uv, 5.8 * k)], P.paint('#8a9aa3'), .45 * k);
    svg += prism(iso, ring(uu, uv, .17, 8), 1.5 * k, .35 * k, P.paint('#7a5b48'));
    svg += cone(8, xy(uu, uv, 5.9 * k), a => xy(uu + .34 * Math.cos(a), uv + .34 * Math.sin(a), 4.8 * k), (P.snow ? ['#e3ebee'] : [cloth, '#f0e6d2']).map(c => P.paint(c)), .18);
  }
  const [gv0, gv1] = [-5.78, -5.45];
  for (const u0 of [end + 3, end + 4.84]) {
    svg += block(iso, u0, u0 + .36, gv0, gv1, 0, 12 * k, P.paint('#3f8691'));
    svg += polygon([xy(u0 + .07, gv1, 2.4 * k), xy(u0 + .29, gv1, 2.4 * k), xy(u0 + .29, gv1, 4.8 * k), xy(u0 + .07, gv1, 4.8 * k)], P.paint(P.lights ? '#ffd9a0' : '#2f4d5a'));
    svg += block(iso, u0 - .05, u0 + .41, gv0 - .05, gv1 + .05, 12 * k, .9 * k, P.paint('#d8b45e'));
  }
  // 两根柱子之间拱起一块招牌，夜里下沿一排灯交替明暗；柱顶和拱顶各插一面彩旗。
  const arch = (f: number, z: number): Pt => xy(end + 3.18 + 1.84 * f, gv1 + .06, (z + 7.2 * f * (1 - f)) * k);
  const span = Array.from({ length: 9 }, (_, i) => i / 8);
  const band = (z0: number, z1: number): Pt[] => [...span.map(f => arch(f, z0)), ...span.map(f => arch(f, z1)).reverse()];
  svg += polygon(band(9, 11.9), P.paint('#c95f6d')) + polygon(band(10.1, 10.8), P.paint('#efe1c6'));
  if (P.lights) span.slice(1, -1).forEach((f, i) => { svg += circle(arch(f, 9.4), .45 * k, P.paint('#ffe6a8'), ` class="bulb${i % 2}"`); });
  for (const [f, color] of [[0, '#f5c26b'], [.5, '#e0606f'], [1, '#7fd0dc']] as [number, string][]) {
    const base = f === .5 ? arch(f, 11.9) : xy(end + 3.18 + 1.84 * f, (gv0 + gv1) / 2, 12.9 * k);
    svg += line([base, [base[0], base[1] - 3.4 * k]], P.paint('#c9ab6b'), .45 * k);
    svg += polygon([[base[0], base[1] - 3.4 * k], [base[0] + 2.4 * k, base[1] - 2.8 * k], [base[0], base[1] - 2.2 * k]], P.paint(color));
  }
  return { svg: `<g data-landmark="amusement-park">${svg}</g>`, css: css.join('\n') };
}

export function landmarks(iso: Iso, P: Painter): { far: string; restaurantGround: string; restaurant: string; restaurantFront: string; pavilionGround: string; pavilion: string; css: string } {
  const park = amusement(iso, P);
  const shelter = pavilion(iso, P);
  const diner = restaurant(iso, P);
  return { far: park.svg, restaurantGround: diner.ground, restaurant: diner.rear, restaurantFront: diner.front, pavilionGround: shelter.ground, pavilion: shelter.building, css: park.css };
}
