import { get, post } from '../http';
import type { Deployment, Pipeline } from '@/types/api';

/** GET /deployment/pipelines — GitLab 流水线列表 */
export async function listPipelines(projectId?: string): Promise<Pipeline[]> {
  return get<Pipeline[]>('/deployment/pipelines', projectId ? { project_id: projectId } : undefined);
}

/** POST /deployment/trigger — 触发部署（需 member 以上） */
export async function triggerDeployment(projectId: string, ref: string): Promise<Deployment> {
  return post<Deployment>('/deployment/trigger', { project_id: projectId, ref });
}

/** POST /deployment/rollback — 回滚指定部署（需 member 以上，记审计） */
export async function rollbackDeployment(deploymentId: string): Promise<Deployment> {
  return post<Deployment>('/deployment/rollback', { deployment_id: deploymentId });
}

/** GET /deployment/deployments — 部署历史记录（数据库） */
export async function listRecentDeployments(): Promise<Deployment[]> {
  return get<Deployment[]>('/deployment/deployments');
}
