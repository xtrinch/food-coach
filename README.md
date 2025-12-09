# Food Coach – Local‑Only AI Food & Health Advisor

Food Coach is a **fully client-side nutrition, notes, and daily-health tracking app** with **AI‑powered insights**.  
It runs entirely on the user’s device, stores all data locally using IndexedDB, and uses the **user’s own OpenAI API key** for all AI calls.

No backend. No server. No accounts.  
Just a static React/Vite app that you can install as a PWA or bundle into an Android APK.

---

## ⭐ Core Idea

Traditional food tracking apps only count calories.  
Food Coach aims to *explain your body* using AI:

- Why your weight changed
- Why you feel bloated
- Why your energy is low
- What patterns exist in your recent logs
- What actionable steps to take tomorrow

Every night around **22:00**, the app automatically generates a daily AI insight.

Everything stays on the device.  
Only LLM calls go to OpenAI using the user’s own key.

---

## ✨ Features

### 🥣 Meal Logging with AI Calorie Estimation
- User types any natural-language meal description.
- AI estimates calories.
- User confirms/edits calories.
- Confirmed calories are saved to the entry.
### 🧠 Automatic Daily Insights (22:00)
Analyzes:
- sleep
- stress
- weight
- meals
- notes  
…over the last ~14 days.

Generates:
- weight explanation  
- bloating explanation  
- patterns  
- actions for tomorrow  
- caveats  

Stored forever in IndexedDB.

### 📅 History Page
- Meals + timestamps
- Symptoms
- Weight, sleep, stress
- Expandable details
- Shows whether a daily insight exists

### 🔍 Insights Page
- All generated insights
- Re-run daily insight for any day
- Custom period analysis (placeholder)

### ⚙️ Settings
- Save OpenAI API key (local)
- Export all data (logs, insights, jobs) as JSON
- Manual Google Drive backup/restore (private app data)
- Clear all local data (danger zone)
  
Google Drive uses a baked-in OAuth client ID (env `VITE_GOOGLE_CLIENT_ID`, default: `130912411880-u34hui50kge8g4kjvc7m88slfsoutrj5.apps.googleusercontent.com`).

### 💾 Local-Only Storage
- IndexedDB via Dexie
- All data lives in user's browser

### 📱 Installable PWA
- Works offline except AI calls
- Usable on mobile + desktop
- Perfect for hosting on GitHub Pages

---

## 🧱 Technical Architecture

- **React 18**
- **Vite**
- **TypeScript**
- **Tailwind CSS**
- **React Router**
- **Dexie / IndexedDB**
- **vite-plugin-pwa**

### AI
- OpenAI `gpt-4.1-mini` by default
- Browser → OpenAI direct
- Uses user’s API key from localStorage

### Database Schema
- `dailyLogs`
- `dailyInsights`
- `analysisJobs`

---

## 🛠 Development

```bash
npm install
npm run dev
```

App will run under:

```
http://localhost:5173/food-coach/
```

Paste your OpenAI API key into **Settings**.

---

## 🚀 Building

### Build static files
```bash
npm run build
```

### Deploy to GitHub Pages
1. Ensure **Settings → Pages → Build and deployment** is set to *GitHub Actions*.
2. Push to `main` (or run the `Deploy to GitHub Pages` workflow manually) and let `.github/workflows/deploy.yml` build + publish the `dist/` output.
3. GitHub serves the site from `https://<username>.github.io/food-coach/` using the generated `gh-pages` branch.

> Need a one-off manual deploy? `npm run deploy` still pushes the latest local `dist/` folder to the `gh-pages` branch via the [`gh-pages`](https://www.npmjs.com/package/gh-pages) CLI.

### Build Android APK (optional)
Prereqs: Android SDK + Java 17 installed (project targets Java 17 by default), `android/local.properties` points to your SDK. Run `npx cap add android` once to create the native project (already in repo).

```bash
# build with Capacitor-friendly base path
npm run build:android
npx cap sync android
cd android && GRADLE_USER_HOME=../.gradle ./gradlew assembleDebug
# install to a plugged-in device with USB debugging on:
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Open the project in Android Studio instead of CLI: `npx cap open android`. For distribution, create a signed release build (`assembleRelease`) with your signing config.

---

## ⚠️ Current Limitations

- Weekly/monthly analyses not yet implemented
- Custom analysis uses placeholder
- Drive sync is manual (no scheduled/auto backup yet)

---

## ❤️ Philosophy

Food Coach is designed to be:

- local-first  
- privacy-respecting  
- AI-powered  
- actionable  
- personalized  

A coach that helps you understand your body — not just track calories.
