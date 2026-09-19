# Google Sheets ACL (reporting export)

Sheets is **reporting/export only**. Prisma/DB remains the source of truth.

## Required sharing

Share the spreadsheet **only** with:

1. The service account email (`GOOGLE_SERVICE_ACCOUNT_EMAIL`) — Editor
2. Named human operators who need to view reports

## Do NOT

- Make the spreadsheet public (“Anyone with the link”)
- Publish to the web
- Commit `GOOGLE_PRIVATE_KEY` or service-account JSON to git
- Expose spreadsheet IDs or credentials via API responses or logs

## Verification checklist

- [ ] Spreadsheet sharing list contains only intended emails + the service account
- [ ] Link sharing is **Restricted**
- [ ] Service account has least privilege (Sheets scope only; no Drive-wide sharing of unrelated files)
- [ ] `.env` is gitignored; production secrets live in the host secret store

Formula injection: user-controlled strings written to cells are sanitized
(see `sanitizeSheetCell`) so values starting with `=`, `+`, `-`, `@` cannot execute as formulas.
