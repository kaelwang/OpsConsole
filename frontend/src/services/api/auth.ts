import { USE_MOCK } from '../config';
import { post } from '../http';
import { delay, mockLogin } from '../mock';
import type { LoginRequest, TokenResponse } from '@/types/api';

/** POST /auth/login */
export async function login(req: LoginRequest): Promise<TokenResponse> {
  if (USE_MOCK) {
    await delay(360);
    return mockLogin(req.email, req.password);
  }
  return post<TokenResponse>('/auth/login', req);
}
