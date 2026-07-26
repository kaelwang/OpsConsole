import { create } from 'zustand';
import { TOKEN_STORAGE_KEY } from '@/services/config';
import { setToken } from '@/services/http';
import type { RoleName, TokenResponse } from '@/types/api';

interface AuthState {
  token: string | null;
  email: string | null;
  role: RoleName | null;
  setSession: (t: TokenResponse, email: string) => void;
  logout: () => void;
}

function readInitial(): { token: string | null } {
  try {
    return { token: localStorage.getItem(TOKEN_STORAGE_KEY) };
  } catch {
    return { token: null };
  }
}

const init = readInitial();

export const useAuthStore = create<AuthState>((set) => ({
  token: init.token,
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
