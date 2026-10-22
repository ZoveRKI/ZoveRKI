// SVG 用到的小工具：转义、等宽字体的宽度估算、折行、颜色和日期计算

/** JetBrains Mono 每个字符的宽度是字号的 0.6 倍 */
export const ADVANCE = 0.6;

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"' };

export function esc(s: string | number): string {
  return (
    String(s)
      // XML 里不允许出现控制字符
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
      .replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c)
  );
}

/** 一段 SVG 标记里实际显示的文字，用来决定字体子集要包含哪些字符 */
export function visibleText(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&(amp|lt|gt|quot);/g, (_, n: string) => NAMED[n] ?? '');
}

/** 动画延迟，写在元素的 style 属性里 */
export const delay = (s: number): string => `style="animation-delay:${s.toFixed(2)}s"`;

/** 中日韩等全角字符 */
const CJK = '\\u1100-\\u115f\\u2e80-\\ua4cf\\uac00-\\ud7a3\\uf900-\\ufaff\\ufe30-\\ufe4f\\uff00-\\uff60\\uffe0-\\uffe6';
const WIDE = new RegExp(`^[${CJK}]$`);
const TOKENS = new RegExp(`\\s+|[${CJK}]|[^\\s${CJK}]+`, 'g');

/** 估算文字宽度（px）：全角字符占一个字号，其余按等宽字体算 */
export function textWidth(s: string, size: number): number {
  let em = 0;
  for (const c of s) em += WIDE.test(c) || c.codePointAt(0)! > 0xffff ? 1 : ADVANCE;
  return em * size;
}

/** 按宽度折行：优先在空格处断开，中日韩文字逐字断开，比一整行还长的单词硬切 */
export function wrap(s: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  const flush = () => {
    if (line.trim()) lines.push(line.trim());
    line = '';
  };
  for (const tok of s.trim().match(TOKENS) ?? []) {
    if (!tok.trim()) {
      if (line) line += ' ';
      continue;
    }
    if (textWidth(line + tok, size) <= maxWidth) {
      line += tok;
      continue;
    }
    flush();
    let rest = tok;
    while (textWidth(rest, size) > maxWidth) {
      let cut = '';
      for (const c of rest) {
        if (textWidth(cut + c, size) > maxWidth) break;
        cut += c;
      }
      if (!cut) break;
      lines.push(cut);
      rest = rest.slice(cut.length);
    }
    line = rest;
  }
  flush();
  return lines;
}

/** 超出宽度时截断，末尾加省略号 */
export function truncate(s: string, size: number, maxWidth: number): string {
  if (textWidth(s, size) <= maxWidth) return s;
  let out = '';
  for (const c of s) {
    if (textWidth(`${out}${c}…`, size) > maxWidth) break;
    out += c;
  }
  return `${out.trimEnd()}…`;
}

/** 坐标保留两位小数，生成的文件小一些 */
export const r2 = (n: number): number => Math.round(n * 100) / 100;

/** 由字符串决定的伪随机数（0 到 1）：种子相同，每次生成的序列都一样，画出来的图也就不变 */
export function random(seed: string): () => number {
  // 用 FNV-1a 把字符串散列成种子，再用 mulberry32 生成
  let s = 2166136261;
  for (const c of seed) s = Math.imul(s ^ c.charCodeAt(0), 16777619);
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export const num = (n: number): string => n.toLocaleString('en-US');

/** 1 day、2 days */
export const plural = (n: number, word: string): string => `${num(n)} ${word}${n === 1 ? '' : 's'}`;

function rgb(c: string): number[] {
  const h = c.length === 4 ? [...c.slice(1)].map((x) => x + x).join('') : c.slice(1);
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hex(v: number[]): string {
  return `#${v.map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0')).join('')}`;
}

/** 按比例调暗颜色（f < 1） */
export const shade = (c: string, f: number): string => hex(rgb(c).map((x) => x * f));

/** 两种颜色按 t 混合，t = 0 时是 a，t = 1 时是 b */
export function mix(a: string, b: string, t: number): string {
  const y = rgb(b);
  return hex(rgb(a).map((x, i) => x + ((y[i] ?? x) - x) * t));
}

/** 深色背景上太暗的颜色（比如某些语言的官方配色）调亮一些 */
export function readable(c: string): string {
  const [r = 0, g = 0, b = 0] = rgb(c).map((x) => {
    const s = x / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.09 ? mix(c, '#ffffff', 0.35) : c;
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const DAY_MS = 86_400_000;
const utc = (d: string): number => Date.parse(`${d}T00:00:00Z`);

export const daysBetween = (a: string, b: string): number => Math.round((utc(b) - utc(a)) / DAY_MS);

/** 星期几，0 是周日 */
export const weekday = (d: string): number => new Date(utc(d)).getUTCDay();

/** 2026-10-02 → Oct 2 */
export function monthDay(d: string): string {
  const [, m = 1, day = 1] = d.split('-').map(Number);
  return `${MONTHS[m - 1]} ${day}`;
}
