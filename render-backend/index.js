const express = require("express");
const admin = require("firebase-admin");
const { onCall } = require("./compat/callable");
const { startListeners } = require("./listeners");
const { notifyChefHandler } = require("./handlers/notifyChef");
const { retagExistingMealsHandler } = require("./handlers/retagExistingMeals");
const { initializeMealTaggingService } = require("./tagging/meal_tagging_service");

// ── Firebase Admin Init ──────────────────────────────────────────────────────
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

initializeMealTaggingService({ admin, log: console });

const app = express();
app.use(express.json());

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.json({ status: "ok", service: "fuelup-backend" }));

// ── HTTP / Callable endpoints ─────────────────────────────────────────────────
// Flutter uses Firebase callable format: POST /notifyChef  with { data: { ... } }
app.post("/notifyChef", onCall(notifyChefHandler));
app.post("/retagExistingMeals", onCall(retagExistingMealsHandler));

// ── Start background listeners (replaces Firestore/RTDB triggers) ─────────────
startListeners(admin);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[fuelup] Server running on port ${PORT}`);
});
