# Submission

## Links

- **Live product:** _paste the Render URL_
- **Walkthrough video:** _paste the Loom or YouTube link_ (also saved in `walkthrough-url.txt`)
- **Source and docs:** this folder

## Review accounts (password `demo1234`)

- alice@demo.com (owner of documents and of the team "Product Squad")
- bob@demo.com (team member)
- carol@demo.com (pending invitation to Product Squad)

Suggested review path: log in as Alice, open "Sprint planning", press Share, switch to the Team tab. Log in as Carol
in a private window, accept the invitation, and open the team page.

## What is included

| Item | Location |
| --- | --- |
| Source code | `server/`, `client/` |
| Setup and run instructions | `README.md` |
| Architecture note | `ARCHITECTURE.md` |
| AI workflow note | `AI_WORKFLOW.md` |
| Automated tests | `server/app.test.js` (`npm test`) |
| Deployment config | `render.yaml` |
| Walkthrough video URL | `walkthrough-url.txt` |
| Live URL | top of this file and `README.md` |
| Screenshots | `screenshots/` |

## What works end to end

Continue with Google (needs `GOOGLE_CLIENT_ID`), sign up (then log in), forgot and reset password, show/hide password, email and strong-password validation, create, rename and edit documents with a Word-style editor (fonts, sizes, colours, alignment, lists, tables, links, images), autosave or manual save, save a copy, download as HTML, Markdown, text or PDF, upload `.txt`, `.md` and `.docx`
files, share with a person (editor or viewer), create teams, invite members, accept or decline invitations, share a
document with a team, trash and restore, categories, search, and themed confirmation dialogs.

## What is partial or not built

- No real-time co-editing; two people editing the same document at once means the last save wins.
- No version history, comments or suggestion mode.
- Invitations are shown inside the app; no email is sent.
- Password reset works, but no email is sent: the link is shown on screen in demo mode (`DEMO_RESET_LINKS=1`). No email verification.
- On the free hosting plan the database is not persistent and resets to the demo data on restart.

## What I would build next (2 to 4 hours)

Version history, presence indicators, email invitations, and end-to-end browser tests for the sharing and team flows.

Auth review path: on the log in tab press "Forgot password?", enter `alice@demo.com`, open the reset link shown on
screen, choose a strong password, then log in with it. "Create account" returns to the log in tab instead of opening
the app.
