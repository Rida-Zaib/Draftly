# AI workflow note

## Tools used

- **Claude (Anthropic), chat interface:** planning the scope, generating the first version of the server, client and tests, and the later redesign.
- **VS Code, PowerShell and the browser dev tools:** running, testing and reviewing everything the AI produced.

## Where AI materially sped things up

- Turning the open brief into a scoped plan (stack, data model, access rules) in the first hour.
- Producing the Express routes, SQLite schema, TipTap editor and the first test suite as one coherent slice.
- The second pass: replacing mocked users with real login, adding teams and invitations, and rebuilding the interface, including migration code so an existing database upgrades in place.
- Drafting documentation from the finished code, which kept the README, architecture note and behaviour consistent.

## What I changed or rejected

- **Rejected the first interface.** The first AI-generated UI was functional but flat: every element in a bordered box, a plain table for documents, and no clear header or side menu. I asked for a full redesign. The result uses document cards with previews, a grouped side menu, one options menu per document, and a details panel in the editor.
- **Rejected mocked authentication.** The first version switched between seeded users with a dropdown. It did not demonstrate real access control, so it was replaced with email and password accounts and session tokens.
- **Rejected a category-only sharing idea.** Documents can be shared with people, but teams needed their own model: invitations, accept or decline, and access that follows team membership.
- **Moved the placement of options.** Delete, category and share actions were scattered. They are now grouped in the card menu and the editor's details panel.
- **Hardened the auth flow late in the project.** The first version signed people straight into the app after "Create account" and accepted any 8 character password. I asked for signup to return to the log in screen, strict email and strong-password checks shared by client and server, a show/hide button, and forgot/reset password. I chose hashed one-time tokens with an expiry, and kept the on-screen reset link behind a demo-only flag instead of exposing it by default.
- **Extended the editor late.** The first editor only had bold, italic, underline, two headings and lists. I asked for a fuller Word-style toolbar, image upload, save options and in-app dialogs. I rejected storing images as base64 inside the document (it would bloat every save) and used a separate upload with content-based type detection. I also kept the sanitizer as a strict allow-list rather than loosening it to "allow all styles".
- **Kept scope cuts explicit.** Real-time co-editing, version history and email delivery were left out on purpose and are listed in the architecture note.

## How I verified correctness, UX quality and reliability

- **Automated tests (`npm test`):** accounts, validation, password reset, Google sign-in, image upload, sanitizing and sessions, role checks for owner, editor and viewer, sharing, team invitations and revocation, file import, trash, and categories. The tests assert both the allowed case and the denied case for each rule.
- **Manual walkthrough:** I switched between Alice, Bob and Carol to confirm what each role can see and do, tried unsupported uploads, refreshed to confirm persistence, and ran the production build (`npm run build` then `npm start`) before deploying.
- **Reading the generated code:** I reviewed the access function and every route that changes data, because that is where an AI-written mistake would be most costly, and checked that responses never reveal documents a person cannot open.
- **Deployment check:** after deploying, I repeated the sharing flow on the live URL.

_Edit this note so it matches exactly what you did and checked before submitting._
