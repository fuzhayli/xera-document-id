# Code Map

This project is a small Node + SQLite application. It deliberately avoids a
build step so it can run from a NAS/shared machine with a single Node process.

## Server

| File | Responsibility |
|---|---|
| `server/index.js` | HTTP routes, SQLite/libSQL schema setup, document/part workflow transactions, auto-publish review notifications, revision approval workflows and auth/session handling. |
| `server/rules.js` | Document format rules, part rule metadata and role/permission constants shared by server workflows. |
| `server/http-utils.js` | Request body parsing, JSON/binary/static responses and HTTP error construction. |
| `server/workbook.js` | Excel-compatible workbook generation for document, part and custom part exports. |

Important server sections:

- `server/rules.js`: single source for document number, filename, part rule and role constants.
- Auth helpers: signup, login, session token validation and split admin permission checks.
- Request helpers: document preview, document ID auto-publish, admin review notification OK/edit and legacy pending approval endpoints.
- Revision helpers: revision request creation, admin approval, archive copy and current revision update.
- Part helpers: Excel seed import, SOP part number preview, reserved sequence allocation, part auto-publish and admin review notification OK/edit.
- Query helpers: current document list, archive list, managed user list.
- HTTP helpers: static file serving, JSON/binary responses and content types.

## Frontend

| File | Responsibility |
|---|---|
| `public/login.html`, `public/login.js` | Login screen and redirect to Document List by default. |
| `public/signup.html`, `public/signup.js` | Self-service user signup for `@xera.com.tr` emails. |
| `public/index.html`, `public/app.js` | User Panel and Document ID Request form. |
| `public/documents.html`, `public/documents.js` | Main landing page, searchable current documents, request modal and revision request button. |
| `public/part-request.html`, `public/part-request.js` | SOP compliant Part List Request form and user's part request history. |
| `public/parts.html`, `public/parts.js` | Searchable Parts List seeded from Excel plus Screw & Nut reference tab. |
| `public/admin.html`, `public/admin.js` | Admin review screen with auto-published record notifications, legacy pending queues, permission-based sections, revision approvals, official documents, sequences and audit log. |
| `public/users.html`, `public/users.js` | User Permissions Admin management and password reset. |
| `public/archive.html`, `public/archive.js` | Archived old revisions. |
| `public/deleted-items.html`, `public/deleted-items.js` | Deleted records and Re-requestable Codes & IDs admin workflow. |
| `public/released-part-codes.html` | Redirect-only compatibility URL for the Re-requestable Codes & IDs view. |
| `public/ui.js` | Shared app chrome plus `window.XeraUi` API, formatting, escaping, status and scoped-search helpers for protected pages. |
| `public/styles.css` | Shared layout and UI styling. |

## Edit Notes

- Add or change document formats in `CATEGORY_RULES` first.
- Keep backend validation authoritative; frontend checks are only user feedback.
- Do not show existing passwords. User Permissions Admins can only set a new password.
- Revision updates keep `document_no` stable, update only `revision` and filename, and archive the previous current row.
