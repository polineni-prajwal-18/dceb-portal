import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { query } from '../db.js';
import { setSession, clearSession, requireAuth } from '../auth.js';

const router = Router();

// Used when the user ID does not exist, so response time is similar either way
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many sign-in attempts. Please try again after 15 minutes.' }
});

router.post('/login', loginLimiter, async (req, res) => {
    const userId = String(req.body.userId || '').trim();
    const password = String(req.body.password || '');
    if (!userId || !password) {
        return res.status(400).json({ error: 'User ID and password are required' });
    }

    let account = null;
    const admin = await query('SELECT id, name, password_hash FROM admins WHERE username = $1', [userId]);
    if (admin.rows[0]) {
        account = { ...admin.rows[0], role: 'admin', sub: admin.rows[0].id };
    } else {
        const school = await query('SELECT udise, name, password_hash FROM schools WHERE udise = $1', [userId]);
        if (school.rows[0]) account = { ...school.rows[0], role: 'school', sub: school.rows[0].udise };
    }

    const ok = await bcrypt.compare(password, account ? account.password_hash : DUMMY_HASH);
    if (!account || !ok) {
        return res.status(401).json({ error: 'Invalid User ID or password' });
    }

    setSession(res, account);
    res.json({ role: account.role, name: account.name });
});

router.get('/me', requireAuth('school', 'admin'), (req, res) => {
    res.json({ role: req.user.role, name: req.user.name, id: req.user.sub });
});

router.post('/logout', (req, res) => {
    clearSession(res);
    res.json({ ok: true });
});

export default router;
