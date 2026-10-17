# Draftly

A lightweight collaborative document editor built for the Ajaia Full Stack Product Engineer take-home.
Rich-text documents, file import, sharing with people and with teams, trash and categories, behind a real
email and password login.

**Live app:** _paste the Render URL here_

## Demo accounts

All three use the password `demo1234`. The login screen has one-click buttons for them.

| Account | What to try |
| --- | --- |
| alice@demo.com | Owns documents and the team "Product Squad". Share a document with Bob or with the team. |
| bob@demo.com | Member of Product Squad. Sees team documents under "Shared with me". |
| carol@demo.com | Has a pending invitation to Product Squad. Accept it and the team documents appear. |

You can also create your own account from "Create account". Signing up does not log you in: you are returned to the
log in tab with your email filled in, which confirms the account works.

**Passwords** must have at least 8 characters with an uppercase letter, a lowercase letter, a number and a symbol.
The form shows this as one line, has a show/hide button, and checks the email format (it also catches typos such as
`gmial.com`). The server enforces the same rules. The demo accounts use `demo1234`, which is only accepted for
logging in; choosing it as a new password is rejected.

**Continue with Google:** the login and signup tabs have a "Continue with Google" button. It needs a free Google
OAuth client id, so it is off until you set one: in Google Cloud Console create an OAuth client of type "Web
application", add your app URLs (for example `http://localhost:5173`, `http://localhost:3000` and the Render URL) under
"Authorized JavaScript origins", then start the server with `GOOGLE_CLIENT_ID=<id>` (on Render, add it as an
environment variable). The server verifies the Google token, checks it was issued for this app and that Google
verified the email, then signs in the account with that email, creating it on first use. Without the variable the
button explains that Google sign-in is not set up.

**Forgot password:** use "Forgot password?" on the log in tab. No email service is connected (reviewers should not
need paid services), so with `DEMO_RESET_LINKS=1` (set in `render.yaml`) the reset link is shown on screen. Without
that variable the link is only written to the server log and the screen shows a neutral message. Links work once and
expire after 60 minutes. Resetting signs the account out everywhere.

## Run locally

Requires Node 20 or newer.

```bash
npm install
npm --prefix client install
npm test                  # automated tests (accounts, access rules, sharing, teams, import, trash, categories)

# development: two terminals
npm run dev:server        # API on http://localhost:3000
npm run dev:client        # UI on http://localhost:5173

# production style: one process serves the API and the built UI
npm run build
npm start                 # http://localhost:3000
```

The SQLite database is created as `data.db` on first start and seeded with the demo data.
If you ran an earlier version of the project, delete `data.db` once so the seed data is recreated cleanly
(older databases are also upgraded in place).

## Features

- **Documents:** create, rename, edit and autosave. Bold, italic, underline, two heading levels, bulleted and numbered lists, undo and redo. Content is stored as sanitized HTML.
- **File upload:** `.txt`, `.md` and `.docx` (up to 2 MB) become new editable documents. Other types are rejected with a clear message, and the limits are shown in the UI.
- **Accounts:** sign up, log in, and reset a forgotten password (scrypt hashes, random session tokens, 30 day sessions, login and reset throttling, strong-password and email validation on both client and server).
- **Sharing with people:** the owner grants Editor or Viewer access by email, changes it, or removes it. Owned and shared documents are listed in separate sections and tagged.
- **Teams:** create a team, invite people by email, and they accept or decline. Share any document with a team as Editor or Viewer; every member gets access, and removing a member removes it again. Invitations to people who have not signed up yet wait for them.
- **Organisation:** categories for your own documents, a trash with restore and delete forever, and search by title.
- **Word-style editor:** headings 1 to 3, font family and size, bold, italic, underline, strikethrough, subscript and superscript, text colour and highlight, left/centre/right/justified alignment, bulleted, numbered and check lists with indent and outdent, links, quotes, code blocks, horizontal lines, tables (add or delete rows and columns, header row), clear formatting, undo and redo, and a word count.
- **Images:** add a picture from the toolbar, or paste or drop one into the page (PNG, JPG, GIF, WebP, up to 4 MB). Images are checked by their content, stored in the database, and shown through an unguessable address.
- **Saving:** autosave (can be turned off in the File menu), a Save button and Ctrl+S, "Save a copy", and a prompt to save, discard or keep editing when you leave with unsaved changes.
- **Download as:** HTML, Markdown, plain text, or PDF (Print, then choose "Save as PDF").
- **Confirmations:** deletes, leaving a team and unsaved changes use in-app dialogs that match the theme instead of browser pop-ups.

## Access rules

| Action | Owner | Editor | Viewer |
| --- | --- | --- | --- |
| Read | yes | yes | yes |
| Edit content and title | yes | yes | no |
| Share, change category, trash | yes | no | no |

A person's access is the strongest of their direct share and their team share. Without access, the API answers
404, so the existence of a document is not revealed.

## Project layout

```
server/   Express API, SQLite schema and seed (db.js), access rules and routes (app.js), tests
client/   React + Vite + TipTap single page app
```

More detail is in `ARCHITECTURE.md`. The AI workflow note is `AI_WORKFLOW.md`, and `SUBMISSION.md` lists the deliverables.

## Deployment (Render)

`render.yaml` describes one web service. Build command `npm install && npm run build`, start command `npm start`.
On the free plan the disk is not persistent, so the database is recreated with the demo data after a restart or a
redeploy. Attach a disk and point `DB_FILE` at it to keep data permanently.
