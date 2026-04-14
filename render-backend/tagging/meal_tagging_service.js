const { MealTagCache } = require("./meal_tagging_cache");
const { MealTaggingQueue } = require("./meal_tagging_queue");
const { MealTaggingWorker } = require("./meal_tagging_worker");
const { DailyAiQuota } = require("./meal_tagging_quota");
const { MEALS_COLLECTION } = require("../meal_tagger");

let singleton = null;

function initializeMealTaggingService({ admin, log = console, freeMode = true }) {
  if (singleton) {
    return singleton;
  }

  const cache = new MealTagCache();
  const db = admin.firestore();
  const quota = new DailyAiQuota({
    db,
    log,
    maxPerDay: 18,
  });

  const worker = new MealTaggingWorker({
    admin,
    cache,
    quota,
    log,
    maxRetries: 3,
    baseDelayMs: 5000,
    maxRequestsPerMinute: 3,
    minRuleTagCount: 2,
    freeMode,
  });

  const queue = new MealTaggingQueue({
    worker,
    debounceMs: 5000,
    log,
  });

  singleton = {
    cache,
    worker,
    queue,
    start() {
      queue.start();
    },
    enqueue(job) {
      return queue.enqueue(job);
    },
    enqueueAndWait(job) {
      return queue.enqueue({ ...job, debounceMs: 0 });
    },
    async processExistingMeals({ batchSize = 50, forceRetag = false } = {}) {
      const snapshot = await db.collection(MEALS_COLLECTION).get();
      const docsToTag = snapshot.docs
        .filter((doc) => forceRetag || !Array.isArray(doc.data().tags) || doc.data().tags.length === 0)
        .slice(0, batchSize);

      let tagged = 0;
      let skipped = 0;
      let failed = 0;
      const results = [];

      for (const doc of docsToTag) {
        try {
          const result = await queue.enqueue({
            mealId: doc.id,
            reason: "process-existing",
            priority: 1,
            force: forceRetag,
            debounceMs: 0,
          });

          results.push({ id: doc.id, ...result });
          if (result.status === "processed") tagged++;
          else skipped++;
        } catch (error) {
          failed++;
          results.push({ id: doc.id, status: "failed", error: error.message });
        }
      }

      return {
        tagged,
        skipped,
        failed,
        considered: docsToTag.length,
        results,
      };
    },
    forget(mealId) {
      queue.forget(mealId);
      cache.clear(mealId);
    },
    /**
     * EXPLICIT AI ENHANCEMENT (Admin-only)
     *
     * Attempts to enhance existing meal tags using Gemini API.
     * Respects FREE_MODE and quota limits.
     * NOT triggered automatically.
     *
     * Usage:
     *   taggingService.enhanceMealWithAi(mealId)
     *
     * Returns:
     *   { status: "enhanced|blocked|failed|error", mealId, ... }
     */
    async enhanceMealWithAi(mealId) {
      return worker.enhanceMealWithAi(mealId);
    },
  };

  singleton.start();
  return singleton;
}

function getMealTaggingService() {
  if (!singleton) {
    throw new Error("Meal tagging service has not been initialized.");
  }

  return singleton;
}

module.exports = {
  initializeMealTaggingService,
  getMealTaggingService,
};