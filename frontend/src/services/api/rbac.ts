import { USE_MOCK } from '../config';
import { get, post } from '../http';
import { delay, roles, members } from '../mock';
import type { MemberAssignment, RoleName, RolePermission } from '@/types/api';

/** GET /rbac/roles */
export async function listRoles(): Promise<RolePermission[]> {
  if (USE_MOCK) {
    await delay();
    return roles;
  }
  return get<RolePermission[]>('/rbac/roles');
}

/** 成员分配（mock 聚合；真实环境由 tenant_memberships 派生） */
export async function listMembers(): Promise<MemberAssignment[]> {
  if (USE_MOCK) {
    await delay();
    return members;
  }
  return get<MemberAssignment[]>('/rbac/roles');
}

export interface AssignRoleRequest {
  userId: string;
  role: RoleName;
}

/** POST /rbac/assign — 分配租户角色（admin+），越权返回 403 + 记审计 */
export async function assignRole(req: AssignRoleRequest): Promise<void> {
  if (USE_MOCK) {
    await delay();
    const m = members.find((x) => x.userId === req.userId);
    if (m) m.role = req.role;
    return;
  }
  await post<void>('/rbac/assign', req);
}
