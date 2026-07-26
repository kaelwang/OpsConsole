import axios, { AxiosError } from 'axios';
import { API_BASE, TOKEN_STORAGE_KEY } from './config';
import type { ApiEnvelope } from '@/types/api';

/** 统一业务错误（携带后端 code / message） */
export class ApiError extends Error {
  code: number;
  status: number;
  constructor(message: string, code: number, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* 忽略存储异常 */
  }
}

const http = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// 请求拦截：注入 Bearer JWT（网关中间件注入租户上下文）
http.interceptors.request.use((cfg) => {
  const token = getToken();
  if (token) {
    cfg.headers = cfg.headers ?? {};
    (cfg.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return cfg;
});

// 响应拦截：解包 { code, data, message } 信封
http.interceptors.response.use(
  (resp) => {
    const body = resp.data as ApiEnvelope<unknown>;
    if (body && typeof body.code === 'number' && body.code !== 0) {
      throw new ApiError(body.message || '请求失败', body.code, resp.status);
    }
    return resp;
  },
  (err: AxiosError) => {
    const data = err.response?.data as ApiEnvelope<unknown> | undefined;
    const message =
      data?.message ||
      (err.response ? `请求失败（${err.response.status}）` : '网络不可达');
    throw new ApiError(
      message,
      (data?.code as number) ?? err.response?.status ?? -1,
      err.response?.status ?? -1,
    );
  },
);

/** GET：自动解包 data */
export async function get<T>(
  url: string,
  params?: object,
): Promise<T> {
  const resp = await http.get<ApiEnvelope<T>>(url, { params });
  return (resp.data as ApiEnvelope<T>).data;
}

/** POST：自动解包 data */
export async function post<T>(
  url: string,
  payload?: unknown,
): Promise<T> {
  const resp = await http.post<ApiEnvelope<T>>(url, payload);
  return (resp.data as ApiEnvelope<T>).data;
}

export default http;
