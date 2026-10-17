const KEY = 'draftly_token';
export const getToken = () => localStorage.getItem(KEY);
export const setToken = (t) => localStorage.setItem(KEY, t);
export const clearToken = () => localStorage.removeItem(KEY);

export async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  let body = opts.body;
  if (body && !(body instanceof FormData)) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch('/api' + path, { ...opts, headers, body });
  } catch {
    throw new Error('Cannot reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token && !path.startsWith('/auth/login')) {
    clearToken();
    window.dispatchEvent(new Event('draftly:signed-out'));
  }
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}
