function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

class MealTaggingQueue {
  constructor({ worker, debounceMs = 5000, log = console }) {
    this.worker = worker;
    this.debounceMs = debounceMs;
    this.log = log;
    this.queue = [];
    this.pendingJobs = new Map();
    this.timerHandles = new Map();
    this.processing = false;
    this.started = false;
  }

  start() {
    if (this.started) {
      return;
    }

    this.started = true;
    this.log.info("[meal-tagging] Queue started");
    this._pump();
  }

  stop() {
    this.started = false;
    for (const handle of this.timerHandles.values()) {
      clearTimeout(handle);
    }
    this.timerHandles.clear();
  }

  enqueue({ mealId, reason = "unknown", priority = 0, force = false, debounceMs = this.debounceMs }) {
    if (!mealId) {
      return Promise.resolve({ status: "skipped", reason: "missing-meal-id" });
    }

    const existing = this.pendingJobs.get(mealId);
    if (existing && !force) {
      existing.reason = reason;
      existing.priority = Math.max(existing.priority, priority);
      if (existing.status === "debouncing") {
        this._reschedule(mealId, debounceMs);
      }
      this.log.info(`[meal-tagging] Debounced duplicate for ${mealId}`);
      return existing.promise;
    }

    if (existing && force) {
      this._cancel(mealId);
    }

    const deferred = createDeferred();
    const job = {
      mealId,
      reason,
      priority,
      force,
      status: "debouncing",
      createdAt: Date.now(),
      promise: deferred.promise,
      resolve: deferred.resolve,
      reject: deferred.reject,
    };

    this.pendingJobs.set(mealId, job);
    this._reschedule(mealId, debounceMs);
    this.log.info(`[meal-tagging] Debounce scheduled for ${mealId} (${reason})`);
    return job.promise;
  }

  forget(mealId) {
    this._cancel(mealId);
  }

  _cancel(mealId) {
    const timerHandle = this.timerHandles.get(mealId);
    if (timerHandle) {
      clearTimeout(timerHandle);
    }

    this.timerHandles.delete(mealId);
    this.pendingJobs.delete(mealId);
  }

  _reschedule(mealId, debounceMs) {
    const existingHandle = this.timerHandles.get(mealId);
    if (existingHandle) {
      clearTimeout(existingHandle);
    }

    const handle = setTimeout(() => {
      this.timerHandles.delete(mealId);
      const job = this.pendingJobs.get(mealId);
      if (!job) {
        return;
      }

      job.status = "queued";
      this.queue.push(job);
      this.queue.sort((a, b) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }

        return a.createdAt - b.createdAt;
      });

      this.log.info(`[meal-tagging] Job queued for ${mealId}`);
      this._pump();
    }, debounceMs);

    this.timerHandles.set(mealId, handle);
  }

  async _pump() {
    if (!this.started || this.processing) {
      return;
    }

    this.processing = true;

    while (this.started && this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job || !this.pendingJobs.has(job.mealId)) {
        continue;
      }

      job.status = "processing";
      this.log.info(`[meal-tagging] Worker picked ${job.mealId}`);

      try {
        const result = await this.worker.process(job);
        job.resolve(result);
      } catch (error) {
        this.log.error(`[meal-tagging] Worker error for ${job.mealId}:`, error);
        job.resolve({ status: "failed", mealId: job.mealId, error: error.message });
      } finally {
        this.pendingJobs.delete(job.mealId);
      }
    }

    this.processing = false;
  }
}

module.exports = { MealTaggingQueue };