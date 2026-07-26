import { create } from 'zustand';
import { THEME_STORAGE_KEY } from '@/services/config';

export type ThemeMode = 'system' | 'dark' | 'light';
export type ResolvedTheme = 'dark' | 'light';

interface ThemeState {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (m: ThemeMode) => void;
}

function systemPref(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function resolve(mode: ThemeMode): ResolvedTheme {
  return mode === 'system' ? systemPref() : mode;
}
function apply(resolved: ResolvedTheme) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', resolved);
  }
}
function readInitial(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
    if (saved === 'system' || saved === 'dark' || saved === 'light') return saved;
  } catch {
    /* ignore */
  }
  return 'system';
}

const initMode = readInitial();
const initResolved = resolve(initMode);
apply(initResolved);

export const useThemeStore = create<ThemeState>((set) => ({
  mode: initMode,
  resolved: initResolved,
  setMode: (mode) => {
    const resolved = resolve(mode);
    apply(resolved);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
    set({ mode, resolved });
  },
}));

/* 系统主题变化时同步（仅 system 模式） */
if (typeof window !== 'undefined' && window.matchMedia) {
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      if (useThemeStore.getState().mode === 'system') {
        const r = systemPref();
        apply(r);
        useThemeStore.setState({ resolved: r });
      }
    });
}
