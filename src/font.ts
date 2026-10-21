// 字体：每张 SVG 只带上自己用到的字符，从 JetBrains Mono 截出子集后以 base64 内嵌。
// README 里的 SVG 不能加载外部资源，内嵌字体才能在各个平台上显示一致。
import { readFile } from 'node:fs/promises';
import subsetFont from 'subset-font';

const DIR = new URL('../node_modules/@fontsource/jetbrains-mono/files/', import.meta.url);

/** @fontsource 的 latin 子集覆盖的字符；超出范围的字符由访客系统里的字体显示 */
const COVERED =
  /^[ -~ -ÿıŒœʻʼˆ˚˜̩̄̈ -⁯€™↑↓−∕﻿�]$/;

/** 字体覆盖不到的字符，渲染结束时提示一次 */
export const uncovered = new Set<string>();

const files = new Map<number, Promise<Buffer>>();
const faces = new Map<string, Promise<string>>();

function face(weight: number, chars: string): Promise<string> {
  const key = `${weight}:${chars}`;
  let css = faces.get(key);
  if (!css) {
    css = (async () => {
      let file = files.get(weight);
      if (!file) {
        file = readFile(new URL(`jetbrains-mono-latin-${weight}-normal.woff2`, DIR));
        files.set(weight, file);
      }
      // 去掉连字等排版特性和 hinting：等宽排版用不到，文件也更小
      const subset = await subsetFont(await file, chars, {
        targetFormat: 'woff2',
        keepFeatures: [],
        noHinting: true,
      });
      return `@font-face{font-family:ZMono;font-weight:${weight};src:url(data:font/woff2;base64,${subset.toString('base64')}) format('woff2')}`;
    })();
    faces.set(key, css);
  }
  return css;
}

/** 生成 @font-face 规则：常规字重总是带上，用到粗体时再带上粗体 */
export async function fontFaces(text: string, bold: boolean): Promise<string> {
  const chars = new Set([' ', ...'0123456789']);
  for (const c of text) {
    if (c < ' ') continue;
    if (COVERED.test(c)) chars.add(c);
    else uncovered.add(c);
  }
  const list = [...chars].sort().join('');
  const weights = bold ? [400, 700] : [400];
  return (await Promise.all(weights.map((w) => face(w, list)))).join('\n');
}
