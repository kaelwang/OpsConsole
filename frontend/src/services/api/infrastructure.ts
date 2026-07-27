import { API_BASE } from '../config';
import { get, post } from '../http';
import type { Cluster, ClusterCreateRequest, Host, Pod } from '@/types/api';

/** GET /infrastructure/clusters */
export async function listClusters(): Promise<Cluster[]> {
  return get<Cluster[]>('/infrastructure/clusters');
}

/** POST /infrastructure/clusters — 注册集群（admin+，绑定 SA + impersonation） */
export async function registerCluster(req: ClusterCreateRequest): Promise<Cluster> {
  return post<Cluster>('/infrastructure/clusters', req);
}

/** GET /infrastructure/clusters/{id}/pods — 经 SA impersonation 透传 K8s RBAC */
export async function listPods(
  clusterId: string,
  namespace?: string,
): Promise<Pod[]> {
  return get<Pod[]>(`/infrastructure/clusters/${clusterId}/pods`, { namespace });
}

/** GET /infrastructure/hosts */
export async function listHosts(): Promise<Host[]> {
  return get<Host[]>('/infrastructure/hosts');
}

/** 容器终端 WebSocket 地址 */
export function buildExecUrl(clusterId: string, pod: string, container?: string): string {
  const u = new URL(`${API_BASE}/infrastructure/clusters/${clusterId}/exec`, window.location.origin);
  u.searchParams.set('pod', pod);
  if (container) u.searchParams.set('container', container);
  return u.toString();
}
