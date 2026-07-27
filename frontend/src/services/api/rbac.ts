import { get, post } from '../http';
import type { MemberAssignment, RoleName, RolePermission } from '@/types/api';

/** GET /rbac/roles */
export async function listRoles(): Promise<RolePermission[]> {
  return get<RolePermission[]>('/rbac/roles');
}

/** GET /rbac/memberships — 租户成员列表 */
export async function listMembers(): Promise<MemberAssignment[]> {
  return get<MemberAssignment[]>('/rbac/memberships');
}

export interface AssignRoleRequest {
  userId: string;
  role: RoleName;
}

/** POST /rbac/memberships — 分配租户角色（admin+），越权返回 403 + 记审计 */
export async function assignRole(req: AssignRoleRequest): Promise<void> {
  await post<void>('/rbac/memberships', { user_id: req.userId, role: req.role });
}
