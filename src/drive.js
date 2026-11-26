import { google } from 'googleapis';
import { Readable } from 'stream';

// On Vercel the key comes from GOOGLE_SERVICE_ACCOUNT_JSON. Locally it comes from a file.
const auth = new google.auth.GoogleAuth({
    credentials: process.env.GOOGLE_SERVICE_ACCOUNT_JSON
        ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
        : undefined,
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ? undefined : process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
    scopes: ['https://www.googleapis.com/auth/drive']
});
const drive = google.drive({ version: 'v3', auth });

/** Uploads a file to the receipts folder and returns its Drive file ID. */
export async function uploadToDrive(name, mimeType, buffer) {
    const { data } = await drive.files.create({
        requestBody: { name, parents: [process.env.DRIVE_RECEIPTS_FOLDER_ID] },
        media: { mimeType, body: Readable.from(buffer) },
        fields: 'id',
        supportsAllDrives: true
    });
    return data.id;
}

/** Deletes a file from Drive (used when a payment fails to save). */
export async function deleteFromDrive(fileId) {
    await drive.files.delete({ fileId, supportsAllDrives: true });
}

/** Returns a readable stream of the file's contents. */
export async function streamFromDrive(fileId) {
    const { data } = await drive.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream' }
    );
    return data;
}
