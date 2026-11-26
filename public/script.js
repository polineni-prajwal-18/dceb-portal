/* =========================================================
   DCEB portal front end, connected to the server.
   Load order in index.html: jspdf, autotable, slip.js, api.js, script.js
   ========================================================= */
const PAGE_SIZE = 50;
const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;
const PURPOSE_CODE = { '150': 'tc', '500': 'exam', '1000': 'premium' };
const PURPOSE_LABEL = { tc: 'TC Book Fee', exam: 'SA-1 & SA-2 Examination Fee', premium: 'SSC Pre-Public & Model Papers Fee' };
const PAYMENT_APPS = ['PhonePe', 'Google Pay', 'Paytm', 'BHIM UPI', 'Net Banking', 'Other'];
const MANAGEMENTS = ['Government', 'ZPP / MPP', 'Municipal', 'Private Aided', 'Private Unaided'];
const PILL = { Pending: 'sun', Verified: 'mint', Rejected: 'rose', Completed: 'mint', 'Partially completed': 'sun', 'Not completed': 'rose' };

const LOGIN_HTML = `
<div class="login-overlay">
    <div class="login-card glass-card">
        <div class="brand-logo" style="margin:0 auto"><i class="fa-solid fa-graduation-cap"></i></div>
        <h2>DCEB Portal Sign In</h2>
        <p class="subtitle">Schools sign in with their 11-digit UDISE code. Admins use their admin ID.</p>
        <form id="loginForm">
            <div class="form-group"><label>USER ID</label><input id="loginUser" autocomplete="username" required></div>
            <div class="form-group"><label>PASSWORD</label><input id="loginPass" type="password" autocomplete="current-password" required></div>
            <div class="login-error" id="loginError"></div>
            <button class="btn btn-teal btn-block" type="submit"><i class="fa-solid fa-right-to-bracket"></i> Sign In</button>
        </form>
    </div>
</div>`;

let me = null, profile = null, myRows = [], adminRows = [];
let adminTab = 'overview', paymentFilter = 'Pending';
let paymentOffset = 0, schoolOffset = 0, schoolSearch = '';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = iso => iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const rupees = n => '₹ ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pill = s => `<span class="status-pill ${PILL[s] || 'gray'}">${esc(s)}</span>`;

function byLabel(root, text) {
    const t = text.toUpperCase();
    const group = $$('.form-group', root).find(g => ($('label', g)?.textContent || '').trim().toUpperCase().startsWith(t));
    return group ? group.querySelector('input, select') : null;
}
const val = (root, text) => (byLabel(root, text)?.value || '').trim();

/* ---------- form setup: adds the fields the slip needs ---------- */
function fieldHtml(label, name, type = 'text', placeholder = '') {
    const req = label.includes('*') ? 'required' : '';
    return `<div class="form-group"><label>${label}</label><input name="${name}" type="${type}" placeholder="${placeholder}" ${req}></div>`;
}

function extraFieldsHtml(withContact) {
    const apps = PAYMENT_APPS.map(a => `<option>${a}</option>`).join('');
    return `<div class="form-grid-2 extra-fields">
        ${fieldHtml('UTR NUMBER *', 'utr', 'text', 'As shown in your bank or app')}
        ${fieldHtml('TRANSACTION / PAYMENT ID', 'txnId', 'text', 'Optional')}
        ${fieldHtml('PAID BY *', 'paidBy', 'text', 'Name of the person who paid')}
        <div class="form-group"><label>PAYMENT APP *</label><select name="paymentApp" required><option value="">Select app</option>${apps}</select></div>
        ${fieldHtml('PAYMENT DATE & TIME *', 'paidAt', 'datetime-local')}
        ${withContact ? fieldHtml('HEADMASTER / PRINCIPAL NAME *', 'headmaster', 'text', 'Full name') + fieldHtml('MOBILE NUMBER *', 'mobile', 'tel', '10-digit number') : ''}
    </div>`;
}

function injectReceipt(form, beforeSel) {
    form.querySelector(beforeSel).insertAdjacentHTML('beforebegin', `
    <div class="receipt-field sub-card glass-subtle">
        <h4 class="sub-card-title"><i class="fa-solid fa-receipt coral-text"></i> Upload Payment Receipt *</h4>
        <input type="file" class="receipt-input" accept="image/jpeg,image/png">
        <small class="helper-text">JPG or PNG only, up to 4 MB.</small><br>
        <img class="receipt-preview" alt="Receipt preview" hidden>
    </div>`);
    const input = form.querySelector('.receipt-input');
    const preview = form.querySelector('.receipt-preview');
    input.addEventListener('change', () => {
        const file = input.files[0];
        preview.hidden = !file;
        if (file) preview.src = URL.createObjectURL(file);
    });
}

function setupForms() {
    const pay = $('#paymentForm');
    pay.querySelector('.fee-summary-strip').insertAdjacentHTML('beforebegin', extraFieldsHtml(false));
    injectReceipt(pay, '.fee-summary-strip');

    const tc = $('#tcApplicationForm');
    ['SBI Collect DU', 'Payment Date'].forEach(l => byLabel(tc, l)?.closest('.form-group')?.remove());
    tc.querySelector('.checkbox-row').insertAdjacentHTML('beforebegin', extraFieldsHtml(true));
    injectReceipt(tc, '.checkbox-row');
}

function prefillSchool() {
    if (!profile) return;
    const lock = (el, value) => {
        if (!el) return;
        if (el.tagName === 'SELECT') {
            if (![...el.options].some(o => o.value === value)) el.add(new Option(value, value));
            el.value = value;
            el.disabled = true;
        } else {
            el.value = value || '';
            el.readOnly = true;
        }
    };
    const p = $('#paymentForm'), t = $('#tcApplicationForm');
    lock(byLabel(p, 'SCHOOL UDISE'), profile.udise);
    lock(byLabel(p, 'SCHOOL NAME'), profile.name);
    lock(byLabel(p, 'MANDAL'), profile.mandal);
    lock(byLabel(t, 'UDISE'), profile.udise);
    lock(byLabel(t, 'School Name'), profile.name);
    lock(byLabel(t, 'Management'), profile.management);
    lock(byLabel(t, 'Mandal'), profile.mandal);
}

/* ---------- school: payments ---------- */
async function submitPaymentForm(form, { purpose, amount, qty }, btn) {
    const utr = val(form, 'UTR').toUpperCase();
    const paidAtLocal = val(form, 'PAYMENT DATE');
    const headmaster = val(form, 'HEADMASTER');
    const mobile = val(form, 'MOBILE');
    const paidBy = val(form, 'PAID BY');
    const paymentApp = val(form, 'PAYMENT APP');
    const txnId = val(form, 'TRANSACTION');
    const receipt = form.querySelector('.receipt-input').files[0];

    if (!utr || !paidBy || !paymentApp || !paidAtLocal || !headmaster || !mobile) {
        return alert('Please fill in all the required fields marked *.');
    }
    if (!receipt) return alert('Please upload the payment receipt (JPG or PNG).');
    if (receipt.size > MAX_RECEIPT_BYTES) return alert('Receipt must be under 4 MB.');

    const paidAtIso = new Date(paidAtLocal).toISOString();
    const fd = new FormData();
    Object.entries({ purpose, amount, qty, utr, txnId, paidBy, paymentApp, paidAt: paidAtIso, headmaster, mobile })
        .forEach(([k, v]) => fd.append(k, v));
    fd.append('receipt', receipt);

    btn.disabled = true;
    try {
        const saved = await DCEB_API.submitPayment(fd);
        const record = {
            status: saved.status, amount, utr, school: profile.name, udise: profile.udise, mandal: profile.mandal,
            hm: headmaster, mobile, purposeLabel: PURPOSE_LABEL[purpose] + (qty > 1 ? ` (${qty} books)` : ''),
            feePayable: amount, txnId, paidBy, paymentApp, paidAt: paidAtIso, submittedAt: saved.submitted_at
        };
        form.reset();
        prefillSchool();
        const preview = form.querySelector('.receipt-preview');
        if (preview) { preview.hidden = true; preview.removeAttribute('src'); }
        const fee = $('#calculatedFeeDisplay');
        if (fee) fee.textContent = '₹ 0.00';

        await loadMyPayments();
        downloadPaymentSlip(record).catch(err => alert('Could not create the slip: ' + err.message));
        alert('Payment submitted. Status: Pending admin verification.');
    } catch (err) {
        alert(err.message);
    } finally {
        btn.disabled = false;
    }
}

async function onPaymentSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const code = val(form, 'PAYMENT PURPOSE');
    if (!PURPOSE_CODE[code]) return alert('Please select a payment purpose.');
    await submitPaymentForm(form, { purpose: PURPOSE_CODE[code], amount: Number(code), qty: 1 }, e.submitter || form.querySelector('[type=submit]'));
}

async function onTcSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const qty = Math.min(50, Math.max(1, parseInt(form.querySelector('#tcBookQty').value, 10) || 1));
    await submitPaymentForm(form, { purpose: 'tc', amount: qty * 150, qty }, e.submitter || form.querySelector('[type=submit]'));
}

function slipFrom(r) {
    if (!r) return null;
    return {
        status: r.status, remarks: r.remarks, amount: Number(r.amount), utr: r.utr, school: r.school, udise: r.udise,
        mandal: r.mandal, hm: r.headmaster, mobile: r.mobile, purposeLabel: r.purpose_label, feePayable: Number(r.amount),
        txnId: r.txn_id || '', paidBy: r.paid_by, paymentApp: r.payment_app, paidAt: r.paid_at, submittedAt: r.submitted_at
    };
}

async function loadMyPayments() {
    myRows = await DCEB_API.myPayments();
    $('#mySubmissions').innerHTML = `
        <h4 class="sub-card-title"><i class="fa-solid fa-clock-rotate-left coral-text"></i> My Payment Submissions</h4>
        ${myRows.length ? myRows.map((r, i) => `
            <div class="my-sub-row">
                <div>
                    <strong>${esc(r.purpose_label)}</strong> · ${rupees(r.amount)}<br>
                    <small>UTR ${esc(r.utr)} · submitted ${fmtDate(r.submitted_at)}</small>
                    ${r.status === 'Rejected' && r.remarks ? `<br><small class="coral-text">Reason: ${esc(r.remarks)}</small>` : ''}
                </div>
                <div class="row-actions">
                    ${pill(r.status)}
                    <button class="btn btn-glass-dark btn-sm" data-action="my-slip" data-index="${i}">Slip</button>
                    <button class="btn btn-glass-dark btn-sm" data-action="my-receipt" data-id="${r.id}">Receipt</button>
                </div>
            </div>`).join('') : '<p class="subtitle">No payments submitted yet.</p>'}`;
}

function onMyClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'my-slip') downloadPaymentSlip(slipFrom(myRows[Number(btn.dataset.index)]));
    if (btn.dataset.action === 'my-receipt') showReceipt(DCEB_API.receiptUrl(btn.dataset.id), 'Payment receipt');
}

/* ---------- receipts: loaded with the session cookie, shown in a modal ---------- */
async function showReceipt(url, title) {
    try {
        const res = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) throw new Error('The receipt could not be loaded.');
        const blobUrl = URL.createObjectURL(await res.blob());
        closeModal();
        document.body.insertAdjacentHTML('beforeend', `
            <div class="modal-backdrop" id="receiptModal">
                <div class="modal glass-card">
                    <div class="modal-head"><h3>${esc(title)}</h3><button class="btn btn-glass-dark" data-close>Close</button></div>
                    <img src="${blobUrl}" alt="Payment receipt">
                </div>
            </div>`);
    } catch (err) {
        alert(err.message);
    }
}

function closeModal() {
    const m = $('#receiptModal');
    if (!m) return;
    const img = m.querySelector('img');
    if (img) URL.revokeObjectURL(img.src);
    m.remove();
}

/* ---------- public content: notices and ticker ---------- */
async function loadPublic() {
    try {
        const [notices, ticker] = await Promise.all([DCEB_API.notices(), DCEB_API.ticker()]);
        const list = $('.notice-list');
        const cls = ['border-indigo', 'border-sun', 'border-mint'];
        if (list) {
            list.innerHTML = notices.length
                ? notices.slice(0, 6).map((n, i) => `<div class="notice-item ${cls[i % 3]}"><small>${esc(n.date)}</small><p>${esc(n.text)}</p></div>`).join('')
                : '<p class="subtitle">No notices at the moment.</p>';
        }
        const marquee = $('.marquee-text');
        if (marquee) marquee.textContent = ticker.text;
    } catch {
        /* keep the static text if the server is unreachable */
    }
}

/* ---------- admin ---------- */
const stat = (label, num, cls) => `<div class="glass-card stat-card ${cls}"><div class="num">${num}</div><div class="lbl">${label}</div></div>`;

function schoolSearchBar() {
    return `<form id="schoolSearchForm" class="toolbar">
        <input name="search" placeholder="Search by school name or UDISE" value="${esc(schoolSearch)}">
        <button class="btn btn-glass-dark btn-sm" type="submit">Search</button>
    </form>`;
}

function schoolTable(rows, withActions) {
    const yes = '<span class="status-pill mint">Verified</span>';
    const no = '<span class="status-pill gray">Not verified</span>';
    return `<div class="table-responsive"><table class="data-table">
        <thead><tr><th>School</th><th>UDISE</th><th>Mandal</th><th>Exam Fee</th><th>TC Book</th><th>Overall</th>${withActions ? '<th>Action</th>' : ''}</tr></thead>
        <tbody>${rows.length ? rows.map(r => `
            <tr>
                <td><strong>${esc(r.name)}</strong></td>
                <td>${esc(r.udise)}</td>
                <td>${esc(r.mandal)}</td>
                <td>${r.exam ? yes : no}</td>
                <td>${r.tc ? yes : no}</td>
                <td>${pill(r.status)}</td>
                ${withActions ? `<td><button class="btn btn-glass-dark btn-sm" data-action="reset-pass" data-udise="${esc(r.udise)}">Reset password</button></td>` : ''}
            </tr>`).join('') : '<tr><td colspan="7">No schools found.</td></tr>'}</tbody>
    </table></div>`;
}

function pager(scope, count) {
    const off = scope === 'school' ? schoolOffset : paymentOffset;
    return `<div class="pager">
        <button class="btn btn-glass-dark btn-sm" data-action="page" data-scope="${scope}" data-dir="-1" ${off === 0 ? 'disabled' : ''}>Previous</button>
        <span>${count ? `Showing ${off + 1} to ${off + count}` : 'No more records'}</span>
        <button class="btn btn-glass-dark btn-sm" data-action="page" data-scope="${scope}" data-dir="1" ${count < PAGE_SIZE ? 'disabled' : ''}>Next</button>
    </div>`;
}

async function fetchSchools() {
    return DCEB_API.schools(`?limit=${PAGE_SIZE}&offset=${schoolOffset}&search=${encodeURIComponent(schoolSearch)}`);
}

async function overviewHtml(s) {
    const schools = await fetchSchools();
    return `
        <div class="stat-grid">
            ${stat('Total Schools', s.total, 'info')}
            ${stat('Completed', s.completed, 'ok')}
            ${stat('Partially Completed', s.partial, 'warn')}
            ${stat('Not Completed', s.not_completed, 'bad')}
            ${stat('Receipts Pending', s.pending, 'warn')}
        </div>
        <div class="admin-panel glass-card">
            <h3>School Completion Status</h3>
            ${schoolSearchBar()}
            ${schoolTable(schools, false)}
            ${pager('school', schools.length)}
        </div>`;
}

async function schoolsHtml() {
    const schools = await fetchSchools();
    return `
        <div class="admin-panel glass-card">
            <h3>Create School Login</h3>
            <form id="addSchoolForm" class="form-inline">
                <div class="form-group"><label>UDISE CODE</label><input name="udise" maxlength="11" pattern="\\d{11}" placeholder="11 digits" required></div>
                <div class="form-group"><label>SCHOOL NAME</label><input name="name" required></div>
                <div class="form-group"><label>MANDAL</label><input name="mandal" required></div>
                <div class="form-group"><label>MANAGEMENT</label><select name="management">${MANAGEMENTS.map(m => `<option>${m}</option>`).join('')}</select></div>
                <div class="form-group"><label>INITIAL PASSWORD</label><input name="password" type="password" minlength="8" required></div>
                <button class="btn btn-indigo" type="submit">Create Login</button>
            </form>
        </div>
        <div class="admin-panel glass-card">
            <h3>Registered Schools</h3>
            ${schoolSearchBar()}
            ${schoolTable(schools, true)}
            ${pager('school', schools.length)}
        </div>`;
}

async function paymentsHtml() {
    const status = paymentFilter === 'All' ? '' : `&status=${paymentFilter}`;
    adminRows = await DCEB_API.payments(`?limit=${PAGE_SIZE}&offset=${paymentOffset}${status}`);

    const filters = ['Pending', 'Verified', 'Rejected', 'All'].map(f =>
        `<button class="admin-tab ${paymentFilter === f ? 'active' : ''}" data-action="filter" data-filter="${f}">${f}</button>`).join('');

    const rows = adminRows.map((p, i) => `
        <tr>
            <td>${fmtDate(p.submitted_at)}</td>
            <td><strong>${esc(p.school)}</strong><br><small>${esc(p.udise)} · ${esc(p.mandal)}</small></td>
            <td>${esc(p.purpose_label)}<br><small>UTR ${esc(p.utr)}</small><br>
                <small>${esc(p.paid_by)} · ${esc(p.payment_app)}</small><br>
                <small>HM: ${esc(p.headmaster)} · ${esc(p.mobile)}</small></td>
            <td class="coral-text fw-bold">${rupees(p.amount)}</td>
            <td><button class="btn btn-glass-dark btn-sm" data-action="receipt" data-id="${p.id}" data-title="${esc(p.school)}">View</button></td>
            <td>${pill(p.status)}${p.remarks ? `<br><small>${esc(p.remarks)}</small>` : ''}</td>
            <td class="row-actions">
                ${p.status !== 'Verified' ? `<button class="btn btn-verify btn-sm" data-action="verify" data-id="${p.id}">Verify</button>` : ''}
                ${p.status !== 'Rejected' ? `<button class="btn btn-reject btn-sm" data-action="reject" data-id="${p.id}">Reject</button>` : ''}
                <button class="btn btn-glass-dark btn-sm" data-action="admin-slip" data-index="${i}">Slip</button>
            </td>
        </tr>`).join('');

    return `
        <div class="admin-panel glass-card">
            <h3>Payment Receipts</h3>
            <div class="filter-row">${filters}</div>
            <div class="table-responsive"><table class="data-table">
                <thead><tr><th>Submitted</th><th>School</th><th>Payment</th><th>Amount</th><th>Receipt</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="7">No receipts in this category.</td></tr>'}</tbody>
            </table></div>
            ${pager('payment', adminRows.length)}
        </div>`;
}

async function contentHtml() {
    const [notices, ticker] = await Promise.all([DCEB_API.notices(), DCEB_API.ticker()]);
    return `
        <div class="admin-panel glass-card">
            <h3>Live Ticker Text</h3>
            <form id="tickerForm" class="form-inline ticker-form">
                <div class="form-group"><label>TICKER MESSAGE (separate items with |)</label><input name="text" value="${esc(ticker.text)}" required></div>
                <button class="btn btn-teal" type="submit">Update Ticker</button>
            </form>
        </div>
        <div class="admin-panel glass-card">
            <h3>Publish a Notice</h3>
            <form id="noticeForm" class="form-inline ticker-form">
                <div class="form-group"><label>NOTICE TEXT (shown on school home page)</label><input name="text" maxlength="500" required></div>
                <button class="btn btn-gold" type="submit">Publish Notice</button>
            </form>
        </div>
        <div class="admin-panel glass-card">
            <h3>Current Notices</h3>
            ${notices.length ? notices.map(n => `
                <div class="notice-item border-indigo notice-row">
                    <div><small>${esc(n.date)}</small><p>${esc(n.text)}</p></div>
                    <button class="btn btn-reject btn-sm" data-action="del-notice" data-id="${n.id}">Delete</button>
                </div>`).join('') : '<p class="subtitle">No notices.</p>'}
        </div>`;
}

async function drawAdmin() {
    const s = await DCEB_API.summary();
    const tabs = [['overview', 'Overview'], ['payments', 'Payment Receipts'], ['schools', 'Schools'], ['content', 'News & Ticker']];

    $('#adminApp').innerHTML = `
        <div class="admin-head">
            <div>
                <span class="pill-badge"><i class="fa-solid fa-user-shield"></i> Admin Console</span>
                <h2 class="section-title">DCEB Administration Dashboard</h2>
                <p class="subtitle">Signed in as ${esc(me.name)}</p>
            </div>
            <button class="btn btn-glass-dark" data-action="logout"><i class="fa-solid fa-right-from-bracket"></i> Logout</button>
        </div>
        <div class="admin-tabs">
            ${tabs.map(([k, l]) => `<button class="admin-tab ${adminTab === k ? 'active' : ''}" data-action="tab" data-tab="${k}">
                ${l}${k === 'payments' && s.pending ? ` <span class="status-pill sun">${s.pending}</span>` : ''}</button>`).join('')}
        </div>
        <div id="adminBody"><p class="subtitle">Loading...</p></div>`;

    $('#adminBody').innerHTML = adminTab === 'overview' ? await overviewHtml(s)
        : adminTab === 'payments' ? await paymentsHtml()
        : adminTab === 'schools' ? await schoolsHtml()
        : await contentHtml();
}

async function onAdminClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action } = btn.dataset;
    try {
        if (action === 'logout') return logout();
        if (action === 'receipt') return showReceipt(DCEB_API.adminReceiptUrl(btn.dataset.id), btn.dataset.title || 'Payment receipt');
        if (action === 'admin-slip') return downloadPaymentSlip(slipFrom(adminRows[Number(btn.dataset.index)]));

        if (action === 'tab') { adminTab = btn.dataset.tab; paymentOffset = 0; schoolOffset = 0; }
        else if (action === 'filter') { paymentFilter = btn.dataset.filter; paymentOffset = 0; }
        else if (action === 'page') {
            const step = Number(btn.dataset.dir) * PAGE_SIZE;
            if (btn.dataset.scope === 'school') schoolOffset = Math.max(0, schoolOffset + step);
            else paymentOffset = Math.max(0, paymentOffset + step);
        }
        else if (action === 'verify') await DCEB_API.verifyPayment(btn.dataset.id);
        else if (action === 'reject') {
            const reason = prompt('Reason for rejection (the school will see this):');
            if (reason === null) return;
            if (!reason.trim()) return alert('Please enter a reason.');
            await DCEB_API.rejectPayment(btn.dataset.id, reason.trim());
        }
        else if (action === 'reset-pass') {
            const pw = prompt(`New password for school ${btn.dataset.udise} (at least 8 characters):`);
            if (!pw) return;
            await DCEB_API.resetSchoolPassword(btn.dataset.udise, pw);
            return alert('Password updated.');
        }
        else if (action === 'del-notice') {
            if (!confirm('Delete this notice?')) return;
            await DCEB_API.deleteNotice(btn.dataset.id);
        }
        await drawAdmin();
    } catch (err) {
        alert(err.message);
    }
}

async function onAdminSubmit(e) {
    e.preventDefault();
    const f = e.target;
    const v = n => (f.elements[n]?.value || '').trim();
    try {
        if (f.id === 'addSchoolForm') {
            await DCEB_API.createSchool({ udise: v('udise'), name: v('name'), mandal: v('mandal'), management: f.elements.management.value, password: f.elements.password.value });
            alert(`School login created. User ID: ${v('udise')}`);
        } else if (f.id === 'noticeForm') {
            await DCEB_API.addNotice(v('text'));
        } else if (f.id === 'tickerForm') {
            await DCEB_API.setTicker(v('text'));
        } else if (f.id === 'schoolSearchForm') {
            schoolSearch = v('search');
            schoolOffset = 0;
        }
        await drawAdmin();
    } catch (err) {
        alert(err.message);
    }
}

/* ---------- sign in, sign out, role switching ---------- */
async function onLogin(e) {
    e.preventDefault();
    $('#loginError').textContent = '';
    try {
        await DCEB_API.login($('#loginUser').value.trim(), $('#loginPass').value);
        me = await DCEB_API.me();
        $('#loginForm').reset();
        await applyRole();
    } catch (err) {
        $('#loginError').textContent = err.message;
    }
}

async function logout() {
    await DCEB_API.logout().catch(() => {});
    me = null;
    profile = null;
    await applyRole();
}

async function applyRole() {
    document.body.classList.toggle('is-login', !me);
    document.body.classList.toggle('is-admin', !!me && me.role === 'admin');
    $('#whoTag').textContent = me ? (me.role === 'admin' ? 'Admin' : me.name) : '';
    if (!me) { $('#adminApp').innerHTML = ''; return; }
    window.scrollTo(0, 0);

    if (me.role === 'admin') { await drawAdmin(); return; }

    profile = await DCEB_API.profile();
    prefillSchool();
    await Promise.all([loadPublic(), loadMyPayments()]);
}

/* ---------- switchTab (unchanged from your original) ---------- */
function switchTab(viewId) {
    document.querySelectorAll('.tab-view').forEach(view => view.classList.remove('active'));
    const targetView = document.getElementById(`view-${viewId}`);
    if (targetView) targetView.classList.add('active');
    document.querySelectorAll('.nav-link').forEach(link => link.classList.toggle('active', link.getAttribute('data-target') === viewId));
    document.querySelectorAll('.bottom-nav-btn').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-target') === viewId));
    const mainNav = document.getElementById('mainNav');
    if (mainNav && mainNav.classList.contains('open')) mainNav.classList.remove('open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- boot ---------- */
document.addEventListener('DOMContentLoaded', async () => {
    document.body.insertAdjacentHTML('afterbegin', LOGIN_HTML);
    $('.header-actions').insertAdjacentHTML('afterbegin', `
        <span class="who-tag" id="whoTag"></span>
        <button class="btn btn-glass-dark logout-btn" id="logoutBtn"><i class="fa-solid fa-right-from-bracket"></i> Logout</button>`);
    $('main').insertAdjacentHTML('afterend', '<div id="adminApp" class="container"></div>');
    $('#view-payment .panel-card').insertAdjacentHTML('beforeend', '<div id="mySubmissions" class="sub-card glass-subtle"></div>');
    setupForms();

    $('#mobileMenuBtn')?.addEventListener('click', () => $('#mainNav').classList.toggle('open'));
    $('#paymentPurpose').addEventListener('change', e => {
        $('#calculatedFeeDisplay').textContent = `₹ ${(Number(e.target.value) || 0).toFixed(2)}`;
    });
    $('#tcBookQty').addEventListener('input', e => {
        $('#tcAmountPaid').value = Math.max(1, parseInt(e.target.value, 10) || 1) * 150;
    });

    $('#loginForm').addEventListener('submit', onLogin);
    $('#logoutBtn').addEventListener('click', logout);
    $('#paymentForm').addEventListener('submit', onPaymentSubmit);
    $('#tcApplicationForm').addEventListener('submit', onTcSubmit);
    $('#mySubmissions').addEventListener('click', onMyClick);
    $('#adminApp').addEventListener('click', onAdminClick);
    $('#adminApp').addEventListener('submit', onAdminSubmit);
    document.addEventListener('click', e => {
        if (e.target.id === 'receiptModal' || e.target.closest('[data-close]')) closeModal();
    });

    try { me = await DCEB_API.me(); } catch { me = null; }
    await applyRole();
});
