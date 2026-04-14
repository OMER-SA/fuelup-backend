const { MealTagCache } = require("./meal_tagging_cache");
const { MealTaggingQueue } = require("./meal_tagging_queue");
const { MealTaggingWorker } = require("./meal_tagging_worker");

let singleton = null;

function initializeMealTaggingService({ admin, log = console }) {
  if (singleton) {
    return singleton;
  }

  const cache = new MealTagCache();
  const worker = new MealTaggingWorker({
    admin,
    cache,
    log,
    maxRetries: 3,
    baseDelayMs: 5000,
    maxRequestsPerMinute: 3,
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
    forget(mealId) {
      queue.forget(mealId);
      cache.clear(mealId);
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