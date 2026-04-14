# FuelUp Backend — Render Deployment Guide

Replaces Firebase Cloud Functions entirely. Runs on Render's **free tier**.

## File Structure

```
fuelup-backend/
├── index.js              # Express server entry point
├── listeners.js          # Background listeners (replaces RTDB + Firestore triggers)
├── meal_tagger.js        # Gemini AI meal tagging logic (copied from functions/)
├── compat/
│   └── callable.js       # Firebase callable shim for Flutter compatibility
├── handlers/
│   ├── notifyChef.js     # POST /notifyChef
│   └── retagExistingMeals.js  # POST /retagExistingMeals
├── package.json
├── render.yaml           # Render deployment config
└── .gitignore
```

## Function Mapping

| Original Firebase Function    | Replacement                          |
|-------------------------------|--------------------------------------|
| `onOrderStatusChanged` (RTDB) | `listeners.js` — RTDB onSnapshot     |
| `notifyChef`                 | `POST /notifyChef`                    |
| `autoTagMeal`                | `listeners.js` — Firestore onSnapshot|
| `reTagOnIngredientUpdate`    | `listeners.js` — Firestore onSnapshot|
| `retagExistingMeals`         | `POST /retagExistingMeals`           |

---

## Step 1 — Get Firebase Service Account Key

1. Go to: https://console.firebase.google.com/project/fuelup-2e090/settings/serviceaccounts/adminsdk
2. Click **"Generate new private key"**
3. Download the JSON file
4. Open it and copy the **entire contents** (you'll need this in Step 4)

---

## Step 2 — Push this folder to GitHub

```bash
cd fuelup-backend
git init
git add .
git commit -m "Initial commit"
# Create a new repo on GitHub called fuelup-backend, then:
git remote add origin https://github.com/YOUR_USERNAME/fuelup-backend.git
git push -u origin main
```

---

## Step 3 — Create Render Web Service

1. Go to: https://render.com and sign up (free)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub account and select the `fuelup-backend` repo
4. Render auto-detects `render.yaml` — confirm the settings:
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free

---

## Step 4 — Set Environment Variables in Render

In your Render service dashboard → **"Environment"** tab, add these 3 variables:

### `FIREBASE_SERVICE_ACCOUNT_JSON`
Paste the **entire contents** of the service account JSON file you downloaded in Step 1.
It should look like:
```json
{"type":"service_account","project_id":"fuelup-2e090","private_key_id":"...","private_key":"-----BEGIN RSA PRIVATE KEY-----\n...","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}
```

### `FIREBASE_DATABASE_URL`
```
https://fuelup-2e090-default-rtdb.firebaseio.com
```

### `GEMINI_API_KEY`
Your Gemini API key from: https://aistudio.google.com/app/apikey

---

## Step 5 — Deploy

Click **"Deploy"** in Render. Watch the logs — you should see:
```
[fuelup] Server running on port 10000
[listeners] RTDB order status listener started
[listeners] Firestore meal listener started
```

Your backend URL will be something like:
```
https://fuelup-backend.onrender.com
```

---

## Step 6 — Update Flutter App

In your Flutter app, replace Firebase callable function calls with HTTP calls to your Render URL.

### notifyChef

**Before (Firebase):**
```dart
final response = await http.post(
  Uri.parse('https://fuelup-backend.onrender.com/notifyChef'),
  headers: {'Content-Type': 'application/json'},
  body: jsonEncode({
    'data': {'chefId': id, 'title': title, 'body': body},
  }),
);
```

### retagExistingMeals

**Before (Firebase):**
```dart
final response = await http.post(
  Uri.parse('https://fuelup-backend.onrender.com/retagExistingMeals'),
  headers: {'Content-Type': 'application/json'},
  body: jsonEncode({
    'data': {'batchSize': 20, 'forceRetag': false},
  }),
);
```

> The backend expects the same `{ "data": {...} }` request shape as the
> client posts to `/notifyChef` and `/retagExistingMeals`.

---

## Important Notes

### Free Tier Spin-down
Render's free tier spins down after 15 minutes of inactivity. When a request
comes in after spin-down, it takes ~30 seconds to wake up. The background
listeners (order status, meal tagging) restart automatically on wake.

**To avoid spin-down** (optional): Use a free uptime monitor like
https://uptimerobot.com to ping `https://fuelup-backend.onrender.com/` every
10 minutes.

### Background Listeners on Restart
When the server restarts, the Firestore listener replays recent changes.
The `mealCache` is rebuilt from the initial snapshot so ingredient-change
detection works correctly after restart.
