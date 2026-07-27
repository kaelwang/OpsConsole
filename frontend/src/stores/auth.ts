import { create } from 'zustand';
import { setToken } from '@/services/http';
import type { RoleName, TokenResponse } from '@/types/api';

interface AuthState {
  token: string | null;
  email: string | null;
  role: RoleName | null;
  setSession: (t: TokenResponse, email: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  // 不持久化令牌：刷新页面即丢失登录态，强制每次重新登录
  token: null,
  email: null,
  role: null,
  setSession: (t, email) => {
    setToken(t.accessToken);
    set({ token: t.accessToken, email, role: t.role });
  },
  logout: () => {
    setToken(null);
    set({ token: null, email: null, role: null });
  },
}));
