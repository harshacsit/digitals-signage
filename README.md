# Bhimavaram Digitals Signage Dashboard

Web-based admin console for Bhimavaram Digitals's digital signage network.
Lets operators pair screens, build ad playlists, assign playlists to
screens, and review playback analytics — all backed by Firestore in real
time, with zero page refresh needed.

## Overview

The dashboard is a static site (vanilla JS/HTML/CSS, Bootstrap 5) that talks
directly to Firebase Firestore from the browser. It has no backend server of
its own — Firestore security rules are the authorization boundary. It's
built to manage a fleet of Android TV signage players (see the
[Signage Player repo](https://github.com/harshacsit/signage_player.git)) and web-kiosk players running on
Raspberry Pi.

## Key Features

- **Screens** — pair devices by code, assign name/playlist/rotation, see
  live online/offline status
- **Playlists** — build ordered rotations of video / image / web-YouTube
  content, each item independently sized, rotated, and timed
- **Analytics** — playtime and play-count per ad, filterable by screen and
  date, aggregated across the fleet via a Firestore collection group query

## Tech Stack

| Layer | Technology |
|---|---|
| UI | Vanilla JS, HTML, Bootstrap 5, custom CSS |
| Backend | Firebase Firestore (client SDK, compat build) |
| Auth | Firebase Email/Password (admin login) |
| Hosting | GitHub Pages |
| Video storage referenced | Cloudflare R2 (uploaded via a separate tool/repo) |


## Architecture
The Dashboard application follows a modular JavaScript architecture where each feature is implemented as an independent module. Instead of using a framework or bundler, the application loads plain JavaScript files directly in the browser. This approach keeps the project lightweight, easy to understand, and suitable for deployment as a static web application.

Each module has a single responsibility. Shared application state is maintained in a central module, Firebase handles authentication and database communication, feature modules manage business logic, and the main application file coordinates all modules and initializes the application.

## Architechure flow
```text
User
   │
   ▼
Dashboard (HTML/CSS)
   │
   ▼
app.js
   │
   ├──────────────┬──────────────┬──────────────┐
   ▼              ▼              ▼              ▼
auth.js      screens.js    playlists.js   analytics.js
   │              │              │              │
   └──────────────┴──────────────┴──────────────┘
                  │
                  ▼
              state.js
                  │
                  ▼
            firebase.js
                  │
                  ▼
      Firebase Authentication
                  │
                  ▼
         Cloud Firestore Database
```


This module-per-concern split exists specifically so two people can work
in parallel without merge conflicts: dashboard logic changes live in
`modules/*.js` + `app.js`; **all UI/styling changes are confined to
`index.html` and `style.css`**, and must preserve existing `id=` and
`onclick=` attributes those scripts depend on.

## Getting Started

### Prerequisites
- A Firebase project (Firestore + Email/Password Auth enabled)
- A static file server or GitHub Pages for hosting

### Setup
1. Clone the repo
2. Copy `config.example.js` → `config.js` and fill in your Firebase config
   (`config.js` is gitignored — never commit real keys)
3. Open `index.html` directly, or serve locally: `python -m http.server`
4. Create an admin user in Firebase Auth (Email/Password provider)

### Deployment
Pushed to `main` → served via GitHub Pages at `harshacsit.github.io`. No
build step required (plain JS/HTML).

## Firestore Data Model

| Collection | Purpose |
|---|---|
| `screens/{screenId}` | pairing status, name, currentPlaylist, rotation, lastSeen |
| `playlists/{playlistId}` | ordered `items[]`: type, url, durationSeconds, resizeMode, rotation, isLive |
| `analytics/{screenId}_{yyyyMMdd}/items/{urlEncoded}` | playCount, totalSeconds per ad per screen per day |
| `config/appVersion` | OTA metadata for the player app (in progress) |

Full field-level schema and security rules rationale in
[DATA_MODEL.md](./DATA_MODEL.md).

## Security Notes

- All writes other than `screens.lastSeen` (device heartbeat) require
  `request.auth != null`
- Firestore denies by default — every new collection needs explicit rules
  (this bit the team once with the `analytics` collection; documented as a
  cautionary note in DATA_MODEL.md)

## Known Limitations

- No pagination — table rendering will degrade past a few hundred screens
- No bulk playlist assignment across multiple screens yet

## Roadmap

- [ ] Pagination for screens/playlists tables
- [ ] Bulk playlist assignment
- [ ] Offline-duration alerting (screens down >10 min)

## Team

- Dashboard logic (`app.js`, `modules/*.js`) — [Harsha]
- Dashboard UI/CSS — [Ch]

## Related Repos/info

- [https://github.com/harshacsit/signage_player.git](link) — Android TV client
-  in this repo as player.html and player.js— Chromium kiosk player for Raspberry Pi
  (shares this Firestore backend, no dashboard code)



## License

This project is the intellectual property of the project owner and is intended for educational, research, and startup development purposes.

All source code, documentation, designs, and related assets are proprietary. Unauthorized copying, modification, distribution, or commercial use of this project is prohibited without prior written permission from the project owner.

© 2026 Harsha Vardhan Eudu. All Rights Reserved.
         
