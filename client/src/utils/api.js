// utils/api.js — 중앙 API 클라이언트

const API_BASE = '';

function getHeaders(includeAuth = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (includeAuth) {
    const token = localStorage.getItem('unipick_token');
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }
  return headers;
}

async function request(path, options = {}) {
  const { method = 'GET', body, includeAuth = true } = options;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: getHeaders(includeAuth),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    const text = await res.text();
    data = { success: false, error: text || '서버 응답을 처리할 수 없습니다.' };
  }

  if (!res.ok && data && typeof data.success === 'undefined') {
    return { success: false, error: data.error || `요청 처리 실패 (${res.status})`, status: res.status };
  }
  return data;
}

export const authApi = {
  login: (username, password) =>
    request('/api/login', { method: 'POST', body: { username, password }, includeAuth: false }),
  demoLogin: () =>
    request('/api/demo-login', { method: 'POST', body: {}, includeAuth: false }),
  register: (usernameOrPayload, password, displayName) => {
    const body =
      typeof usernameOrPayload === 'object' && usernameOrPayload !== null
        ? usernameOrPayload
        : { username: usernameOrPayload, password, displayName };
    return request('/api/register', { method: 'POST', body, includeAuth: false });
  },
  me: () => request('/api/me'),
  updateProfile: (payloadOrName) => {
    const body =
      typeof payloadOrName === 'object' && payloadOrName !== null
        ? payloadOrName
        : { displayName: payloadOrName };
    return request('/api/profile', { method: 'PUT', body });
  },
  changePassword: (currentPassword, newPassword) =>
    request('/api/password', { method: 'PUT', body: { currentPassword, newPassword } }),
};

export const universityApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.category) qs.set('category', params.category);
    if (params.q) qs.set('q', params.q);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request(`/api/universities${suffix}`, { includeAuth: false });
  },
};

export const consultApi = {
  analyze: ({ score, major, category, englishGrade, subjects = null, save = true }) =>
    request('/api/consult', {
      method: 'POST',
      body: { score, major, category, englishGrade, subjects, save },
    }),
  list: () => request('/api/consultations'),
  get: (id) => request(`/api/consultations/${id}`),
  getById: (id) => request(`/api/consultations/${id}`),
  remove: (id) => request(`/api/consultations/${id}`, { method: 'DELETE' }),
};

export const bookmarkApi = {
  list: () => request('/api/bookmarks'),
  save: (universityId, department = '') =>
    request('/api/bookmarks', { method: 'POST', body: { universityId, department } }),
  remove: (universityId) =>
    request(`/api/bookmarks/${encodeURIComponent(universityId)}`, { method: 'DELETE' }),
};
