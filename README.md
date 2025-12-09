# Food Coach – Local-Only Food & Health Advisor

Food Coach is a fully client-side nutrition, journaling, and daily-health tracking app with lightweight AI assistance. It runs entirely in the browser, stores data in IndexedDB, and sends model calls straight to OpenAI using the user’s own API key—no accounts or servers required.

---

## Core Idea

Most food trackers only tally calories. Food Coach tries to explain trends in weight, bloating, energy, and habits by examining the past two weeks of logs. Each night at 22:00 the app creates a structured “insight” that highlights contributing factors, suggests next steps, and records caveats. Everything stays on-device except outbound LLM calls, and those are authenticated with the user’s key.

---

## Features

### Meal logging with calorie estimates
- Accepts natural-language meal descriptions.
- Calls an LLM for an initial calorie estimate that the user can confirm or edit.
- Saves the confirmed value alongside any free-form notes.

### Automatic daily insights
- Reviews recent sleep, stress, weight, meals, and notes.
- Generates explanations for weight changes or bloating, pattern summaries, and recommended actions.
- Stores insights in IndexedDB for later review.

### History page
- Lists meals, symptoms, and biometrics with timestamps.
- Allows expanding entries for detailed notes.
- Indicates whether a given day already has an insight.

### Insights page
- Shows every stored insight in chronological order.
- Supports re-running the daily insight for a past date.
- Includes a placeholder for custom time-range analysis.

### Settings and data management
- Saves the OpenAI API key locally.
- Exports all data (logs, insights, jobs) as JSON.
- Provides manual Google Drive backup/restore using `VITE_GOOGLE_CLIENT_ID` (default `130912411880-u34hui50kge8g4kjvc7m88slfsoutrj5.apps.googleusercontent.com`).
- Offers a “danger zone” action to clear local data.

### Local-first storage and PWA support
- Dexie/IndexedDB persistence keeps data entirely in the browser.
- The PWA shell works offline aside from outbound AI calls.
- Static build is suitable for GitHub Pages hosting or bundling into an Android APK.

---

## Technical Architecture

- React 18
- Vite
- TypeScript
- Tailwind CSS
- React Router
- Dexie / IndexedDB
- `vite-plugin-pwa`

### AI integration
- Uses OpenAI `gpt-4.1-mini` by default.
- Requests originate directly from the browser.
- The user’s API key is stored in `localStorage`.

### Database schema
- `dailyLogs`
- `dailyInsights`
- `analysisJobs`

---

## Development

```bash
npm install
npm run dev
```

Local dev server: `http://localhost:5173/food-coach/`. Add your OpenAI key in **Settings** before running analyses.

---

## Building

### Build static files
```bash
npm run build
```

### Deploy to GitHub Pages
1. In GitHub → Settings → Pages, set **Build and deployment** to **GitHub Actions**.
2. Push to `main` (or manually trigger the “Deploy to GitHub Pages” workflow). `.github/workflows/deploy.yml` installs dependencies, runs the Vite build, uploads `dist/`, and publishes to Pages.
3. GitHub serves the site from `https://<username>.github.io/food-coach/` via the generated `gh-pages` branch.

Need a one-off manual deployment instead? `npm run deploy` still pushes the local `dist/` folder to `gh-pages` through the [`gh-pages`](https://www.npmjs.com/package/gh-pages) CLI.

### Build Android APK (optional)
Prerequisites: Android SDK + Java 17, `android/local.properties` pointing to the SDK, and `npx cap add android` executed once.

```bash
# build with the Capacitor-friendly base path
npm run build:android
npx cap sync android
cd android && GRADLE_USER_HOME=../.gradle ./gradlew assembleDebug
# install on a connected device
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Open Android Studio with `npx cap open android` if you prefer the IDE. For releases, create a signed `assembleRelease` build with your keystore.

---

## Current Limitations

- Weekly/monthly analysis views are not implemented.
- Custom analysis still uses a placeholder.
- Google Drive sync is manual and unscheduled.

---

## Project Principles

Food Coach aims to be local-first, privacy-respecting, actionable, and personalized. It is intentionally client-only so users keep control over their data while still benefiting from helpful explanations of their daily habits.
