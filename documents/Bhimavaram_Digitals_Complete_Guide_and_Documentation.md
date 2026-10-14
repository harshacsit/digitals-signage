# Bhimavaram Digitals Signage System: Complete User & Technical Guide

Welcome to the official master guide for the **Bhimavaram Digitals Digital Signage Network**.  
This document is designed to explain **every feature, every cloud service, every file, every setting, costs, and system limitations** in simple, plain language that anyone can understand.

---

## 📑 Table of Contents
1. [Executive Overview](#1-executive-overview)
2. [100% Free-Tier Cost Analysis ($0/month)](#2-100-free-tier-cost-analysis-0month)
3. [Complete Feature Guide & How to Use the Dashboard](#3-complete-feature-guide--how-to-use-the-dashboard)
   * [3.1 Screens Management](#31-screens-management)
   * [3.2 Playlist Builder](#32-playlist-builder)
   * [3.3 24/7 Auto-Scheduler](#33-247-auto-scheduler)
   * [3.4 Screen Groups & Bulk Operations](#34-screen-groups--bulk-operations)
   * [3.5 Real-Time Live View & Live Wall](#35-real-time-live-view--live-wall)
   * [3.6 Ad Playback Analytics](#36-ad-playback-analytics)
   * [3.7 Mass Launch Emergency Deployment](#37-mass-launch-emergency-deployment)
4. [How the System Works Behind the Scenes](#4-how-the-system-works-behind-the-scenes)
   * [4.1 Device Heartbeats](#41-device-heartbeats)
   * [4.2 Instant Schedule Auto-Pushing](#42-instant-schedule-auto-pushing)
   * [4.3 Render 24/7 Keep-Alive](#43-render-247-keep-alive)
   * [4.4 Telegram Offline Alerts](#44-telegram-offline-alerts)
5. [Complete File-by-File Inventory](#5-complete-file-by-file-inventory)
6. [System Rules, Guardrails & Limitations](#6-system-rules-guardrails--limitations)
7. [Step-by-Step Operator Troubleshooting](#7-step-by-step-operator-troubleshooting)

---

## 1. Executive Overview

**Bhimavaram Digitals** is a cloud-powered digital signage management platform. It allows businesses and network operators to manage a fleet of smart TV screens, Android TV boxes, and digital display boards across multiple physical locations from a single web browser dashboard.

### What You Can Do With This System:
* 📺 **Pair TV Screens**: Connect new TV displays to your account using a 6-digit code.
* 🎬 **Create Ad Playlists**: Combine videos, images, web pages, and YouTube content into customized ad sequences.
* ⏰ **Set 24/7 Automated Schedules**: Assign different ad playlists to play automatically at specific times of the day (e.g., Morning Ads from 9:00 AM – 1:00 PM, Evening Ads from 5:00 PM – 9:00 PM).
* 📹 **Monitor Live Video Feeds**: Watch live video of what is playing on any TV screen in real time using WebRTC technology.
* 📊 **Track Playback Analytics**: Generate proof-of-play reports showing exactly how many times each ad was played and for how many total seconds.
* 🚨 **Receive Instant Alerts**: Get automatic Telegram notifications on your mobile phone if a TV loses internet or power.

---

## 2. 100% Free-Tier Cost Analysis ($0/month)

> [!NOTE]
> **Total Monthly Operating Cost: $0.00 / ₹0.00 (100% FREE FOREVER)**  
> All cloud services used by Bhimavaram Digitals operate strictly within permanent free tier allowances.

| Service | Purpose | Free Tier Limit | Your Usage | Monthly Cost |
| :--- | :--- | :--- | :--- | :--- |
| **Render.com** | Backend Monitoring Server | **750 free hours** / month | **744 hours** / month (31 days × 24h) | **$0.00** |
| **Google Firebase / Firestore** | Real-time Database & Auth | **50,000 reads** & **20,000 writes** / day | **< 50 reads** & **< 100 writes** / day | **$0.00** |
| **UptimeRobot** | 24/7 Cloud Keep-Alive | **50 HTTP monitors** @ 5-min intervals | **1 monitor** @ 5-min intervals | **$0.00** |
| **Cloudflare R2** | Video & Image Media Storage | **10 GB storage** & 10M reads / month | **< 2 GB storage** | **$0.00** |
| **Cloudflare Workers** | Media Upload & WebRTC Proxy | **100,000 requests** / day | **< 500 requests** / day | **$0.00** |

### Mathematical Proof of Zero Cost:
1. **Render Server Hours**: 1 calendar month = 31 days × 24 hours = **744 hours**. Render provides **750 free hours** per account every month. Running **1 single web service 24/7** uses 744 hours, leaving 6 spare free hours.
2. **Firestore Read Charges**: The backend opens a single real-time stream (`onSnapshot`) upon boot. The 15-second background scheduler loop checks variables inside server RAM memory — resulting in **0 database reads**.
3. **Firestore Write Charges**: Writes to Firestore only happen when a playlist actually changes (`activeSlot.playlistId !== currentPlaylist`). Repeat writes during the same time slot are prevented.

---

## 3. Complete Feature Guide & How to Use the Dashboard

### 3.1 Screens Management
The **Screens** view ([dashboard/modules/screens.js](file:///c:/Users/harsh/OneDrive/Desktop/bhimavaram%20digitals/dashboard/modules/screens.js)) is your command center for device control.

* **Pairing a TV**: Click **Pair Screen**, turn on the TV app, and enter the 6-digit pairing code displayed on the TV screen.
* **Screen Name**: Rename any screen (e.g., "Main Store Entrance", "Billing Counter TV").
* **Screen Rotation**: Rotate screen orientation (0°, 90°, 180°, 270°) to support vertical poster displays or landscape screens.
* **Layout Modes (Single vs. Split Screen)**:
  * **Single Mode**: Displays the playlist full-screen.
  * **Split Mode**: Splits the screen into two zones (e.g., Video ad on the top half, promo banner on the bottom half).
* **Bottom Web Ticker**: Add a scrolling text news banner or website URL to run along the bottom of the TV screen.

---

### 3.2 Playlist Builder
The **Playlists** view ([dashboard/modules/playlists.js](file:///c:/Users/harsh/OneDrive/Desktop/bhimavaram%20digitals/dashboard/modules/playlists.js)) lets you organize advertising content.

* **Media Types Supported**:
  * 🎥 **Videos**: MP4 video files stored in Cloudflare R2 or direct web links.
  * 🖼️ **Images**: JPG / PNG banners.
  * 🌐 **Web Pages / YouTube**: Embedded web URLs or YouTube video links.
* **Item Controls**: Set individual play duration in seconds (e.g., Image 1 plays for 10 seconds, Video 1 plays for 30 seconds), set scaling modes (Fit vs Cover), and arrange play order.

---

### 3.3 24/7 Auto-Scheduler
The **Scheduler** view ([dashboard/modules/scheduler.js](file:///c:/Users/harsh/OneDrive/Desktop/bhimavaram%20digitals/dashboard/modules/scheduler.js)) allows automated, hands-off playlist switching.

* **Time Slots**: Create multiple scheduled time windows for any screen.
  * *Example*: Slot 1 (`09:00` to `13:00` -> Morning Promo), Slot 2 (`13:00` to `17:00` -> Afternoon Offers), Slot 3 (`17:00` to `22:00` -> Evening Highlights).
* **Overnight Slots**: Supports schedules crossing midnight (e.g., `22:00` to `06:00`).
* **Time Normalization**: Accepts flexible inputs like `911` (auto-formats to `09:11`) or dropdown picks.
* **Auto-Scheduler Safety Lock**: When Auto-Scheduler is enabled (`schedulerEnabled: true`), manual playlist selection on the Screens tab is locked (`🔒 Scheduler ON`) to prevent operators from accidentally overriding the automated schedule.

---

### 3.4 Screen Groups & Bulk Operations
The **Groups** view ([dashboard/modules/groups.js](file:///c:/Users/harsh/OneDrive/Desktop/bhimavaram%20digitals/dashboard/modules/groups.js)) groups multiple screens into regional clusters (e.g., "Bhimavaram Stores", "Vijayawada Branch").

* **Bulk Settings**: Assign a playlist, layout mode, rotation, or bottom ticker to 20 screens simultaneously with one click.

---

### 3.5 Real-Time Live View & Live Wall
The **Live View** ([liveview.js](file:///c:/Users/harsh/OneDrive/Desktop/bhimavaram%20digitals/dashboard/modules/liveview.js)) and **Live Wall** ([livewall.js](file:///c:/Users/harsh/OneDrive/Desktop/bhimavaram%20digitals/dashboard/modules/livewall.js)) views stream live video directly from TV hardware.

* **WebRTC Live Streaming**: Low-latency video feed showing exactly what is playing on the physical TV screen.
* **BGR-to-RGB Color Correction**: Includes a built-in SVG color matrix filter (`feColorMatrix`) that corrects swapped blue/red channel distortion from TV box hardware encoders.

---

### 3.6 Ad & Playlist Playback Analytics
The **Analytics** module ([dashboard/modules/analytics.js](file:///c:/Users/harsh/OneDrive/Desktop/bhimavaram%20digitals/dashboard/modules/analytics.js)) provides proof-of-play metrics for every TV screen across your network.

* **Ad Airtime Breakdown**: Shows exact play count (`playCount`), total duration played (`totalSeconds`), average play length, and percentage share of total airtime for every media item.
* **Playlist Airtime Breakdown**: Aggregates total playback time per ad playlist, showing how many total hours/minutes each scheduled playlist aired across target TVs.
* **Per-TV Separate Screen View**: Filter metrics for **every TV screen individually** or view comparative network-wide performance metrics.
* **Firebase Free-Tier Protection**: Uses client-side in-memory caching per date/screen key (`analyticsCache`), resulting in **0 extra Firestore reads** when toggling tabs or filtering screens.
* **1-Click CSV Export**: Download instant `.csv` proof-of-play reports formatted for client billing and advertiser verification.

---

### 3.7 Mass Launch Emergency Deployment
The **Mass Launch Modal** ([screens.js](file:///c:/Users/harsh/OneDrive/Desktop/bhimavaram%20digitals/dashboard/modules/screens.js#L1000)) allows broadcast deployments.

* **Emergency Broadcast**: Immediately push an urgent announcement playlist across all screens in the network at once.

---

## 4. How the System Works Behind the Scenes

### 4.1 Device Heartbeats
Each TV player device sends an automatic "heartbeat" signal to Firestore every **30 seconds**. This updates the screen's `lastSeen` timestamp.
* **Online**: Heartbeat received within the last 12 minutes.
* **Offline**: No heartbeat for > 12 minutes.

---

### 4.2 Instant Schedule Auto-Pushing
Schedule transitions are handled by a **dual auto-push engine**:
1. **Primary (Backend Server)**: `backend/index.js` runs a background check loop every **15 seconds**. When a scheduled time arrives, it updates `currentPlaylist` in Firestore.
2. **Secondary (Dashboard Fallback)**: `scheduler.js` in the dashboard runs a background check every **30 seconds** while open, ensuring instant playlist switching even if the backend is restarting.
3. **Instant TV Switch**: Once Firestore updates `currentPlaylist`, the TV player receives the update in real time via websockets (`onSnapshot`) and switches media seamlessly.

---

### 4.3 Render 24/7 Keep-Alive
Render's free tier puts web services to sleep after 15 minutes of zero traffic. We prevent this using two mechanisms:
1. **Dashboard Auto-Ping**: `app.js` pings your Render backend URL every **4 minutes** while you have the dashboard open.
2. **UptimeRobot Cloud Monitor**: A free 5-minute HTTP monitor on [UptimeRobot.com](https://uptimerobot.com) pings `https://digitals-signage.onrender.com` every 5 minutes 24/7/365, guaranteeing **0 sleep downtime**.

---

### 4.4 Telegram Offline Alerts
If a screen goes silent (e.g., power failure or internet disconnect) for **longer than 12 minutes**, `backend/index.js` sends an instant Telegram alert message to your mobile phone:
> 🚨 **Offline Alert**  
> Screen: **Main Store TV**  
> Status: Stopped sending heartbeats.

When the screen turns back on, it sends a recovery message:
> ✅ **Online Alert**  
> Screen: **Main Store TV**  
> Status: Reconnected & Heartbeat received.

---

## 5. Complete File-by-File Inventory

### 📁 Root Directory (`/`)
* **`README.md`**: Master repository documentation and system architecture guide.
* **`.gitignore`**: Excludes `node_modules/`, secret keys (`.env`), and temporary files from Git.
* **`.gitattributes`**: Ensures cross-platform text line-ending compatibility.

### 📁 Backend Directory (`/backend`)
* **`backend/index.js`**: Core Node.js backend server. Manages in-memory screen cache, 15-second IST schedule checks, Telegram alerts, and HTTP keep-alive server.
* **`backend/package.json`**: Node.js dependencies (`firebase-admin`).
* **`backend/package-lock.json`**: Exact version lockfile.
* **`backend/.env`**: Secret keys for Telegram Bot tokens and Firebase Service Accounts.

### 📁 Dashboard Directory (`/dashboard`)
* **`dashboard/index.html`**: Master HTML structure for the admin management console.
* **`dashboard/app.js`**: Bootstrap application logic, module initialization, tab routing, and Render keep-alive pinger.
* **`dashboard/config.js`**: Production configuration file containing Firebase, Supabase, Cloudflare R2, TURN, and Render URLs.
* **`dashboard/config.example.js`**: Template configuration file for setup.
* **`dashboard/style.css`**: Styling, responsive layouts, glassmorphism cards, and live WebRTC video canvas.
* **`dashboard/sw.js`**: Service worker for offline static asset caching.
* **`dashboard/_redirects` & `netlify.toml`**: Hosting routing configurations.

### 📁 Dashboard Modules (`/dashboard/modules`)
* **`screens.js`**: Screen pairing, status filters, layouts, rotation, tickers, mass launch.
* **`scheduler.js`**: 24/7 multi-slot schedules, time normalization, active slot calculation, live status chips.
* **`playlists.js`**: Ad playlist creation, media ordering, item durations.
* **`groups.js`**: Screen group creation and bulk configuration deployment.
* **`liveview.js`**: Single-screen WebRTC live stream with BGR-to-RGB color transformation.
* **`livewall.js`**: Multi-screen grid video wall WebRTC view.
* **`r2upload.js`**: Direct Cloudflare R2 storage uploader.
* **`preview.js`**: Simulated screen player modal.
* **`analytics.js`**: Aggregates play counts and play durations for client billing reports.
* **`auth.js`**: Firebase Admin authentication login/logout manager.
* **`firebase.js`**: Initializes Firebase App SDK and exports Firestore database reference.
* **`ui.js`**: Toast notification alert manager.
* **`state.js`**: Global reactive application state cache (`appState`).

---

## 6. System Rules, Guardrails & Limitations

1. **Auto-Scheduler Manual Lock**: When Auto-Scheduler is enabled on a screen (`schedulerEnabled: true`), manual playlist selection on the Screens tab is locked (`🔒 Scheduler ON`) to prevent operator error. To push a manual playlist, toggle Auto-Scheduler OFF first.
2. **Render 1-Service Rule**: Deploy only **1 Web Service** on your free Render account so it stays within the 750 free hours/month limit.
3. **Timezone Standardization**: All cloud schedules are evaluated in **Indian Standard Time (IST = UTC+5:30)**. Internal clock settings on physical TV hardware do not affect schedule timing.

---

## 7. Step-by-Step Operator Troubleshooting

### Issue 1: "I set a schedule, but the TV is playing the old playlist."
* **Cause**: You modified the time slots but forgot to click **Save schedule**.
* **Fix**: In the **Scheduler** tab, click the blue **`Save schedule`** button on that screen's card. Check that the badge changes to `Up to date`.

### Issue 2: "The dashboard shows 'Scheduler ON' and I can't change the playlist on the Screens tab."
* **Cause**: Auto-Scheduler is active for that screen.
* **Fix**: If you want to push a manual playlist, go to the **Scheduler** tab and toggle Auto-Scheduler **OFF** for that screen.

### Issue 3: "A screen is showing Offline in the dashboard."
* **Cause**: The TV has lost internet connectivity, power, or the TV player app was closed.
* **Fix**: Check power cables and Wi-Fi on the TV. Once reconnected, the screen status will change to `Online` within 30 seconds.

---

© 2026 Harsha Vardhan Eudu. All Rights Reserved. Proprietary software for Bhimavaram Digitals.
