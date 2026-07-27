import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import { chartAxisColor, chartSeriesColor, chartTextColor, semanticColor } from '@/components/chart';

export function lineOption(
  name: string,
  points: Array<[number, number]>,
  colorIdx: number,
  thresholds?: { warn: number; danger: number },
): EChartsOption {
  const color = chartSeriesColor(colorIdx);
  return {
    grid: { left: 44, right: 16, top: 24, bottom: 28 },
    tooltip: { trigger: 'axis', backgroundColor: 'var(--surface-2)', borderColor: 'var(--border)', textStyle: { color: 'var(--fg)' } },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: chartAxisColor() } },
      axisLabel: { color: chartTextColor(), fontSize: 11 },
      axisTick: { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      max: thresholds ? 100 : undefined,
      axisLabel: { color: chartTextColor(), fontSize: 11 },
      splitLine: { lineStyle: { color: chartAxisColor() } },
    },
    series: [
      {
        name,
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: points,
        lineStyle: { width: 1.75, color },
        itemStyle: { color },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: `rgba(${hex(color)},0.26)` },
            { offset: 1, color: `rgba(${hex(color)},0)` },
          ]),
        },
        markLine: thresholds
          ? {
              silent: true,
              symbol: 'none',
              data: [
                { yAxis: thresholds.warn, lineStyle: { color: semanticColor('warn'), type: 'dashed', width: 1 }, label: { color: chartTextColor(), formatter: '警告' } },
                { yAxis: thresholds.danger, lineStyle: { color: semanticColor('danger'), type: 'dashed', width: 1 }, label: { color: chartTextColor(), formatter: '严重' } },
              ],
            }
          : undefined,
      },
    ],
  };
}

export function barOption(name: string, points: Array<[number, number]>, colorIdx: number): EChartsOption {
  const color = chartSeriesColor(colorIdx);
  return {
    grid: { left: 44, right: 16, top: 24, bottom: 28 },
    tooltip: { trigger: 'axis', backgroundColor: 'var(--surface-2)', borderColor: 'var(--border)', textStyle: { color: 'var(--fg)' } },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: chartAxisColor() } },
      axisLabel: { color: chartTextColor(), fontSize: 11 },
    },
    yAxis: { type: 'value', axisLabel: { color: chartTextColor(), fontSize: 11 }, splitLine: { lineStyle: { color: chartAxisColor() } } },
    series: [
      {
        name,
        type: 'bar',
        data: points,
        itemStyle: { color, borderRadius: [3, 3, 0, 0] },
        barWidth: '55%',
      },
    ],
  };
}

export function gaugeOption(value: number, name: string): EChartsOption {
  return {
    series: [
      {
        type: 'gauge',
        startAngle: 210,
        endAngle: -30,
        min: 0,
        max: 100,
        progress: { show: true, width: 10, itemStyle: { color: semanticColor(value >= 85 ? 'danger' : value >= 70 ? 'warn' : 'success') } },
        axisLine: { lineStyle: { width: 10, color: [[1, chartAxisColor()]] } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        pointer: { show: false },
        anchor: { show: false },
        detail: { valueAnimation: true, fontSize: 26, fontWeight: 600, color: 'var(--fg)', offsetCenter: [0, 0], formatter: '{value}%' },
        title: { offsetCenter: [0, '28%'], color: chartTextColor(), fontSize: 12 },
        data: [{ value, name }],
        radius: '92%',
      },
    ],
  };
}

function hex(c: string): string {
  const h = c.replace('#', '');
  if (h.length !== 6) return '28,143,230';
  return `${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)}`;
}
