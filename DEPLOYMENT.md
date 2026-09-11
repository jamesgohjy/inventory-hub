# Deployment checklist

## Recommended production setup

**Frontend:** GitHub Pages or Vercel  
**Database/Auth/File storage:** Supabase

This keeps the app online and shareable without requiring software installation on each PC.

## Before team rollout

- Run `supabase-schema.sql`.
- Change `config.js` to Supabase mode.
- Create one account per teammate (do not share one login if you want accurate audit history).
- Test one searchable PDF and one scanned PDF.
- Verify a repeated SKU adds to Total Purchased.
- Verify a Damaged/Missing adjustment reduces Current Inventory only.
- Verify original PDFs can be opened and downloaded.
- Verify a duplicate supplier + invoice number is blocked.
- Back up/export the database before a large initial import.

## Suggested acceptance test

1. Import an invoice containing Projector 123, quantity 2.
2. Import a different invoice/date containing Projector 123, quantity 3.
3. Inventory should show Total Purchased = 5 and Current Inventory = 5.
4. Add Missing adjustment = 1.
5. Inventory should show Total Purchased = 5 and Current Inventory = 4.
6. Search by Projector 123, invoice number and supplier.
7. Open both original PDFs.
8. Confirm the audit history contains the import and adjustment with user/date/time.
