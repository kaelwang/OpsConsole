import { USE_MOCK } from '../config';
import { get, post } from '../http';
import { delay, pipelines, mockDeployments } from '../mock';
import type { Deployment, Pipeline, RollbackRequest } from '@/types/api';

/** GET /deployment/pipelines */
export async function listPipelines(): Promise<Pipeline[]> {
  if (USE_MOCK) {
    await delay();
    return pipelines;
  }
  return get<Pipeline[]>('/deployment/pipelines');
}

/** POST /deployment/pipelines/{id}/trigger — 需 member 以上 */
export async function triggerPipeline(id: string): Promise<void> {
  if (USE_MOCK) {
    await delay(420);
    const p = pipelines.find((x) => x.id === id);
    if (p) p.status = 'running';
    return;
  }
  await post<void>(`/deployment/pipelines/${id}/trigger`);
}

/** POST /deployment/pipelines/{id}/rollback — 需 member 以上，回滚至上一稳定版本 */
export async function rollbackPipeline(
  id: string,
  req?: RollbackRequest,
): Promise<Deployment> {
  if (USE_MOCK) {
    await delay(520);
    const p = pipelines.find((x) => x.id === id);
    return {
      id: `dep-${Date.now().toString(36)}`,
      pipelineId: id,
      version: p?.version ?? 'v1.0.0',
      status: 'rolled_back',
      createdBy: 'u-current',
      createdAt: new Date().toISOString(),
    };
  }
  return post<Deployment>(`/deployment/pipelines/${id}/rollback`, req);
}

/** 近期部署（mock 聚合；真实环境由 pipelines + deployments 历史派生） */
export async function listRecentDeployments(): Promise<Deployment[]> {
  if (USE_MOCK) {
    await delay();
    return mockDeployments();
  }
  return get<Pipeline[]>('/deployment/pipelines').then((ps) =>
    ps.map<Deployment>((p) => ({
      id: `dep-${p.id}`,
      pipelineId: p.id,
      version: p.version ?? 'v1.0.0',
      status: p.status === 'running' ? 'running' : p.status === 'failed' ? 'failed' : 'success',
      createdBy: 'u-current',
      createdAt: p.lastRunAt,
    })),
  );
}
