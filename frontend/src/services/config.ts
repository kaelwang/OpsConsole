/* 运行环境配置：由 .env 注入，构建期确定 */

/** 是否使用 mock 适配器（无后端时 UI 仍可渲染、可演示） */
export const USE_MOCK: boolean =
  (import.meta.env.VITE_USE_MOCK ?? 'true') !== 'false';

/** 真实后端 API 前缀 */
export const API_BASE: string = import.meta.env.VITE_API_BASE ?? '/api/v1';

/** 本地持久化的令牌键 */
export const TOKEN_STORAGE_KEY = 'opsconsole_token';
export const THEME_STORAGE_KEY = 'opsconsole_theme';
export const SCOPE_STORAGE_KEY = 'opsconsole_scope';
