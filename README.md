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
- If a **preset** exists → calories auto-fill (no AI call).
- If not → AI estimates calories.
- User confirms/edits calories.
- Confirmed calories are saved to the entry.

### ⭐ Reusable Meal Presets (“My usuals”)
- Checkbox **Save as preset** when adding a meal.
- User can **rename the preset**.
- Presets store:
  - normalized key  
  - label  
  - default calories  
- Next time the same description appears:
  - calories auto-fill  
  - preset label appears  
  - no AI call needed  
- Manage presets from the **Presets** tab (rename, update calories, delete).

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
- Export all data (logs, insights, presets, jobs) as JSON
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
- `foodPresets`

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
```bash
npm run deploy
```

### Build Android APK (optional)
```bash
npx cap add android
npx cap copy
npx cap open android
```

---

## ⚠️ Current Limitations

- Weekly/monthly analyses not yet implemented
- Custom analysis uses placeholder
- Drive sync is manual (no scheduled/auto backup yet)

---

## 📌 Roadmap

### Short-term
- Weekly & monthly insights  
- Custom analysis prompts  

### Mid‑term
- Google Drive sync  
- Offline AI queue  
- Charts  

### Long‑term
- Macro detection  
- Photo-based meal recognition  
- Portion scaling of presets  

---

## ❤️ Philosophy

Food Coach is designed to be:

- local-first  
- privacy-respecting  
- AI-powered  
- actionable  
- personalized  

A coach that helps you understand your body — not just track calories.
