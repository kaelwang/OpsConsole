// 自适应速率显示：输入以 MB/s 为单位的数值，自动在 KB/s / MB/s / GB/s 间切换。
// 用于解决低吞吐场景（< 0.05 MB/s）被四舍五入显示成 "0 MB/s" 的误读问题。
export interface ThroughputDisplay {
  value: string;
  unit: string;
}

export function formatThroughput(mbps: number): ThroughputDisplay {
  if (!Number.isFinite(mbps) || mbps <= 0) {
    return { value: '0', unit: 'KB/s' };
  }
  if (mbps >= 1024) {
    return { value: (mbps / 1024).toFixed(2), unit: 'GB/s' };
  }
  if (mbps >= 1) {
    return { value: mbps.toFixed(2), unit: 'MB/s' };
  }
  return { value: (mbps * 1024).toFixed(1), unit: 'KB/s' };
}
