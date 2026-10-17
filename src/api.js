// Cliente fino da API HTTP (cookie de sessão HttpOnly, mesma origem).
import { inviter } from './track.js';

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Falha de conexão.'), { status: res.status });
  return data;
}

export const api = {
  me: () => request('/api/me'),
  register: (email, nick, password, terms) => request('/api/auth/register', { method: 'POST', body: { email, nick, password, terms, ref: inviter() } }),
  deleteAccount: (proof) => request('/api/auth/delete', { method: 'POST', body: proof }),
  google: (credential, nick, terms) => request('/api/auth/google', { method: 'POST', body: { credential, nick, terms, ref: inviter() } }),
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => request('/api/auth/logout', { method: 'POST', body: {} }),
  checkout: (item, side) => request('/api/shop/checkout', { method: 'POST', body: { item, side } }),
  ranking: (period) => request(`/api/ranking?period=${period === 'all' ? 'all' : 'week'}`),
  simulatePix: (order) => request('/api/shop/simulate-pix', { method: 'POST', body: { order } }),
  confirm: (order) => request(`/api/shop/confirm?order=${encodeURIComponent(order)}`),
  equip: (slot, item) => request('/api/shop/equip', { method: 'POST', body: { slot, item } }),
  design: (kind, design) => request('/api/shop/design', { method: 'POST', body: { kind, design } }),
};
