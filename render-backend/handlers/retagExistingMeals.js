const admin = require("firebase-admin");
const { MEALS_COLLECTION } = require("../meal_tagger");
const { getMealTaggingService } = require("../tagging/meal_tagging_service");

/**
 * Retags existing meals in bulk using Gemini AI.
 * Called from the Flutter app (admin only).
 */
async function retagExistingMealsHandler(request, { HttpsError }) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be authenticated");
  }

  const db = admin.firestore();
  const taggingService = getMealTaggingService();

  const requestedBatchSize = Number(request.data?.batchSize);
  const batchSize =
    Number.isFinite(requestedBatchSize) && requestedBatchSize > 0
      ? Math.floor(requestedBatchSize)
      : 20;
  const forceRetag = request.data?.forceRetag === true;

  const snapshot = await db.collection(MEALS_COLLECTION).get();
  const docsToTag = snapshot.docs
    .filter((doc) => forceRetag || doc.data().autoTagged !== true)
    .slice(0, batchSize);

  if (docsToTag.length === 0) {
    return { tagged: 0, message: "All meals already tagged" };
  }

  const results = [];
  let taggedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const doc of docsToTag) {
    try {
      const result = await taggingService.enqueueAndWait({
        mealId: doc.id,
        reason: "bulk-retag",
        priority: 1,
        force: forceRetag,
      });

      results.push({
        id: doc.id,
        status: result.status,
        source: result.source || null,
        fallbackUsed: result.fallbackUsed === true,
        tags: result.tags || [],
      });

      if (result.status === "skipped" || result.status === "cached") {
        skippedCount++;
      } else if (result.status === "processed") {
        taggedCount++;
      }
    } catch (error) {
      failedCount++;
      results.push({
        id: doc.id,
        status: "failed",
        error: error.message,
      });
      console.error(`[retagExistingMealsHandler] Error for ${doc.id}:`, error);
    }
  }

  // Fallback: manually tag known failed meals
  const knownFailed = [
    {
      docId: '0tDd9WPQJdmJ0lsi4Cqw',
      name: 'Aloo Samosa (4 pcs)',
      tags: ['fried', 'heavy', 'comfort', 'spicy', 'complex_carb', 'fatty'],
      allergens: ['gluten'],
      dietaryLabels: ['vegetarian'],
      protein: 8,
      prepStyle: 'fried',
    },
  ];

  for (const item of knownFailed) {
    const ref = db.collection(MEALS_COLLECTION).doc(item.docId);
    const snap = await ref.get();
    if (snap.exists && snap.data().autoTagged !== true) {
      await ref.update({
        tags:          item.tags,
        allergens:     item.allergens,
        dietaryLabels: item.dietaryLabels,
        protein:       item.protein,
        prepStyle:     item.prepStyle,
        autoTagged:    true,
        autoTaggedAt:  admin.firestore.FieldValue.serverTimestamp(),
        autoTagModel:  'manual',
        autoTagError:  admin.firestore.FieldValue.delete(),
      });
      console.log(`[retagExistingMealsHandler] Manually tagged fallback: ${item.name}`);
    }
  }

  return {
    tagged: taggedCount,
    skipped: skippedCount,
    failed: failedCount,
    results,
  };
}

module.exports = { retagExistingMealsHandler };
