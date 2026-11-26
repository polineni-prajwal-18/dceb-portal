import { randomUUID } from 'crypto';
import { uploadToDrive, deleteFromDrive, streamFromDrive } from './drive.js';

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png' };

/** Detects JPEG or PNG from the file's first bytes. Returns the MIME type or null. */
export function sniffImage(buf) {
    if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    if (buf.length > 4 && buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return 'image/png';
    return null;
}

/** Saves a receipt to Google Drive and returns the Drive file ID. */
export async function saveReceipt(buffer, mime, udise, utr) {
    const name = `${udise}_${utr}_${randomUUID()}.${EXT[mime]}`;
    return uploadToDrive(name, mime, buffer);
}

export async function removeReceipt(driveId) {
    await deleteFromDrive(driveId);
}

/** Streams a receipt from Drive to the browser. Nothing is written to the server's disk. */
export async function sendReceipt(res, row) {
    const stream = await streamFromDrive(row.receipt_drive_id);
    res.set({ 'Content-Type': row.receipt_mime, 'Cache-Control': 'private, no-store' });
    stream.on('error', () => res.destroy());
    stream.pipe(res);
}
