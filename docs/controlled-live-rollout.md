# Controlled live rollout

This runbook preserves the certified production baseline while new invoices are imported.

## Normal live operation

1. Import only an Invoice or Tax Invoice PDF.
2. Verify supplier, invoice number, date, reference, equipment lines, quantities, prices and serials against the PDF before selecting **Confirm & save**.
3. Do not save an item whose evidence is blank, conflicting, obscured, stamped or otherwise uncertain. Leave it in Review.
4. Treat an exact-PDF or supplier/invoice duplicate warning as a stop condition. Do not use an override merely to bypass a warning.
5. After saving, reopen the document once and confirm the PDF link and audit entry are present.

## First 30 production imports

For each of the first 30 new live imports, record a quick human outcome in the existing audit history or change-control record:

| Check | Pass condition |
| --- | --- |
| Source fidelity | Saved header and each saved equipment field match the PDF. |
| Review safety | Uncertain fields are blank or remain in Review; no value is guessed. |
| Duplicate safety | No duplicate invoice, line or serial is introduced. |
| Persistence | The document survives a refresh and its PDF opens. |
| Traceability | The audit entry identifies the person and action. |

Pause broad rollout and investigate if any wrong field is saved, a duplicate escapes detection, a saved document cannot be reopened, or the audit record is missing.

## New supplier or unfamiliar layout

1. Run the first representative PDF in Shadow / Review without saving.
2. Compare all populated fields with the source PDF.
3. Promote no supplier-specific rule from a single invoice. Require repeatable, source-supported evidence and regression coverage.
4. Keep every ambiguous field in Review.

## Changes after go-live

Before deploying parser, OCR, database or document-storage changes:

1. Run the automated regression suite.
2. Run representative historical PDF cases in Shadow.
3. Perform one safe save → refresh → reopen QA check when persistence behaviour could be affected.
4. Verify role boundaries: Admin diagnostics, Editor import restrictions, Viewer no-import restrictions.
5. Record the deployed revision and the observed result.

## Performance watch

The certified six-page Concept baseline is **3m42s** on the deployed recovery gate. Investigate a sustained increase above **4m30s** or any processing stall, but do not trade evidence safety for speed.

## Periodic checks

| Cadence | Check |
| --- | --- |
| Weekly during early rollout | Review new imports and unresolved Review items. |
| After every release | Regression, Shadow rerun and release-specific smoke check. |
| Monthly | Verify database/document backup and restore procedure. |
| Quarterly | Recheck least-privilege roles and audit retention. |
