const crypto = require("crypto");
const {
  MEALS_COLLECTION,
  hasMealContent,
  getMealName,
  extractMealIngredients,
  tagMealWithGemini,
} = require("../meal_tagger");
const {
  generateRuleBasedTags,
  scoreRuleConfidence,
  buildRuleBasedFallback,
} = require("./meal_tagging_fallback");

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

function buildMealSignature(meal = {}) {
  const name = String(meal.mealName || meal.name || meal.title || "").trim().toLowerCase();
  const ingredients = extractMealIngredients(meal);
  const ingredientText = Array.isArray(ingredients)
    ? ingredients.map((item) => String(item).trim().toLowerCase()).sort().join("|")
    : String(ingredients || "").trim().toLowerCase();

  return crypto
    .createHash("sha256")
    .update(`${name}::${ingredientText}`)
    .digest("hex");
}

class MealTaggingWorker {
  constructor({
    admin,
    cache,
    quota,
    log = console,
    maxRetries = 3,
    baseDelayMs = 5000,
    maxRequestsPerMinute = 3,
    minRuleTagCount = 4,
    aiAttemptCooldownMs = 6 * 60 * 60 * 1000,
  }) {
    this.admin = admin;
    this.db = admin.firestore();
    this.cache = cache;
    this.quota = quota;
    this.log = log;
    this.maxRetries = maxRetries;
    this.baseDelayMs = baseDelayMs;
    this.maxRequestsPerMinute = maxRequestsPerMinute;
    this.minRuleTagCount = minRuleTagCount;
    this.aiAttemptCooldownMs = aiAttemptCooldownMs;
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
    const signature = buildMealSignature(meal);

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

      if (
        meal.autoTagSignature === signature &&
        Array.isArray(meal.tags) &&
        meal.tags.length > 0
      ) {
        this.log.info(`[meal-tagging] Already tagged ${mealId} (${getMealName(meal)}), skipping`);
        this.cache.set(mealId, signature, { autoTagged: true, autoTagSignature: signature });
        return { status: "skipped", mealId, reason: "already-tagged" };
      }
    }

    // Step 1-4: rule-based tags first, confidence gate
    const ruleTags = generateRuleBasedTags(meal);
    const ruleConfidence = scoreRuleConfidence(ruleTags);
    const strongRuleResult = ruleTags.tags.length >= this.minRuleTagCount;
    const hasFoodTypeTag = ["snack", "breakfast", "lunch", "dinner"].some(
      (tag) => Array.isArray(ruleTags.tags) && ruleTags.tags.includes(tag)
    );
    const shouldTryAi = !strongRuleResult || !hasFoodTypeTag;

    let finalTagData = {
      ...ruleTags,
      autoTagged: true,
      autoTagModel: "rule-based",
      autoTagConfidence: ruleConfidence,
      autoTagError: this.admin.firestore.FieldValue.delete(),
      autoTaggedAt: this.admin.firestore.FieldValue.serverTimestamp(),
    };

    if (shouldTryAi) {
      const aiDecision = await this._canAttemptAi(meal);
      if (aiDecision.allowed) {
        const aiAttemptFields = {
          autoTagAiAttemptAt: this.admin.firestore.FieldValue.serverTimestamp(),
          autoTagAiAttempts: this.admin.firestore.FieldValue.increment(1),
        };

        await this.throttle();
        this.log.info(`[meal-tagging] AI call starting for ${mealId} (${getMealName(meal)}), reason=${reason}`);

        const aiTagData = await tagMealWithGemini({
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

        if (aiTagData.autoTagged === true && Array.isArray(aiTagData.tags) && aiTagData.tags.length > 0) {
          finalTagData = {
            ...aiTagData,
            ...aiAttemptFields,
            autoTagged: true,
            autoTagModel: "gemini",
            autoTagError: this.admin.firestore.FieldValue.delete(),
            autoTaggedAt: this.admin.firestore.FieldValue.serverTimestamp(),
          };
        } else {
          this.log.warn(`[meal-tagging] AI failed for ${mealId}. Using fallback rules.`);
          finalTagData = {
            ...buildRuleBasedFallback(meal, aiTagData.autoTagError || "ai_failed"),
            ...aiAttemptFields,
            autoTaggedAt: this.admin.firestore.FieldValue.serverTimestamp(),
          };
        }
      } else {
        this.log.warn(`[meal-tagging] AI skipped for ${mealId}: ${aiDecision.reason}`);
        finalTagData = {
          ...buildRuleBasedFallback(meal, aiDecision.reason),
          autoTaggedAt: this.admin.firestore.FieldValue.serverTimestamp(),
        };
      }
    }

    // Critical guarantee: never persist empty tags
    if (!Array.isArray(finalTagData.tags) || finalTagData.tags.length === 0) {
      finalTagData = {
        ...buildRuleBasedFallback(meal, "empty_tags_guard"),
        autoTaggedAt: this.admin.firestore.FieldValue.serverTimestamp(),
      };
    }

    const persisted = buildPersistedTagData(finalTagData, signature);
    await ref.update(persisted);

    this.cache.set(mealId, signature, persisted);

    return {
      status: "processed",
      mealId,
      signature,
      source: persisted.autoTagModel,
      fallbackUsed: persisted.autoTagModel !== "gemini",
      tags: persisted.tags || [],
    };
  }

  async _canAttemptAi(meal) {
    const now = Date.now();
    const lastAttemptAt = meal.autoTagAiAttemptAt;
    let lastAttemptMs = 0;

    if (lastAttemptAt && typeof lastAttemptAt.toDate === "function") {
      lastAttemptMs = lastAttemptAt.toDate().getTime();
    } else if (typeof lastAttemptAt === "string" || typeof lastAttemptAt === "number") {
      lastAttemptMs = new Date(lastAttemptAt).getTime();
    }

    if (lastAttemptMs > 0 && now - lastAttemptMs < this.aiAttemptCooldownMs) {
      return { allowed: false, reason: "recent_ai_attempt" };
    }

    if (!this.quota) {
      return { allowed: false, reason: "quota_not_initialized" };
    }

    const quotaReservation = await this.quota.reserveSlot();
    if (!quotaReservation.allowed) {
      return { allowed: false, reason: "daily_quota_exceeded" };
    }

    return { allowed: true, reason: "ai_allowed" };
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

module.exports = { MealTaggingWorker, buildMealSignature };