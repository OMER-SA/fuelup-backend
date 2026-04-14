const {
  MEALS_COLLECTION,
  hasMealContent,
  getMealName,
  getComparableIngredientSignature,
  tagMealWithGemini,
} = require("../meal_tagger");
const { buildRuleBasedFallback } = require("./meal_tagging_fallback");

function stripDeleteSentinel(value) {
  if (value && typeof value === "object" && value._methodName === "delete") {
    return undefined;
  }

  return value;
}

function buildPersistedTagData(tagData, signature) {
  const persisted = {
    ...tagData,
    autoTagSignature: signature,
    autoTagError: tagData.autoTagged === true ? undefined : tagData.autoTagError,
    autoTagged: true,
  };

  for (const key of Object.keys(persisted)) {
    const normalized = stripDeleteSentinel(persisted[key]);
    if (normalized === undefined) {
      delete persisted[key];
      continue;
    }

    persisted[key] = normalized;
  }

  return persisted;
}

class MealTaggingWorker {
  constructor({ admin, cache, log = console, maxRetries = 3, baseDelayMs = 5000, maxRequestsPerMinute = 3 }) {
    this.admin = admin;
    this.db = admin.firestore();
    this.cache = cache;
    this.log = log;
    this.maxRetries = maxRetries;
    this.baseDelayMs = baseDelayMs;
    this.maxRequestsPerMinute = maxRequestsPerMinute;
    this.aiCallTimestamps = [];
  }

  async process(job) {
    const { mealId, force = false, reason = "unknown" } = job;
    const ref = this.db.collection(MEALS_COLLECTION).doc(mealId);
    const snap = await ref.get();

    if (!snap.exists) {
      this.log.info(`[meal-tagging] Skip missing meal ${mealId} (${reason})`);
      return { status: "skipped", mealId, reason: "missing-document" };
    }

    const meal = snap.data();
    const signature = getComparableIngredientSignature(meal);

    if (!hasMealContent(meal)) {
      this.log.info(`[meal-tagging] Skip ${mealId} (${getMealName(meal)}): no content`);
      return { status: "skipped", mealId, reason: "no-content" };
    }

    if (!force) {
      const cached = this.cache.get(mealId, signature);
      if (cached?.payload?.autoTagged === true) {
        this.log.info(`[meal-tagging] Cache hit for ${mealId} (${getMealName(meal)})`);
        return { status: "cached", mealId, signature };
      }

      if (meal.autoTagged === true && meal.autoTagSignature === signature) {
        this.log.info(`[meal-tagging] Already tagged ${mealId} (${getMealName(meal)}), skipping`);
        this.cache.set(mealId, signature, { autoTagged: true, autoTagSignature: signature });
        return { status: "skipped", mealId, reason: "already-tagged" };
      }
    }

    await this.throttle();
    this.log.info(`[meal-tagging] AI call starting for ${mealId} (${getMealName(meal)}), reason=${reason}`);

    const tagData = await tagMealWithGemini({
      mealId,
      mealData: meal,
      apiKey: process.env.GEMINI_API_KEY,
      admin: this.admin,
      log: this.log,
      retryOptions: {
        maxRetries: this.maxRetries,
        baseDelayMs: this.baseDelayMs,
      },
    });

    const persisted = buildPersistedTagData(
      tagData.autoTagged === true
        ? tagData
        : {
            ...buildRuleBasedFallback(meal, tagData.autoTagError || "Gemini unavailable"),
            autoTagError: undefined,
          },
      signature
    );

    if (persisted.autoTagModel === "fallback-rules") {
      this.log.warn(`[meal-tagging] Fallback used for ${mealId} (${getMealName(meal)})`);
    }

    await ref.update({
      ...persisted,
      autoTagError: this.admin.firestore.FieldValue.delete(),
    });

    this.cache.set(mealId, signature, persisted);

    return {
      status: "processed",
      mealId,
      signature,
      source: persisted.autoTagModel,
      fallbackUsed: persisted.autoTagModel === "fallback-rules",
      tags: persisted.tags || [],
    };
  }

  async throttle() {
    const now = Date.now();
    this.aiCallTimestamps = this.aiCallTimestamps.filter((timestamp) => now - timestamp < 60 * 1000);

    if (this.aiCallTimestamps.length < this.maxRequestsPerMinute) {
      this.aiCallTimestamps.push(now);
      return;
    }

    const oldest = this.aiCallTimestamps[0];
    const delay = Math.max(0, 60 * 1000 - (now - oldest) + 50);
    this.log.warn(`[meal-tagging] Rate limit reached, waiting ${Math.ceil(delay / 1000)}s`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return this.throttle();
  }
}

module.exports = { MealTaggingWorker };