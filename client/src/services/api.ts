/**
 * API Client for PDV Camaleão Backend
 * Handles all HTTP communication with JWT authentication
 */

const API_BASE = '/api';

// ─── Token Management ───────────────────────────────────────────────

function getAccessToken(): string | null {
  return localStorage.getItem('pdv_access_token');
}

function getRefreshToken(): string | null {
  return localStorage.getItem('pdv_refresh_token');
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem('pdv_access_token', access);
  localStorage.setItem('pdv_refresh_token', refresh);
}

export function clearTokens() {
  localStorage.removeItem('pdv_access_token');
  localStorage.removeItem('pdv_refresh_token');
  localStorage.removeItem('pdv_tenant');
  localStorage.removeItem('pdv_operator');
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

export function getTenant(): any | null {
  const raw = localStorage.getItem('pdv_tenant');
  return raw ? JSON.parse(raw) : null;
}

export function setTenant(tenant: any) {
  localStorage.setItem('pdv_tenant', JSON.stringify(tenant));
}

export function getOperator(): any | null {
  const raw = localStorage.getItem('pdv_operator');
  return raw ? JSON.parse(raw) : null;
}

export function setOperator(operator: any) {
  localStorage.setItem('pdv_operator', JSON.stringify(operator));
}

// ─── HTTP Client ─────────────────────────────────────────────────────

async function refreshAccessToken(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });

    if (!res.ok) return false;

    const data = await res.json();
    setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

async function request<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  // If 401, try refreshing the token once
  if (res.status === 401 && token) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${getAccessToken()}`;
      res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
      });
    } else {
      // Refresh failed — force logout
      clearTokens();
      window.location.href = '/login';
      throw new Error('Sessão expirada. Faça login novamente.');
    }
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(errorData.error || `Erro ${res.status}`);
  }

  // Handle 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json();
}

// ─── Auth Endpoints ──────────────────────────────────────────────────

export const auth = {
  login: (email: string, password: string) =>
    request<{
      accessToken: string;
      refreshToken: string;
      tenant: { id: string; name: string; email: string };
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  loginWithPin: (userId: string, pin: string) =>
    request<{
      accessToken: string;
      user: { id: string; name: string; role: string };
    }>('/auth/pin', {
      method: 'POST',
      body: JSON.stringify({ userId, pin }),
    }),
};

// ─── Products ────────────────────────────────────────────────────────

export const products = {
  list: () => request<any[]>('/products'),
  
  create: (data: any) =>
    request('/products', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  update: (id: string, data: any) =>
    request(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  
  delete: (id: string) =>
    request(`/products/${id}`, { method: 'DELETE' }),
  
  updateStock: (id: string, quantity: number) =>
    request(`/products/${id}/stock`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    }),
  
  lookupBarcode: (barcode: string) =>
    request<{
      found: boolean;
      name?: string;
      category?: string;
      brand?: string;
      unit?: string;
      ncm?: string;
      source?: string;
    }>(`/products/lookup-barcode/${encodeURIComponent(barcode)}`),
};

// ─── Sales ───────────────────────────────────────────────────────────

export const sales = {
  list: (params?: { from?: string; to?: string; status?: string }) => {
    const query = new URLSearchParams(params as any).toString();
    return request<any[]>(`/sales${query ? `?${query}` : ''}`);
  },
  
  create: (data: {
    items: Array<{
      productId: string;
      productName: string;
      quantity: number;
      unitPrice: number;
      discount: number;
      total: number;
    }>;
    subtotal: number;
    discount: number;
    total: number;
    payments: Array<{ method: string; amount: number; details?: any }>;
    amountPaid: number;
    change: number;
    customerName?: string;
    customerCpf?: string;
  }) =>
    request('/sales', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  cancel: (id: string) =>
    request(`/sales/${id}/cancel`, { method: 'PATCH' }),
};

// ─── Cash Register ───────────────────────────────────────────────────

export const cashRegister = {
  get: () => request<any>('/cash-register'),
  
  open: (initialAmount: number) =>
    request('/cash-register/open', {
      method: 'POST',
      body: JSON.stringify({ initialAmount }),
    }),
  
  close: () =>
    request('/cash-register/close', { method: 'POST' }),
  
  addMovement: (data: { type: 'inflow' | 'outflow'; amount: number; reason: string }) =>
    request('/cash-register/movement', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// ─── Users ───────────────────────────────────────────────────────────

export const users = {
  list: () => request<any[]>('/users'),
  
  create: (data: { name: string; username: string; pin: string; role: string }) =>
    request('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  delete: (id: string) =>
    request(`/users/${id}`, { method: 'DELETE' }),
};

// ─── Settings ────────────────────────────────────────────────────────

export const settings = {
  get: () => request<any>('/settings'),
  
  update: (data: any) =>
    request('/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

// ─── Reports ─────────────────────────────────────────────────────────

export const reports = {
  get: (params?: { from?: string; to?: string }) => {
    const query = new URLSearchParams(params as any).toString();
    return request<any>(`/reports${query ? `?${query}` : ''}`);
  },
};

// ─── Supervisor PIN Verification ─────────────────────────────────────

export const supervisor = {
  verifyPin: (pin: string) =>
    request<{ valid: boolean; supervisor?: any; user?: any }>('/auth/verify-supervisor', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),
};

// ─── Fiscal / NFC-e ──────────────────────────────────────────────────

export const fiscal = {
  uploadCertificate: (pfxBase64: string, password?: string) =>
    request<{
      success: boolean;
      message: string;
      owner: string;
      cnpj?: string;
      expiresAt: string;
      daysRemaining: number;
    }>('/fiscal/certificate', {
      method: 'POST',
      body: JSON.stringify({ pfxBase64, password }),
    }),

  emitNfce: (saleId: string, customerCpf?: string) =>
    request<{
      success: boolean;
      fiscalStatus: string;
      accessKey?: string;
      protocol?: string;
      number?: number;
      series?: number;
      qrCodeUrl?: string;
      errorMessage?: string;
    }>(`/fiscal/emit/${saleId}`, {
      method: 'POST',
      body: JSON.stringify({ customerCpf }),
    }),

  getDanfe: (saleId: string) =>
    request<{
      sale: any;
      store: any;
      isFiscal: boolean;
      accessKey?: string;
      protocol?: string;
      number?: number;
      series?: number;
      qrCodeUrl?: string;
      issuedAt?: string;
    }>(`/fiscal/danfe/${saleId}`),
};

// ─── Categories ──────────────────────────────────────────────────────

export const categories = {
  list: () => request<Array<{ id: string; name: string; color?: string }>>('/categories'),
  
  create: (data: { name: string; color?: string }) =>
    request<{ id: string; name: string; color?: string }>('/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  update: (id: string, data: { name: string; color?: string }) =>
    request<{ id: string; name: string; color?: string }>(`/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  
  delete: (id: string) =>
    request(`/categories/${id}`, { method: 'DELETE' }),
};


