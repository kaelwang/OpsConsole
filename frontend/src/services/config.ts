/* 运行环境配置：由 .env 注入，构建期确定 */

/** 真实后端 API 前缀 */
export const API_BASE: string = import.meta.env.VITE_API_BASE ?? '/api/v1';

export const THEME_STORAGE_KEY = 'opsconsole_theme';
export const SCOPE_STORAGE_KEY = 'opsconsole_scope';
