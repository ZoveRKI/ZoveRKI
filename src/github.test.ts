import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCalendarHtml } from './github.ts';

test('从贡献日历页面解析出每天的贡献数', () => {
  const counts = ['1,204 contributions', 'No contributions', '1 contribution', '7 contributions', 'No contributions'];
  const cells = counts.map(
    (_, i) =>
      `<td tabindex="0" data-ix="${i}" style="width: 10px" data-date="2026-01-0${i + 1}" id="contribution-day-component-${i}-0" data-level="${i % 5}" role="gridcell" class="ContributionCalendar-day"></td>`,
  );
  const tips = counts.map(
    (text, i) =>
      `<tool-tip id="tooltip-${i}" for="contribution-day-component-${i}-0" popover="manual" class="sr-only">${text} on January ${i + 1}st.</tool-tip>`,
  );
  // 日历之外的格子（图例）没有 data-date，要跳过
  const legend = '<td class="ContributionCalendar-day" id="legend-level-0" data-level="0"></td>';
  const html = `<table>${legend}${cells.slice(0, 3).join('')}<td class="ContributionCalendar-day" data-date="2026-01-06" id="contribution-day-component-5-0" data-level="0"></td><td class="ContributionCalendar-day" data-date="2026-01-07" id="contribution-day-component-6-0" data-level="0"></td>${cells.slice(3).join('')}</table>${tips.join('\n')}`;

  const cal = parseCalendarHtml(html);
  assert.equal(cal.days.length, 7);
  assert.deepEqual(
    cal.days.map((d) => [d.date, d.count, d.level]),
    [
      ['2026-01-01', 1204, 0],
      ['2026-01-02', 0, 1],
      ['2026-01-03', 1, 2],
      ['2026-01-04', 7, 3],
      ['2026-01-05', 0, 4],
      ['2026-01-06', 0, 0],
      ['2026-01-07', 0, 0],
    ],
  );
  assert.equal(cal.total, 1212);
});

test('页面格式变了时报错，不写入空日历', () => {
  assert.throws(() => parseCalendarHtml('<html><body>nothing here</body></html>'));
});
