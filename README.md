# DCEB Portal

School payment portal for the District Common Examination Board. Schools upload payment receipts, the admin verifies them, and each payment gets a PDF slip. Receipts are stored in Google Drive. Records are stored in PostgreSQL (Neon on Vercel).

## Part A: Put the frontend pages in place

This zip contains the backend and the new frontend scripts. It does not contain your `index.html` and `style.css`, because those are yours.

1. Copy your current `index.html` into `public/`.
2. In `public/index.html`, replace the bottom script tag `<script src="script.js"></script>` with these five lines, in this order:
   ```html
   <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
   <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"></script>
   <script src="slip.js"></script>
   <script src="api.js"></script>
   <script src="script.js"></script>
   ```
3. Copy your current `style.css` into `public/`, then open `style-additions.css` and paste its entire contents at the end of `style.css`. After that, delete `style-additions.css` from `public/`.

## Part B: Set up Google Drive (one time)

1. In Google Cloud Console, create a project and enable the **Google Drive API**.
2. Go to **IAM & Admin → Service Accounts → Create service account**. On its **Keys** tab, add a **JSON** key and download it.
3. In Google Drive (needs Google Workspace), create a **Shared Drive** named `DCEB Receipts`. Open **Manage members** and add the service account's email (ends in `iam.gserviceaccount.com`) as **Content manager**.
4. Open that folder in the browser. The folder ID is the long text after `/folders/` in the address bar.

## Part C: Set up the database on Neon

1. In Vercel, go to **Storage → Create Database → Neon Postgres** and connect it to your project. This creates `DATABASE_URL`.
2. Open the Neon console, go to **SQL Editor**, paste the entire contents of `db/schema.sql`, and click **Run**.

## Part D: Run on your computer (optional, for testing)

1. Install Node.js 20 or newer.
2. Create a `.env` file from `.env.example`. Use the Neon **pooled** connection string as `DATABASE_URL`. Put the service account JSON in `secrets/dceb-service-account.json`.
3. In the project folder, run `npm install`, then `npm start`.
4. Open `http://localhost:3000`.

## Part E: Deploy on Vercel

1. Upload the project to a **private** GitHub repository. Use the **Add file → Upload files** button on the repo page, and drag in the project contents. Do **not** upload `.env` or the `secrets/` folder. The `.gitignore` already excludes them, but check that they are absent in GitHub.
2. In Vercel, click **Add New → Project**, import the repository, and leave the framework as **Other**.
3. Under **Environment Variables**, add:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Neon pooled connection string (usually added automatically) |
   | `JWT_SECRET` | A random string of 32+ characters |
   | `GOOGLE_SERVICE_ACCOUNT_JSON` | The entire contents of the service account JSON file, on one line |
   | `DRIVE_RECEIPTS_FOLDER_ID` | The folder ID from Part B |
   | `NODE_ENV` | `production` |
   | `DB_POOL_MAX` | `1` |

   To generate a JWT secret on your computer: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

4. Click **Deploy**.

## Part F: Create the admin account

Admin accounts are not created on the website. From your computer, with `DATABASE_URL` set in `.env` to the Neon string:

```
npm run create-admin -- admin "DCEB Administrator" "YourStrongPassword!2026"
```

Expected output: `Admin "admin" is ready.`

## Part G: Create school logins

1. Sign in on the website as `admin`.
2. Open the **Schools** tab, fill in the form (UDISE code, school name, mandal, management, and an initial password of 8+ characters), and click **Create Login**.
3. The school signs in with its UDISE code and that password.

## Testing checklist

- [ ] Admin signs in and the dashboard loads.
- [ ] A school is created from the Schools tab.
- [ ] The school signs in, submits a payment with a JPG or PNG receipt, and a PDF slip downloads.
- [ ] The receipt appears in the `DCEB Receipts` folder in Drive.
- [ ] The admin opens the payment, views the receipt, and verifies or rejects it.
- [ ] The school sees the new status in **My Payment Submissions**.

## Troubleshooting

- **500 error on the first request:** check that `DATABASE_URL` is set and the schema has run in Neon.
- **Receipt upload fails:** check that the service account is a Content manager on the Shared Drive and that `DRIVE_RECEIPTS_FOLDER_ID` is correct.
- **Login always fails:** the admin account was created in a different database. Run Part F again with the Neon connection string.
- **Changes don't appear on Vercel:** each push to GitHub redeploys. Use **Redeploy** if you changed environment variables.
