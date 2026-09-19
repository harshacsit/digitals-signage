# Bhimavaram Digitals Signage Dashboard

Web-based admin console for Bhimavaram Digitals's digital signage network.
Lets operators pair screens, build ad playlists, assign playlists to
screens, and review playback analytics — all backed by Firestore in real
time, with zero page refresh needed.


For More details:documnets ->> technical_documentation(https://github.com/harshacsit/digitals-signage/blob/main/documents/Bhimavaram_Digitals_Technical_Documentation.docx )

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


## Workspace Structure

The project is cleanly separated into modular target directories:

- **`dashboard/`**: Management Console web app (`index.html`, `app.js`, `style.css`, `sw.js`, `netlify.toml`, `modules/`).
- **`player/`**: Standalone Web Signage Player web app (`index.html`, `player.js`, `style.css`, `modules/`).
- **`webos_player/`**: LG webOS Smart TV app (`appinfo.json`, `index.html`, `player.js`, `icon.png`, `modules/`).
- **`backend/`**: Node.js Firebase screen monitoring server & Telegram alert bot (`index.js`).
- **`documents/`**: Technical documentation.

## Getting Started

### Setup Dashboard
1. Navigate to `dashboard/`
2. Copy `config.example.js` → `config.js` and add your Firebase credentials.
3. Serve `dashboard/` with any static server (e.g. `npx serve dashboard` or Netlify).

### Setup Web Player
1. Navigate to `player/`
2. Copy `config.example.js` → `config.js` and add your Firebase credentials.
3. Serve `player/` with any static server. The player sends heartbeats every 30 seconds to maintain robust online status in the dashboard.

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

## Feature Specifications & Safeguards

- **24/7 Auto-Scheduler Guard**: When a screen has Auto-Scheduler turned **ON** (`schedulerEnabled: true`), manual playlist pushing on the Screens and Groups tab is locked (`🔒 Auto-Scheduler ON`). To manually push a one-off playlist, operators must first turn Auto-Scheduler **OFF** in the Scheduler tab. Screen layout mode, split ratios, rotation (0°–270°), and bottom web tickers remain pushable at all times.
- **BGR-to-RGB Live View Color Filter**: WebRTC live streams from TV box hardware encoders are rendered through an SVG `feColorMatrix` transformation filter (`#bgrToRgb`) on `#liveCameraVideo` and `.lw-video` elements to eliminate BGR color distortion (swapped blue and red channels).
- **Firestore Permission Resilience**: Detailed user-friendly toast messages intercept `permission-denied` and indexing errors across all dashboard modules.

## Known Limitations

- **Auto-Scheduler Override**: Manual playlist assignment cannot bypass active 24/7 Auto-Scheduler time slots without first toggling Auto-Scheduler OFF for that specific screen.
- **Table Pagination**: UI table rendering currently processes all paired screens simultaneously; performance may degrade with over 300 active screens.
- **WebRTC Network Traversal**: Live View requires STUN/TURN traversal. Fallback to Google STUN occurs automatically if custom TURN worker environment parameters are unconfigured.

## Roadmap

- [ ] Pagination for screens/playlists tables
- [ ] Offline-duration alerting (screens down >12 min)

## Team

- Dashboard logic (`app.js`, `modules/*.js`) — [Harsha]
- Dashboard UI/CSS — [Ch]

## Related Repos/info

- [repo of Tv player](https://github.com/harshacsit/signage_player.git) — Android TV client
-  in this repo as player.html and player.js— Chromium kiosk player for Raspberry Pi
  (shares this Firestore backend, no dashboard code)



## License

This project is the intellectual property of the project owner and is intended for educational, research, and startup development purposes.

All source code, documentation, designs, and related assets are proprietary. Unauthorized copying, modification, distribution, or commercial use of this project is prohibited without prior written permission from the project owner.

© 2026 Harsha Vardhan Eudu. All Rights Reserved.
         
