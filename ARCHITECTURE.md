# Architecture note

## Goal and scope

A usable slice of a Google Docs style product in the time box: editing, import, sharing and persistence, with
enough product structure (teams, trash, categories) that it feels like a real tool rather than a demo form.

## Stack and why

- **React + Vite + TipTap.** TipTap (ProseMirror) gives reliable rich-text editing, undo history and HTML output, so time went into product behaviour instead of a custom editor.
- **Express + SQLite (better-sqlite3).** One process, no external service, zero cost for reviewers, and relational constraints for the sharing model. The same process serves the built UI, so deployment is a single service.
- **Content stored as sanitized HTML.** Simple, preserves formatting, and sanitized on every write (`sanitize-html`) so shared documents cannot carry scripts.

## Data model

`users`, `sessions`, `documents` (owner, content, category, optional `team_id` + `team_role`, soft-delete timestamp),
`shares` (document, user, role), `teams`, `team_members`, `team_invites`, `categories`.

## Access logic

One function decides a person's role on a document: owner, else the strongest of a direct share and the team role
(only if they are currently a team member). Every route goes through the same loader, which returns 404 when there is
no access, 403 when the role is too weak for the action. Team access is computed at read time, so adding or removing a
member needs no data copying and cannot leave stale permissions.

## Authentication

Email and password with scrypt hashing and per-user salts. Login returns a random opaque token stored in `sessions`
and sent as a bearer header. Failed logins are throttled per email. This is deliberately simple and not meant to
replace a managed identity provider.

Continue with Google uses Google Identity Services in the browser; the server verifies the returned ID token with
Google, requires the token's audience to equal `GOOGLE_CLIENT_ID` and the email to be verified, and then finds or
creates the user by email (no password set; "forgot password" can add one). No extra dependency is needed.

Signup creates the account but no session, so the person confirms it by logging in. Email and password rules live in
one small module (`server/validation.js`, copied to `client/src/validation.js` and checked by a test), so the form and
the API cannot disagree. Password reset issues a random 256-bit token, stores only its SHA-256 hash with a 60 minute
expiry, accepts it once, and ends all sessions for the account. The "forgot" reply is the same whether or not the
email exists. With no email provider, `DEMO_RESET_LINKS=1` returns the link in the response for the demo; that mode
lets anyone who knows an address reset it, so it must stay off for real users (next step: send the link by email).

## Editor, images and saving

The editor is TipTap with extensions for text style, colour, font family and size (a small custom extension), alignment,
lists and check lists, links, images and tables. Content is stored as HTML, and the server runs it through one
allow-list sanitizer: editor tags and a few safe inline styles (colour, size, alignment, font) pass, scripts, event
handlers, `javascript:` links and unknown images do not. Images are uploaded separately, identified from their first
bytes (not the file name), saved as BLOBs and served from `/api/images/<random id>`; the address is unguessable but
public, because an `<img>` tag cannot send a login header. Exports (Markdown, text, HTML, print) are built in the
browser from the editor HTML, so they need no server code. With autosave on, changes are saved 800 ms after typing;
with it off, the Save button, Ctrl+S and a leave prompt take over.

## Frontend structure

A hash-routed single page app. `Workspace` owns the shell (side menu, header, views), `Editor` owns the autosaving
editor with a details panel, `ShareModal` handles people and team sharing, `TeamPage` handles members and invites.
Autosave is debounced (800 ms) and flushed when leaving a document; the status chip shows saved, saving, unsaved or
failed.

## Prioritised

1. Correct, tested access rules (owner, editor, viewer, team).
2. A coherent editing flow that persists and reopens.
3. Import that is useful and safe (type and size limits, sanitized output).
4. A product shell people can navigate: home, teams, categories, trash, search.

## Deliberately deprioritised

- Real-time co-editing and live cursors (last write wins on the same document).
- Version history, comments, suggestion mode.
- Email delivery for invitations (invites appear in the invited person's account instead).
- Email delivery of reset links and email verification (reset works, but the link is shown in-app in demo mode).
- `.docx` export (PDF goes through the browser's print dialog), image cleanup when an image is deleted from a document.
- Persistent storage on the free hosting tier.

## Next with 2 to 4 more hours

Document version history, presence indicators over polling, email invitations, and Playwright end-to-end tests for the
share and team flows.
