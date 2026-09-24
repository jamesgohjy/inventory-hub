# AV Inventory Hub v7.03.3.14t — Backup Verification Setup

This feature verifies three separate recovery areas:

1. **Supabase managed database backup** — checks the official Supabase Management API for a recent completed database backup.
2. **Database integrity** — checks required Inventory Hub tables and relationship integrity.
3. **Document integrity** — checks every `inventory-documents` Storage object and verifies SHA-256 when the original source hash is available.

> Important: Supabase database backups do **not** contain Storage object file contents. This verifier confirms that invoice PDFs are currently present/readable and cryptographically matches hashed source files; it does not create an independent off-site copy of the PDFs.

## One-time setup

### 1. Run the database migration

In Supabase Dashboard → **SQL Editor**, run:

`supabase-v7-03-3-14t-backup-verification.sql`

Expected result: **Success. No rows returned.**

This creates:
- `backup_verification_runs`
- `service_backup_integrity_snapshot_v703314t()`
- `service_record_backup_verification_v703314t(...)`
- `admin_backup_verification_history_v703314t(...)`

The service functions are not available to normal browser users. Backup history is visible only to confirmed Inventory Hub Admins.

### 2. Create a Supabase Management API token

Supabase Dashboard → **Account → Access Tokens**

Create a fine-grained token that can read database backups. It must have the backup-read permission required by the Supabase Management API.

Copy it once and keep it private.

### 3. Create/use a Supabase Secret API key

Supabase Dashboard → **Project Settings → API Keys**

Use a server-side **secret key** beginning with `sb_secret_`.

Do **not** use the browser publishable key for this job.

Do **not** place the secret key in:
- `config.js`
- GitHub source files
- browser JavaScript
- screenshots/chat messages

### 4. Add GitHub Actions secrets

GitHub repository → **Settings → Secrets and variables → Actions**

Add:

- `SUPABASE_ACCESS_TOKEN` — the Supabase Management API access token.
- `SUPABASE_SECRET_KEY` — the project server-side secret API key.

The project URL is already a non-secret workflow value.

### 5. Run the first verification manually

GitHub repository → **Actions → Inventory Hub Backup Verification → Run workflow**

A successful setup should create a new row in `backup_verification_runs`.

The workflow then runs automatically every day at approximately **02:30 Singapore time**.

## Status rules

### Managed database backup

- **PASS** — latest completed backup is no more than 36 hours old.
- **WARN** — latest completed backup is 36–60 hours old.
- **FAIL** — no completed backup is found, it is older than 60 hours, or the Management API cannot be read.

### Database integrity

**FAIL** if a required table is missing or a core inventory relationship is orphaned.

Checks include:
- purchase lines → purchases
- purchase lines → Master Items
- serials → purchase lines
- serials → Master Items
- adjustments → Master Items
- maintenance → Master Items
- duplicate serial groups

### Document integrity

- **FAIL** — missing/unreadable Storage objects, zero-byte files, or SHA-256 mismatch.
- **WARN** — files exist but some older documents do not have a stored SHA-256, or orphan Storage objects exist.
- **PASS** — required files are present and every hashed file matches.

## GitHub artifact

Each configured run stores only a small JSON verification report for 30 days.

The artifact contains status/count metadata only. It does **not** contain invoice PDF contents.

## Recovery limitation

This verification feature is not an independent Storage backup. For disaster recovery from complete Supabase project deletion, invoice PDFs require an off-site Storage copy in addition to the database backup.
