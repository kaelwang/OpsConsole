import { useEffect, useRef, type ReactNode } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import { hexToRgb } from '@/lib/color';

/** 读取 CSS 变量解析后的实际颜色（使图表随 data-theme 变化） */
export function cssVar(name: string, fallback = ''): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function chartSeriesColor(i: number): string {
  return cssVar(`--chart-${i % 8}`, '#58a6ff');
}
export function chartAxisColor(): string {
  return cssVar('--border-soft', 'rgba(255,255,255,0.05)');
}
export function chartTextColor(): string {
  return cssVar('--muted', '#7a8294');
}
export function chartFgColor(): string {
  return cssVar('--fg', '#e6e9ef');
}
export function semanticColor(name: 'success' | 'warn' | 'danger' | 'accent'): string {
  return cssVar(`--${name}`, '#1c8fe6');
}

/** 轻量 ECharts 包装：管理实例生命周期 + ResizeObserver */
export function ReactECharts({
  option,
  height = 240,
  className,
}: {
  option: EChartsOption;
  height?: number | string;
  className?: string;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!elRef.current) return;
    const chart = echarts.init(elRef.current, undefined, { renderer: 'canvas' });
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(elRef.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, true);
  }, [option]);

  return <div ref={elRef} className={className} style={{ width: '100%', height }} />;
}

/** 迷你 sparkline（面积图，用于指标卡） */
export function Sparkline({
  data,
  colorIndex = 0,
  height = 40,
}: {
  data: number[];
  colorIndex?: number;
  height?: number;
}) {
  const color = chartSeriesColor(colorIndex);
  const option: EChartsOption = {
    grid: { left: 0, right: 0, top: 2, bottom: 2 },
    xAxis: { type: 'category', show: false, data: data.map((_, i) => i) },
    yAxis: { type: 'value', show: false, scale: true },
    tooltip: { show: false },
    series: [
      {
        type: 'line',
        data,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 1.75, color },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: `rgba(${hexToRgb(color)},0.28)` },
            { offset: 1, color: `rgba(${hexToRgb(color)},0)` },
          ]),
        },
      },
    ],
  };
  return <ReactECharts option={option} height={height} />;
}

/** 通用空态 */
export function ChartEmpty({ children }: { children?: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--muted)',
        fontSize: 'var(--font-size-sm)',
      }}
    >
      {children ?? '暂无数据'}
    </div>
  );
}
