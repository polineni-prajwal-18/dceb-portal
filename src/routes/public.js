import { Router } from 'express';
import { query } from '../db.js';

const router = Router();
const DEFAULT_TICKER = 'Mission March 2027 Action Plan released | Payment Portal for Exam & TC Fees active for Academic Year 2026-27';

router.get('/notices', async (req, res) => {
    const { rows } = await query(
        'SELECT id, notice_date AS date, text FROM notices ORDER BY id DESC LIMIT 20'
    );
    res.json(rows);
});

router.get('/ticker', async (req, res) => {
    const { rows } = await query("SELECT value FROM settings WHERE key = 'ticker'");
    res.json({ text: rows[0]?.value || DEFAULT_TICKER });
});

export default router;
