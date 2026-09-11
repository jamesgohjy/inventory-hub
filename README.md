# Inventory Hub

A browser-based inventory system designed around the requested workflow:

- Manual add / edit / delete of Master SKUs
- PDF drag-and-drop import
- Searchable standardised database
- OCR fallback for scanned PDFs
- Review before save
- Duplicate invoice protection
- Same SKU purchased on different invoices adds to Total Purchased
- Current Inventory = Total Purchased - manual adjustments
- Adjustment reasons: Damaged / Missing / Disposed / Other
- Original PDF view/download
- Audit history: who changed what and when
- No location, assigned person/department, current status, or full warehouse movement module

## Data model

Master SKU → many Purchase Line Items → one Purchase/Invoice → one PDF document.
A Master SKU may also have many serial numbers and many inventory adjustments.

The app intentionally keeps two quantities:

- **Total Purchased**: permanent sum of purchase quantities.
- **Current Inventory**: Total Purchased minus adjustments.

## Run immediately (demo mode)

1. Open `config.js` and leave `mode: 'local'`.
2. Serve this folder with any static web server, or publish it to GitHub Pages.
3. Open `index.html` through the web server.

Demo mode stores records in the browser and stores PDF blobs in IndexedDB. It is useful for testing but is **not shared across teammates**.

## Production / team-sharing mode

The production design uses Supabase for PostgreSQL, login, PDF storage and a central audit log.

1. Create a Supabase project.
2. In Supabase → SQL Editor, run `supabase-schema.sql`.
3. In Supabase → Authentication, enable Email authentication.
4. Copy your project URL and anon key.
5. Edit `config.js`:

```js
window.INVENTORY_CONFIG = {
  appName: 'Inventory Hub',
  mode: 'supabase',
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR_ANON_KEY'
};
```

6. Publish this folder to GitHub Pages, Netlify, Vercel, Cloudflare Pages, or another static host.
7. Team members sign in with their own email so audit entries can record the user.

The Supabase anon key is intended for client-side apps; security is provided by Row Level Security policies in `supabase-schema.sql`. Do not put a Supabase service-role key in this app.

## PDF parser behaviour

The parser first extracts embedded PDF text. If too little text is found, it renders the PDF page(s) and uses Tesseract.js OCR in the browser. It then standardises supplier terminology into the same fields.

Supplier-specific parsing rules are included for the two sample invoice styles supplied during design, with a generic fallback for future suppliers. Every import is editable before save because invoice layouts and OCR quality vary.

## Duplicate logic

- Same standardised supplier + invoice number → block as likely duplicate.
- Same SKU/model on another invoice/date → legitimate additional purchase; add quantity to the Master SKU.
- Same serial number on another item/purchase → production database rejects the duplicate serial number and the user should review it.

## Important implementation note

A generic invoice parser cannot guarantee perfect extraction from every supplier layout. This application therefore follows a safe workflow: **Extract → Standardise → Review → Save**, rather than silently writing OCR results into live inventory.
