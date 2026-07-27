import { post } from '../http';
import type { LoginRequest, TokenResponse } from '@/types/api';

/** POST /auth/login */
export async function login(req: LoginRequest): Promise<TokenResponse> {
  return post<TokenResponse>('/login', req);
}
