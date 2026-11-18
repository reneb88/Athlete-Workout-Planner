async function req(method, url, body, raw) {
  const res = await fetch(url, {
    method,
    headers: raw ? { 'Content-Type': 'application/octet-stream' } : body ? { 'Content-Type': 'application/json' } : {},
    body: raw ? body : body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.startsWith('/api/auth')) window.dispatchEvent(new Event('rw-signed-out'));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  authStatus: () => req('GET', '/api/auth'),
  setupPassword: (password) => req('POST', '/api/auth/setup', { password }),
  login: (password) => req('POST', '/api/auth/login', { password }),
  logout: () => req('POST', '/api/auth/logout', {}),
  changePassword: (current, next) => req('POST', '/api/auth/change', { current, next }),
  state: () => req('GET', '/api/state'),
  saveSettings: (s) => req('PUT', '/api/settings', s),
  createSkill: (s) => req('POST', '/api/skills', s),
  updateSkill: (id, s) => req('PUT', `/api/skills/${encodeURIComponent(id)}`, s),
  deleteSkill: (id) => req('DELETE', `/api/skills/${encodeURIComponent(id)}`),
  reorderSkills: (ids) => req('POST', '/api/skills/reorder', { ids }),
  createAthlete: (a) => req('POST', '/api/athletes', a),
  updateAthlete: (id, a) => req('PUT', `/api/athletes/${encodeURIComponent(id)}`, a),
  markPrinted: (ids) => req('POST', '/api/athletes/printed', { ids }),
  deleteAthlete: (id) => req('DELETE', `/api/athletes/${encodeURIComponent(id)}`),
  createCombo: (c) => req('POST', '/api/combos', c),
  updateCombo: (id, c) => req('PUT', `/api/combos/${encodeURIComponent(id)}`, c),
  deleteCombo: (id) => req('DELETE', `/api/combos/${encodeURIComponent(id)}`),
  workout: (id) => req('GET', `/api/workouts/${encodeURIComponent(id)}`),
  saveWorkout: (id, w) => req('PUT', `/api/workouts/${encodeURIComponent(id)}`, w),
  saveWorkouts: (ids, w) => req('POST', '/api/workouts/bulk', { athlete_ids: ids, ...w }),
  setProgress: (id, item_type, item_id, done) => req('PUT', `/api/progress/${encodeURIComponent(id)}`, { item_type, item_id, done }),
  createTemplate: (t) => req('POST', '/api/templates', t),
  updateTemplate: (id, t) => req('PUT', `/api/templates/${id}`, t),
  deleteTemplate: (id) => req('DELETE', `/api/templates/${id}`),
  importXlsx: (file, mode) => req('POST', `/api/import?mode=${mode}`, file, true),
};
