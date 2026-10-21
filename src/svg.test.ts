import assert from 'node:assert/strict';
import { test } from 'node:test';
import { esc, textWidth, truncate, visibleText, wrap } from './svg.ts';

test('esc 转义 XML 特殊字符并去掉控制字符', () => {
  assert.equal(esc(`a<b>&"c"'\u0001`), 'a&lt;b&gt;&amp;&quot;c&quot;&#39;');
});

test('visibleText 去掉标签并还原转义', () => {
  assert.equal(visibleText('<text x="1">a &amp; b &lt;c&gt;</text><tspan>&#39;d</tspan>'), "a & b <c>'d");
});

test('textWidth 按等宽字体算，全角字符按一个字号算', () => {
  assert.equal(textWidth('abcd', 10), 24);
  assert.equal(textWidth('中文', 10), 20);
});

test('wrap 优先在空格处折行，过长的单词硬切', () => {
  // 字号 10 时每个字符 6px，60px 一行正好 10 个字符
  assert.deepEqual(wrap('one two three four', 10, 60), ['one two', 'three four']);
  assert.deepEqual(wrap('abcdefghijklmno', 10, 60), ['abcdefghij', 'klmno']);
  assert.deepEqual(wrap('中文折行测试一下', 10, 60), ['中文折行测试', '一下']);
});

test('truncate 超出宽度时截断并加省略号', () => {
  assert.equal(truncate('short', 10, 60), 'short');
  // 省略号也占一个字符，加上它正好 10 个字符
  assert.equal(truncate('a very long name', 10, 60), 'a very lo…');
});
