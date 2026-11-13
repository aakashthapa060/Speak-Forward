# Speak Forward

A runnable Express MVC university prototype for peer-to-peer language practice. Vanilla JavaScript, custom CSS, EJS, MongoDB/Mongoose, express-session and authenticated Socket.IO. No frontend framework or paid APIs.

## Start here — Windows / PowerShell

Requirements: Node.js 20 or newer, npm, Docker Desktop running Linux containers. Alternatively, use a MongoDB Atlas cluster or your own replica set. MongoDB transactions are required for reservation and tally consistency; a standalone `mongod` is not sufficient.

Extract the ZIP, open the `speak-forward` folder in VS Code, and open its terminal:

```powershell
npm ci
Copy-Item .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the generated value into `SESSION_SECRET` in `.env`. Choose a local demo password of at least 10 characters and set `DEMO_PASSWORD`. Leave the default `MONGODB_URI` and `BASE_URL` for the Docker setup below. Do not commit `.env`.

```powershell
docker compose up -d --wait
npm run seed
npm run dev
```

Open **http://localhost:3000**. `npm start` runs without automatic restart. On macOS/Linux, use `cp .env.example .env` instead of `Copy-Item`.

The Docker health check initializes a single-node replica set automatically. Data lives in a named Docker volume. `docker compose down` stops MongoDB without deleting that data. Port 27017 is bound to your computer's loopback interface, not your local network.

If you already use port 27017, stop that database or edit the port mapping and URI together. Check `docker compose logs mongo` if startup fails. If your Docker version does not support `--wait`, use `docker compose up -d` and wait for `docker compose ps` to show `healthy`.

### Atlas instead of Docker

Set `MONGODB_URI` to your own Atlas connection string, with a database name and a database user. Allow your development IP in Atlas. Then run the seed and dev commands; skip Docker. URL-encode reserved characters in the database password. Never paste that URI into client JavaScript.

### Local demo accounts

All newly seeded accounts use **the `DEMO_PASSWORD` you choose in `.env`**. Passwords are hashed with bcrypt. The application does not show demo credentials in the frontend.

| Account | Email | Purpose |
| --- | --- | --- |
| Aakash Thapa | `aakash@speakforward.test` | Learner; learning Portuguese |
| Sofia Almeida | `sofia@speakforward.test` | Portuguese helper |
| Oliver Reed | `oliver@speakforward.test` | English helper |
| Camille Martin | `camille@speakforward.test` | French helper |
| Mateo Rivera | `mateo@speakforward.test` | Spanish helper |
| Hana Sato | `hana@speakforward.test` | Japanese helper |

Seeding adds missing accounts and fresh offers when none remain current. It **does not overwrite existing profiles, passwords, history or tallies**. Changing `DEMO_PASSWORD` later does not reset existing accounts. Seeded offers last six days; run the seed again after they expire, or edit offers while signed in as their helper. Seeding is disabled when `NODE_ENV=production`.

## Two-browser demonstration

1. In your regular browser, log in as Aakash. In an Incognito window or a different browser, log in as Sofia. Two ordinary tabs share a login cookie; use isolated browser sessions.
2. Aakash: edit your profile, upload a JPG/PNG/WebP under 3 MB, and save. You can list up to three spoken and three learning languages.
3. Open Find Helpers. Filter Portuguese / Beginner. Open Sofia's profile. Leave the time blank for the earliest available time, then Request Practice.
4. Sofia: open Overview. Accept Aakash's request, then press **Confirm I'll be there**.
5. Aakash: refresh Overview (it also refreshes automatically after 30 seconds), then confirm participation. A practice room appears once both have confirmed.
6. Both open the room. For an immediate session, the first participant entering starts its 15-minute server timer. For a later session, the room waits until its scheduled time. The second participant must also enter for the session to qualify for a tally.
7. Exchange messages, check the typing indicator and partner online status. Refresh a room: the timer continues and recent messages return.
8. Sofia can add five minutes once. Aakash has no extension control, and the backend rejects learner extension requests.
9. After at least **one minute with both people having entered**, click End Practice. Both dashboards show the completed session. Sofia's Help Given and Aakash's Help Received increase once each.
10. A third account cannot view, enter, read chat from, extend or end this session. The automated tests also exercise this directly.
11. Optional: create a new request and cancel it; or block a partner. Cancelled sessions do not count. Reports are stored in MongoDB. Unblock people from Edit Profile.

**Live calling:** both participants open the same confirmed room, then separately enable their camera and microphone and allow browser access. The remote feed replaces the partner placeholder. Media uses WebRTC; Socket.IO exchanges connection information. No audio/video is recorded. Devices are stopped on disconnect, session end or exit. Only one media tab per participant is supported.

Use localhost on one computer, or HTTPS when testing from another device. Plain HTTP at a LAN IP cannot provide normal camera access. Two browsers may compete for the same physical camera; two devices are the better final test. Use headphones to avoid feedback. If playback is blocked, press the room's playback button.

**Network setup:** STUN is configured by default. Calls across networks may require a TURN relay, which this ZIP does not provision. Set `TURN_URLS` plus either `TURN_SHARED_SECRET` (for a compatible time-limited credential server) or `TURN_USERNAME` and `TURN_CREDENTIAL` in `.env`. Shared secrets stay server-side; the participant-only RTC endpoint supplies temporary credentials. See `.env.example`. Restart after changes. A missing remote feed is not fixed by installing Docker alone.

## What works

- Landing page, responsive discovery grid, dashboard, public profile, profile editor, matching, availability and practice room. Signed-in helper discovery stays inside the dashboard shell.
- WebRTC camera/microphone sharing with private signaling, media toggles, remote playback and reconnection controls.
- Registration, 18+ confirmation, login/logout, bcrypt hashes and MongoDB-backed sessions.
- Own-profile editing; up to three spoken/learning languages; goals, country and time zone.
- Avatar uploads verified by decoding image content, resized, converted to WebP and stored locally. SVG uploads are not accepted.
- Backend filters for name, language, supported practice level and available-now status.
- Deterministic Match Me: matching open offers, least Help Given first, then name, then earliest offer. A match opens the profile for review; it does not silently send a request.
- Availability creation/editing/removal and reserved-offer protection.
- Request acceptance/decline/cancellation, separate confirmations, private rooms and scheduled entry.
- Real Socket.IO text chat, typing, presence, server timestamps, reconnection and persisted recent messages.
- Server-stored timer; one helper-only extension; completion on expiry even if browsers close.
- Transactional, idempotent help tallies and session history.
- Report and block/unblock actions. Blocking cancels shared pending/active work and excludes matches in either direction.
- CSRF validation, auth/API rate limits, input validation, HTML escaping, security headers and socket authorization.

## Important prototype rules and boundaries

- A slot is an **availability window for one reservation at a time**, not a recurring calendar. Pending requests keep that slot reserved until declined/cancelled/completed. Expired pending requests are not automatically purged; cancel them from the dashboard. Overlap detection across separately created offers is not implemented, so helpers should avoid overlapping windows.
- An immediate room starts on its first actual entry, after both confirmations. A late entry is rejected if the remaining offer window cannot fit 15 minutes. The helper's optional extension may go beyond the original offer window; both can always end or cancel.
- Leaving via the red control cancels for both and earns no tally. Closing a tab only disconnects that participant; the server timer continues. Early End Practice earns a tally only after 60 seconds and both participants have entered. These positive tallies are not credits or debts and are not proof of measured learning.
- Message history returns the latest 100 messages. MongoDB's TTL index removes messages after roughly 30 days. Profile pictures and message text are not recorded video.
- A displayed availability is an offer, not proof that the helper is currently online. Presence appears only in the private room.
- Times are saved in UTC and displayed/entered in the browser's local time zone. The profile time zone is informational. The browser room timer corrects for the server's clock.
- Reports are saved for project review. There is no staffed moderation service, report-review UI, email verification, password reset, notifications or email delivery in this prototype.
- Uploaded avatars are served publicly as profile assets. Replaced avatars are not automatically removed from disk. For a real deployment, add storage lifecycle cleanup, backups and object storage.
- This is designed for one Node process. Multiple servers would need a shared Socket.IO adapter, distributed rate limiting, production MongoDB credentials and deployment-specific proxy configuration. Use HTTPS, a strong secret, `NODE_ENV=production`, and the exact HTTPS `BASE_URL` in that environment.
- Generic initials are intentional image placeholders. Your four screenshots were used as layout references, not as misleading photographs of actual community members.

## Architecture

```text
app.js / server.js       Express, security, sessions, HTTP, Socket.IO, expiry worker
config/db.js            MongoDB connection and replica-set check
models/                 User, Availability, SessionRequest, PracticeSession,
                        ChatMessage, Report, Block
routes/index.js         Page and API endpoint declarations
controllers/            Authentication, profile, helpers, matching, sessions
services/               Matching and session state/transaction rules
middleware/             Authentication context, CSRF and error handling
sockets/                Authenticated room membership, chat, typing, presence
views/pages/            EJS pages
views/partials/         Shared shell, navigation, icons, avatars, cards
public/css/             Design tokens and responsive component styling
public/js/              Form interactions and room client
public/assets/images/   Local mark and uploaded/replacement images
scripts/seed.js         Idempotent development seed
scripts/check.js        JavaScript syntax and EJS compilation checks
tests/                  MongoDB-backed HTTP and live Socket.IO integration tests
```

**Request lifecycle:** pending → accepted → both confirmed → scheduled room → active on entry → completed/cancelled. Rejected/cancelled requests release their offer. The public request status is synchronized with session status.

Availability reservation uses a transaction and conditional update. Session completion updates the session, request, offer and both user counters in one MongoDB transaction. Repeated or simultaneous completion calls observe the finished record and cannot increment twice. A unique `requestId` index allows one room per request.

Socket identity comes from the server session cookie. The client cannot choose a user identity. Every join/send/typing event reloads the session and checks participant membership, active time and blocks. Logout disconnects sockets tied to that login session. Client messages use `textContent`, and EJS escapes user-provided fields.

### Main routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/`, `/helpers`, `/profile/:id` | Public discovery and profiles |
| GET/POST | `/register`, `/login` | Authentication forms |
| POST | `/logout` | Destroy session and disconnect sockets |
| GET | `/dashboard`, `/match`, `/availability` | Private account pages |
| GET/POST | `/profile/edit` | Own-profile editing and upload |
| GET | `/sessions/:id` | Participant-only room |
| POST | `/api/offers` | Create or update owned availability |
| DELETE | `/api/offers/:id` | Remove unreserved owned availability |
| POST | `/api/match` | Find a compatible helper profile |
| POST | `/api/requests` | Reserve offer and request practice |
| POST | `/api/requests/:id` | Accept, decline, confirm or cancel |
| GET | `/api/sessions/:id` | Authorized state and server time |
| GET | `/api/sessions/:id/rtc-config` | Participant-only ICE configuration for active rooms |
| GET | `/api/sessions/:id/messages` | Authorized recent messages |
| POST | `/api/sessions/:id/enter` | Start/join at the scheduled time |
| POST | `/api/sessions/:id/extend` | Helper-only single extension |
| POST | `/api/sessions/:id/end` | End or cancel with atomic tallies |
| POST/DELETE | `/api/users/:id/block` | Block/unblock another person |
| POST | `/api/users/:id/report` | Store a report |

## Verify the project

```powershell
npm run check
npm test
```

`npm test` starts a real temporary MongoDB replica set (MongoDB 7.0.24), and does not use or delete your development database. Its first run downloads a MongoDB binary and needs internet access. The replica set is removed afterward. Tests use real HTTP requests and real Socket.IO clients; they do not mock the database. The tests use `--nounixsocket` for compatibility with environments where Unix socket files cannot be created.

Validated during development: **24 reported tests passed, zero failed, one skipped (including the parent suite)**. JavaScript syntax and EJS compilation also passed. Covered: registration/age check, hashing, login/logout, API authentication, CSRF, public/private page rendering, profile ownership/escaping, actual avatar decoding, offer ownership, matching, reservation collision, mutual confirmation, outsider denial, refresh-stable timer, socket isolation/typing/presence/chat persistence, concurrent extension, concurrent completion, scheduled entry, expiry, blocks and reports.

Development sequence and manual checks:

1. Foundation: start MongoDB/app, register, log out/in, confirm `/api/me` rejects signed-out callers.
2. Profiles/discovery: edit a profile and upload an avatar; filter for Portuguese; create/edit an offer as a helper.
3. Matching: find a match, request, accept and confirm in isolated browsers; check a third user is denied.
4. Communication: send messages, type, refresh, use a helper extension, enable camera and microphone on both sides and verify remote playback.
5. Final workflow: end after one minute, check both tallies/history, try cancellation and block/report.

The helper discovery layout was visually checked in the dashboard shell. Additional tests cover protected ICE configuration, bounded signaling, outsider denial and duplicate-tab replacement. The native two-peer media test was skipped because this environment disallows network-interface enumeration. Browser media setup also timed out waiting for both peer connections here; actual two-device audio/video delivery has **not** been verified in this environment.

Run `npm.cmd run test:browser`, open `http://localhost:3090`, and click Run media test for a synthetic two-peer audio/video check using the production peer code. It requires no camera/microphone permission. This complements, but does not replace, testing the full room with two accounts/devices. Follow the walkthrough above for final device permissions, remote feed, mute, camera re-enable and session-end checks.
