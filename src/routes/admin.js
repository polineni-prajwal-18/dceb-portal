import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { sendReceipt } from '../receipts.js';

const router = Router();
router.use(requireAuth('admin'));

const UUID = /^[0-9a-f-]{36}$/i;
const MANAGEMENTS = ['Government', 'ZPP / MPP', 'Municipal', 'Private Aided', 'Private Unaided'];

const clamp = (v, min, max, fallback) => {
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? fallback : Math.min(max, Math.max(min, n));
};

// Works out each school's exam and TC book status from verified payments only
const SCHOOL_STATUS_CTE = `
WITH st AS (
    SELECT s.udise, s.name, s.mandal, s.management,
        COALESCE(bool_or(p.purpose IN ('exam', 'premium') AND p.status = 'Verified'), false) AS exam,
        COALESCE(bool_or(p.purpose = 'tc' AND p.status = 'Verified'), false) AS tc
    FROM schools s
    LEFT JOIN payments p ON p.udise = s.udise
    GROUP BY s.udise
)`;

router.get('/summary', async (req, res) => {
    const { rows } = await query(`${SCHOOL_STATUS_CTE}
        SELECT
            count(*)::int AS total,
            count(*) FILTER (WHERE exam AND tc)::int AS completed,
            count(*) FILTER (WHERE (exam OR tc) AND NOT (exam AND tc))::int AS partial,
            count(*) FILTER (WHERE NOT exam AND NOT tc)::int AS not_completed,
            (SELECT count(*)::int FROM payments WHERE status = 'Pending') AS pending
        FROM st`);
    res.json(rows[0]);
});

router.get('/schools', async (req, res) => {
    const limit = clamp(req.query.limit, 1, 200, 50);
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const search = `%${String(req.query.search || '').trim()}%`;

    const { rows } = await query(`${SCHOOL_STATUS_CTE}
        SELECT udise, name, mandal, management, exam, tc,
            CASE WHEN exam AND tc THEN 'Completed'
                 WHEN exam OR tc THEN 'Partially completed'
                 ELSE 'Not completed' END AS status
        FROM st
        WHERE name ILIKE $1 OR udise LIKE $1
        ORDER BY name
        LIMIT $2 OFFSET $3`, [search, limit, offset]);
    res.json(rows);
});

router.post('/schools', async (req, res) => {
    const udise = String(req.body.udise || '').trim();
    const name = String(req.body.name || '').trim();
    const mandal = String(req.body.mandal || '').trim();
    const management = String(req.body.management || '');
    const password = String(req.body.password || '');

    if (!/^\d{11}$/.test(udise)) return res.status(400).json({ error: 'UDISE code must be exactly 11 digits' });
    if (!name || !mandal) return res.status(400).json({ error: 'School name and mandal are required' });
    if (!MANAGEMENTS.includes(management)) return res.status(400).json({ error: 'Choose a valid management type' });
    if (password.length < 8) return res.status(400).json({ error: 'Initial password must be at least 8 characters' });

    const hash = await bcrypt.hash(password, 10);
    try {
        await query(
            'INSERT INTO schools (udise, name, mandal, management, password_hash) VALUES ($1, $2, $3, $4, $5)',
            [udise, name, mandal, management, hash]
        );
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'A school with this UDISE code already exists' });
        throw err;
    }
    res.status(201).json({ udise, name });
});

router.put('/schools/:udise/password', async (req, res) => {
    const password = String(req.body.password || '');
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const hash = await bcrypt.hash(password, 10);
    const { rowCount } = await query('UPDATE schools SET password_hash = $1 WHERE udise = $2', [hash, req.params.udise]);
    if (!rowCount) return res.status(404).json({ error: 'School not found' });
    res.json({ ok: true });
});

router.get('/payments', async (req, res) => {
    const status = ['Pending', 'Verified', 'Rejected'].includes(req.query.status) ? req.query.status : null;
    const limit = clamp(req.query.limit, 1, 200, 50);
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

    const { rows } = await query(
        `SELECT p.id, p.udise, s.name AS school, s.mandal, p.purpose_label, p.amount,
                p.utr, p.txn_id, p.paid_by, p.payment_app, p.paid_at, p.headmaster, p.mobile,
                p.status, p.remarks, p.submitted_at, p.reviewed_at
         FROM payments p
         JOIN schools s ON s.udise = p.udise
         WHERE ($1::text IS NULL OR p.status = $1)
         ORDER BY p.submitted_at DESC
         LIMIT $2 OFFSET $3`,
        [status, limit, offset]
    );
    res.json(rows);
});

router.post('/payments/:id/verify', async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const { rows } = await query(
        `UPDATE payments
         SET status = 'Verified', remarks = '', reviewed_at = now(), reviewed_by = $2
         WHERE id = $1
         RETURNING id, status`,
        [req.params.id, req.user.sub]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Payment not found' });
    res.json(rows[0]);
});

router.post('/payments/:id/reject', async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const reason = String(req.body.reason || '').trim();
    if (!reason || reason.length > 300) {
        return res.status(400).json({ error: 'Enter a reason of up to 300 characters' });
    }
    const { rows } = await query(
        `UPDATE payments
         SET status = 'Rejected', remarks = $2, reviewed_at = now(), reviewed_by = $3
         WHERE id = $1
         RETURNING id, status`,
        [req.params.id, reason, req.user.sub]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Payment not found' });
    res.json(rows[0]);
});

router.get('/payments/:id/receipt', async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const { rows } = await query(
        'SELECT receipt_drive_id, receipt_mime FROM payments WHERE id = $1',
        [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    await sendReceipt(res, rows[0]);
});

router.post('/notices', async (req, res) => {
    const text = String(req.body.text || '').trim();
    if (!text || text.length > 500) return res.status(400).json({ error: 'Notice must be 1 to 500 characters' });
    const date = new Date().toLocaleDateString('en-IN', { month: 'short', day: '2-digit', year: 'numeric' });
    const { rows } = await query(
        'INSERT INTO notices (notice_date, text) VALUES ($1, $2) RETURNING id, notice_date AS date, text',
        [date, text]
    );
    res.status(201).json(rows[0]);
});

router.delete('/notices/:id', async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
    await query('DELETE FROM notices WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
});

router.put('/ticker', async (req, res) => {
    const text = String(req.body.text || '').trim();
    if (!text || text.length > 500) return res.status(400).json({ error: 'Ticker must be 1 to 500 characters' });
    await query(
        `INSERT INTO settings (key, value) VALUES ('ticker', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [text]
    );
    res.json({ text });
});

export default router;
