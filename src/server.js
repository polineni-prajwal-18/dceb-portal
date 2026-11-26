import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import schoolRoutes from './routes/school.js';
import adminRoutes from './routes/admin.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be set and be at least 32 characters long');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.set('trust proxy', 1);
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
            imgSrc: ["'self'", 'data:', 'blob:'],
            connectSrc: ["'self'"]
        }
    }
}));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/school', schoolRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', publicRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Local only: Vercel serves the public folder itself
if (!process.env.VERCEL) {
    app.use(express.static(path.join(__dirname, '..', 'public')));
}

// Error handler (must have 4 arguments)
app.use((err, req, res, next) => {
    if (err.name === 'MulterError') {
        const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Receipt must be under 4 MB' : 'Upload failed';
        return res.status(400).json({ error: msg });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

if (!process.env.VERCEL) {
    const port = Number(process.env.PORT || 3000);
    app.listen(port, () => console.log(`DCEB portal running on http://localhost:${port}`));
}

export default app;
