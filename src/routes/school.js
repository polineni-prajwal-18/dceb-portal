import { Router } from 'express';
import multer from 'multer';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { saveReceipt, removeReceipt, sniffImage, sendReceipt } from '../receipts.js';

const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 4 * 1024 * 1024, files: 1 }
});

const PURPOSES = {
    tc: 'TC Book Fee',
    exam: 'SA-1 & SA-2 Examination Fee',
    premium: 'SSC Pre-Public & Model Papers Fee'
};
const UUID = /^[0-9a-f-]{36}$/i;

router.get('/profile', requireAuth('school'), async (req, res) => {
    const { rows } = await query(
        'SELECT udise, name, mandal, management FROM schools WHERE udise = $1',
        [req.user.sub]
    );
    res.json(rows[0]);
});

router.get('/payments', requireAuth('school'), async (req, res) => {
    const { rows } = await query(
        `SELECT p.id, p.udise, s.name AS school, s.mandal, p.purpose_label, p.amount,
                p.utr, p.txn_id, p.paid_by, p.payment_app, p.paid_at, p.headmaster, p.mobile,
                p.status, p.remarks, p.submitted_at
         FROM payments p
         JOIN schools s ON s.udise = p.udise
         WHERE p.udise = $1
         ORDER BY p.submitted_at DESC
         LIMIT 200`,
        [req.user.sub]
    );
    res.json(rows);
});

router.post('/payments', requireAuth('school'), upload.single('receipt'), async (req, res) => {
    const b = req.body;

    const purpose = String(b.purpose || '');
    if (!PURPOSES[purpose]) return res.status(400).json({ error: 'Choose a valid payment purpose' });

    const amount = Number(b.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) {
        return res.status(400).json({ error: 'Enter a valid amount' });
    }

    const utr = String(b.utr || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6,30}$/.test(utr)) {
        return res.status(400).json({ error: 'UTR must be 6 to 30 letters or digits' });
    }

    const paidAt = new Date(b.paidAt);
    if (Number.isNaN(paidAt.getTime())) {
        return res.status(400).json({ error: 'Enter a valid payment date and time' });
    }

    const headmaster = String(b.headmaster || '').trim();
    const paidBy = String(b.paidBy || '').trim();
    const paymentApp = String(b.paymentApp || '').trim();
    const mobile = String(b.mobile || '').trim();
    const txnId = String(b.txnId || '').trim() || null;
    if (!headmaster || !paidBy || !paymentApp) {
        return res.status(400).json({ error: 'Please fill in all required fields' });
    }
    if (!/^\d{10}$/.test(mobile)) return res.status(400).json({ error: 'Mobile number must be 10 digits' });

    const qty = purpose === 'tc' ? Math.min(50, Math.max(1, parseInt(b.qty, 10) || 1)) : 1;

    if (!req.file) return res.status(400).json({ error: 'Upload the payment receipt (JPG or PNG)' });
    const mime = sniffImage(req.file.buffer);
    if (!mime) return res.status(400).json({ error: 'Receipt must be a JPG or PNG image' });

    const label = qty > 1 ? `${PURPOSES[purpose]} (${qty} books)` : PURPOSES[purpose];

    // Receipt goes to Google Drive. Only its file ID is stored in the database.
    const driveId = await saveReceipt(req.file.buffer, mime, req.user.sub, utr);

    try {
        const { rows } = await query(
            `INSERT INTO payments
                (id, udise, purpose, purpose_label, amount, utr, txn_id, paid_by, payment_app,
                 paid_at, headmaster, mobile, qty, receipt_drive_id, receipt_mime)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
             RETURNING id, status, submitted_at`,
            [req.user.sub, purpose, label, amount, utr, txnId, paidBy, paymentApp,
             paidAt.toISOString(), headmaster, mobile, qty, driveId, mime]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        await removeReceipt(driveId).catch(() => {});   // don't leave orphan files in Drive
        if (err.code === '23505') {
            return res.status(409).json({ error: 'This UTR number has already been submitted' });
        }
        throw err;
    }
});

router.get('/payments/:id/receipt', requireAuth('school'), async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const { rows } = await query(
        'SELECT receipt_drive_id, receipt_mime FROM payments WHERE id = $1 AND udise = $2',
        [req.params.id, req.user.sub]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    await sendReceipt(res, rows[0]);
});

export default router;
