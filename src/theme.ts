// 配色和尺寸。桌面版切片宽 880px；手机版宽 440px，GitHub 页面窄于 600px 时由 <picture> 换上。

export const theme = {
  /** 窗口背景 */
  bg: '#0a0f17',
  /** 没有贡献的格子、进度条的底槽 */
  panel: '#131c2a',
  /** 分隔线、刻度 */
  line: '#1e2a3b',
  /** 比分隔线亮一些的线，比如十字图的坐标轴 */
  border: '#2a3950',
  fg: '#d3dbe8',
  dim: '#8494aa',
  faint: '#56647a',
  bright: '#f4f7fd',
  accent: '#5aaeff',
  accent2: '#b48cff',
  green: '#4fd69c',
  yellow: '#f5c26b',
  red: '#ff6b81',
  cyan: '#4fd8eb',
  /** 贡献等级 1–4 的楼顶颜色 */
  levels: ['#1c3b6c', '#2962b6', '#3f8fef', '#8ccbff'],
} as const;

/** 背景网格的格子大小。切片的高度都是它的倍数，网格才能在上下切片之间对齐 */
export const UNIT = 40;

/** 向上取整到 UNIT 的倍数 */
export const up = (v: number): number => Math.ceil(v / UNIT) * UNIT;

/** 一种版式（桌面或手机）的尺寸 */
export type Geo = {
  phone: boolean;
  /** 图片宽度 */
  w: number;
  /** 窗口外留给光晕的透明边距 */
  m: number;
  /** 窗口左右边框的位置 */
  x0: number;
  x1: number;
  /** 正文的左右边界 */
  left: number;
  right: number;
  /** 正文字号和小字号 */
  fs: number;
  small: number;
  /** 头部状态栏的高度 */
  bar: number;
  /** 四个角外侧折角的外伸距离和边长 */
  corner: [out: number, len: number];
  /** 板块正文开始的位置（在开头的命令行和虚线下面） */
  top: number;
};

export const DESKTOP: Geo = {
  phone: false,
  w: 880,
  m: 16,
  x0: 16,
  x1: 864,
  left: 48,
  right: 832,
  fs: 15,
  small: 13,
  bar: 34,
  corner: [7, 18],
  top: 84,
};

export const PHONE: Geo = {
  phone: true,
  w: 440,
  m: 8,
  x0: 8,
  x1: 432,
  left: 24,
  right: 416,
  fs: 14,
  small: 12,
  bar: 30,
  corner: [5, 13],
  top: 76,
};
