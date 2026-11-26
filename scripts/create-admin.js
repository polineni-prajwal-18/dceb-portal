import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from '../src/db.js';

const [username, name, password] = process.argv.slice(2);

if (!username || !name || !password || password.length < 10 || /^\d+$/.test(username)) {
    console.error('Usage: node scripts/create-admin.js <username> "<Full name>" <password (10+ characters)>');
    console.error('The username must not be only digits.');
    process.exit(1);
}

const hash = await bcrypt.hash(password, 10);
await pool.query(
    `INSERT INTO admins (username, name, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (username) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash`,
    [username, name, hash]
);
console.log(`Admin "${username}" is ready.`);
await pool.end();
