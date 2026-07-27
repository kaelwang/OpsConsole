import { create } from 'zustand';
import { SCOPE_STORAGE_KEY } from '@/services/config';

export interface ScopeState {
  team: string;
  cluster: string;
  env: string;
}
interface ScopeStore extends ScopeState {
  setScope: (p: Partial<ScopeState>) => void;
}

const DEFAULT: ScopeState = { team: 'all', cluster: '', env: 'prod' };

function readInitial(): ScopeState {
  try {
    const s = localStorage.getItem(SCOPE_STORAGE_KEY);
    if (s) return { ...DEFAULT, ...JSON.parse(s) };
  } catch {
    /* ignore */
  }
  return DEFAULT;
}

export const useScopeStore = create<ScopeStore>((set) => ({
  ...readInitial(),
  setScope: (p) =>
    set((s) => {
      const next = { ...s, ...p };
      try {
        localStorage.setItem(SCOPE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    }),
}));
