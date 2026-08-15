# AIFICO — Class Booking &amp; Ledger (Full-Stack)

A standalone, self-contained app: Google sign-in, a class enrollment form,
and a "My Bookings" ledger with fee tracking, reschedules and extra-class
requests — with a real Node/Express backend and API behind it, not just a
static page.

```
aifico-fullstack/
├── server/                 → Express API + session auth
│   ├── server.js            entrypoint (serves the API and the public/ folder)
│   ├── db.js                persistence layer (JSON file — swap for a real DB later)
│   ├── routes/auth.js       Google sign-in verification, demo login, sign-out
│   ├── routes/bookings.js   booking CRUD, mark-held, reschedule
│   ├── middleware/requireAuth.js
│   ├── data/db.json          created automatically on first run — your data lives here
│   └── .env.example         copy to .env and fill in
└── public/                 → the frontend (served by the backend, no separate build step)
    ├── index.html
    ├── css/style.css
    └── js/app.js
```

## Run it locally

```bash
cd server
cp .env.example .env       # then edit .env (see below)
npm install
npm start                  # or: npm run dev (auto-restarts on changes)
```

Open **http://localhost:4000** — that's it, frontend and API are served from
the same place. Click **"Continue with a demo account"** to try the whole
flow without setting up Google OAuth first.

## How the pieces fit together

- **Auth**: the frontend loads Google Identity Services and gets an ID
  token when someone signs in. It's sent to `POST /api/auth/google`, which
  the **server** verifies with Google directly (`google-auth-library`) —
  the frontend never has to be trusted on its own. On success the server
  issues a signed session token as an `httpOnly` cookie, so the browser
  can't read or tamper with it.
- **Every booking action is a real API call** — nothing is stored in
  `localStorage` anymore. The frontend calls `fetch()` against endpoints
  like `GET /api/bookings`, `POST /api/bookings/:id/mark-held`, etc., and
  the server checks the session cookie on every one of them
  (`middleware/requireAuth.js`) before touching any data.
- **Storage**: `server/db.js` currently reads/writes a single JSON file
  (`server/data/db.json`). This keeps the app runnable with zero setup —
  no database server to install. All the read/write logic is isolated in
  that one file, so swapping in Postgres/MySQL/MongoDB later means
  rewriting `db.js` only; nothing in `routes/` or the frontend needs to
  change.

## Setting up real Google Sign-In

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs
   & Services → Credentials.
2. Create an **OAuth client ID** → Application type: *Web application*.
3. Under **Authorized JavaScript origins**, add `http://localhost:4000`
   (for local testing) and `https://aifico.com` (or whatever subdomain
   you deploy this to).
4. Copy the client ID into `server/.env`:
   ```
   GOOGLE_CLIENT_ID=your-real-id.apps.googleusercontent.com
   ```
5. Restart the server. The frontend fetches this ID from `GET /api/config`
   automatically — nothing to change in the frontend code.

Until this is set up, the Google button shows a disabled "needs setup"
state and the demo login is the only way in, so nothing errors out.

## API reference

All `/api/bookings/*` routes require a signed-in session (the cookie set
at sign-in).

| Method | Path                                | Does |
|---|---|---|
| POST | `/api/auth/google` | Verify a Google ID token, sign in / create the user, set session cookie |
| POST | `/api/auth/demo` | Sign in as a shared demo account, no Google needed |
| GET  | `/api/auth/me` | Returns the current signed-in user, or `null` |
| POST | `/api/auth/signout` | Clears the session cookie |
| GET  | `/api/bookings` | List the signed-in user's bookings |
| POST | `/api/bookings` | Create a booking (see `db.js` → `createBooking` for the field list) |
| POST | `/api/bookings/:id/mark-held` | Increments classes held; auto-updates deduction status |
| POST | `/api/bookings/:id/reschedule` | Adds a `{ newDate, reason }` entry to that booking's history |
| PATCH| `/api/bookings/:id/status` | Manually update `requestStatus` and/or `deductionStatus` |

## Deploying / merging into aifico.com

This runs as a normal Node app, so it'll work on Render, Railway, a VPS,
etc. — point your process manager at `server/server.js` (`npm start`) and
set the same environment variables from `.env.example` on the host.

If you'd rather merge this into your existing aifico.com codebase instead
of running it as a separate app:
- The **frontend** (`public/`) is plain HTML/CSS/JS — copy the three files
  in and update the `<link>`/`<script>` paths to match your site's asset
  structure.
- The **backend** routes (`routes/auth.js`, `routes/bookings.js`) can be
  mounted into an existing Express app as-is; if your existing site isn't
  Express, the logic in each route (verify token → look up/create user →
  read/write bookings) translates directly to whatever framework you're
  using.

## What's still a placeholder

- **Storage** is a JSON file, fine for getting the whole flow working but
  not meant to hold real production data at scale — move to a proper
  database before this handles real students' fee data (see `db.js`).
- **No email notifications** yet (booking confirmations, reschedule
  alerts) — the reschedule/booking data is all there to hook a mailer
  (e.g. Nodemailer, Resend) into if/when you want that.
- **No admin view** — right now each signed-in user only sees their own
  bookings. If you (as the tutor/platform owner) want a view across every
  student, that's a straightforward addition: a route that skips the
  per-user filter, gated to your own account.
