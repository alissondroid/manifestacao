// Cliente fino da API HTTP (cookie de sessão HttpOnly, mesma origem).

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
  register: (email, nick, password) => request('/api/auth/register', { method: 'POST', body: { email, nick, password } }),
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => request('/api/auth/logout', { method: 'POST', body: {} }),
  checkout: (item) => request('/api/shop/checkout', { method: 'POST', body: { item } }),
  confirm: (order) => request(`/api/shop/confirm?order=${encodeURIComponent(order)}`),
  equip: (slot, item) => request('/api/shop/equip', { method: 'POST', body: { slot, item } }),
  design: (kind, design) => request('/api/shop/design', { method: 'POST', body: { kind, design } }),
};
