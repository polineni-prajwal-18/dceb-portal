import jwt from 'jsonwebtoken';

export const COOKIE = 'dceb_session';
const isProd = process.env.NODE_ENV === 'production';
const cookieOpts = { httpOnly: true, secure: isProd, sameSite: 'strict', path: '/' };

export function setSession(res, user) {
    const token = jwt.sign(
        { sub: String(user.sub), role: user.role, name: user.name },
        process.env.JWT_SECRET,
        { expiresIn: '8h', algorithm: 'HS256' }
    );
    res.cookie(COOKIE, token, { ...cookieOpts, maxAge: 8 * 60 * 60 * 1000 });
}

export function clearSession(res) {
    res.clearCookie(COOKIE, cookieOpts);
}

/** Usage: requireAuth('admin') or requireAuth('school', 'admin') */
export function requireAuth(...roles) {
    return (req, res, next) => {
        try {
            const user = jwt.verify(req.cookies?.[COOKIE] || '', process.env.JWT_SECRET, {
                algorithms: ['HS256']
            });
            if (roles.length && !roles.includes(user.role)) {
                return res.status(403).json({ error: 'You do not have access to this page' });
            }
            req.user = user;
            next();
        } catch {
            res.status(401).json({ error: 'Please sign in again' });
        }
    };
}
