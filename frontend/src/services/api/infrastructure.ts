import { USE_MOCK, API_BASE } from '../config';
import { get, post } from '../http';
import { delay, clusters, hosts, mockPods } from '../mock';
import type { Cluster, ClusterCreateRequest, Host, Pod } from '@/types/api';

/** GET /infrastructure/clusters */
export async function listClusters(): Promise<Cluster[]> {
  if (USE_MOCK) {
    await delay();
    return clusters;
  }
  return get<Cluster[]>('/infrastructure/clusters');
}

/** POST /infrastructure/clusters — 注册集群（admin+，绑定 SA + impersonation） */
export async function registerCluster(req: ClusterCreateRequest): Promise<Cluster> {
  if (USE_MOCK) {
    await delay();
    const created: Cluster = {
      id: `cls-${Date.now().toString(36)}`,
      name: req.name,
      kubeconfigRef: req.kubeconfigRef,
      saName: req.saName,
      createdAt: new Date().toISOString(),
      nodeCount: 0,
      health: 100,
    };
    clusters.unshift(created);
    return created;
  }
  return post<Cluster>('/infrastructure/clusters', req);
}

/** GET /infrastructure/clusters/{id}/pods — 经 SA impersonation 透传 K8s RBAC */
export async function listPods(
  clusterId: string,
  namespace?: string,
): Promise<Pod[]> {
  if (USE_MOCK) {
    await delay();
    const all = mockPods(clusterId);
    return namespace ? all.filter((p) => p.namespace === namespace) : all;
  }
  return get<Pod[]>(`/infrastructure/clusters/${clusterId}/pods`, { namespace });
}

/** GET /infrastructure/hosts */
export async function listHosts(): Promise<Host[]> {
  if (USE_MOCK) {
    await delay();
    return hosts;
  }
  return get<Host[]>('/infrastructure/hosts');
}

/** 容器终端 WebSocket 地址（真实环境）；mock 模式由终端组件模拟 */
export function buildExecUrl(clusterId: string, pod: string, container?: string): string {
  const u = new URL(`${API_BASE}/infrastructure/clusters/${clusterId}/exec`, window.location.origin);
  u.searchParams.set('pod', pod);
  if (container) u.searchParams.set('container', container);
  return u.toString();
}
