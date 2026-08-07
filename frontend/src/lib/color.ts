// 将 #rrggbb 颜色转为 "r,g,b" 串（用于 ECharts 渐变 / 透明度）
export function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return '28,143,230';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r},${g},${b}`;
}
