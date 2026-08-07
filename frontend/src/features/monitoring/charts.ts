import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import { chartAxisColor, chartSeriesColor, chartTextColor, semanticColor } from '@/components/chart';
import { hexToRgb } from '@/lib/color';

// 坐标轴 tooltip 统一格式化：默认 1 位小数；网络吞吐(net)用自适应 KB/s/MB/s。
// trigger:'axis' 时 params 为数组，每项 value 形如 [时间戳, 数值]，取第 2 个元素。
function axisTooltipFormatter(yFormatter?: (v: number) => string) {
  return (params: any) => {
    const list = Array.isArray(params) ? params : [params];
    const rows = list.map((p: any) => {
      const raw = Array.isArray(p.value) ? p.value[1] : p.value;
      const text = yFormatter ? yFormatter(Number(raw)) : Number(raw).toFixed(1);
      return `${p.marker}${p.seriesName}<span style="float:right;margin-left:16px;font-family:var(--font-mono)"><b>${text}</b></span>`;
    });
    return rows.join('<br/>');
  };
}

export function lineOption(
  name: string,
  points: Array<[number, number]>,
  colorIdx: number,
  thresholds?: { warn: number; danger: number },
  yFormatter?: (v: number) => string,
): EChartsOption {
  const color = chartSeriesColor(colorIdx);
  return {
    grid: { left: 8, right: 16, top: 24, bottom: 28, containLabel: true },
    tooltip: { trigger: 'axis', backgroundColor: 'var(--surface-2)', borderColor: 'var(--border)', textStyle: { color: 'var(--fg)' }, formatter: axisTooltipFormatter(yFormatter) },
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
      axisLabel: { color: chartTextColor(), fontSize: 11, formatter: yFormatter ?? ((v: number) => Number(v).toFixed(1)) },
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
            { offset: 0, color: `rgba(${hexToRgb(color)},0.26)` },
            { offset: 1, color: `rgba(${hexToRgb(color)},0)` },
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

// 多节点：同一张图按节点拆分多条曲线，便于对比各节点。
export function multiLineOption(
  times: number[],
  series: Array<{ name: string; values: number[] }>,
  baseColorIdx: number,
  thresholds?: { warn: number; danger: number },
  yFormatter?: (v: number) => string,
): EChartsOption {
  const palette = [0, 1, 2, 3, 4, 5, 6, 7];
  return {
    grid: { left: 8, right: 16, top: 28, bottom: 28, containLabel: true },
    tooltip: { trigger: 'axis', backgroundColor: 'var(--surface-2)', borderColor: 'var(--border)', textStyle: { color: 'var(--fg)' }, formatter: axisTooltipFormatter(yFormatter) },
    legend: { type: 'scroll', top: 0, textStyle: { color: chartTextColor(), fontSize: 11 }, icon: 'roundRect' },
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
      axisLabel: { color: chartTextColor(), fontSize: 11, formatter: yFormatter ?? ((v: number) => Number(v).toFixed(1)) },
      splitLine: { lineStyle: { color: chartAxisColor() } },
    },
    series: series.map((s, i) => {
      const color = chartSeriesColor(palette[(baseColorIdx + i) % palette.length]);
      const points = times.map((t, idx) => [t * 1000, s.values[idx] ?? 0] as [number, number]);
      return {
        name: s.name,
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: points,
        lineStyle: { width: 1.5, color },
        itemStyle: { color },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: `rgba(${hexToRgb(color)},0.16)` },
            { offset: 1, color: `rgba(${hexToRgb(color)},0)` },
          ]),
        },
        markLine: i === 0 && thresholds
          ? {
              silent: true,
              symbol: 'none',
              data: [
                { yAxis: thresholds.warn, lineStyle: { color: semanticColor('warn'), type: 'dashed', width: 1 }, label: { color: chartTextColor(), formatter: '警告' } },
                { yAxis: thresholds.danger, lineStyle: { color: semanticColor('danger'), type: 'dashed', width: 1 }, label: { color: chartTextColor(), formatter: '严重' } },
              ],
            }
          : undefined,
      };
    }),
  };
}

