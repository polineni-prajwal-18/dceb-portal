/* =========================================================
   DCEB API client. Every request goes to the server.
   The session is kept in an HTTP-only cookie that JavaScript cannot read.
   ========================================================= */
async function api(path, { method, body, form } = {}) {
    const opts = { method: method || (body || form ? 'POST' : 'GET'), credentials: 'same-origin', headers: {} };
    if (form) {
        opts.body = form;
    } else if (body) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }
    const res = await fetch(`/api${path}`, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed. Please try again.');
    return data;
}

const DCEB_API = {
    login: (userId, password) => api('/auth/login', { body: { userId, password } }),
    logout: () => api('/auth/logout', { method: 'POST' }),
    me: () => api('/auth/me'),

    notices: () => api('/notices'),
    ticker: () => api('/ticker'),

    profile: () => api('/school/profile'),
    myPayments: () => api('/school/payments'),
    submitPayment: formData => api('/school/payments', { form: formData }),
    receiptUrl: id => `/api/school/payments/${id}/receipt`,

    summary: () => api('/admin/summary'),
    schools: (params = '') => api(`/admin/schools${params}`),
    createSchool: data => api('/admin/schools', { body: data }),
    resetSchoolPassword: (udise, password) =>
        api(`/admin/schools/${udise}/password`, { method: 'PUT', body: { password } }),
    payments: (params = '') => api(`/admin/payments${params}`),
    verifyPayment: id => api(`/admin/payments/${id}/verify`, { method: 'POST' }),
    rejectPayment: (id, reason) => api(`/admin/payments/${id}/reject`, { body: { reason } }),
    adminReceiptUrl: id => `/api/admin/payments/${id}/receipt`,
    addNotice: text => api('/admin/notices', { body: { text } }),
    deleteNotice: id => api(`/admin/notices/${id}`, { method: 'DELETE' }),
    setTicker: text => api('/admin/ticker', { method: 'PUT', body: { text } })
};
