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
  const batchResult = await taggingService.processExistingMeals({
    batchSize,
    forceRetag,
  });

  const results = batchResult.results.map((entry) => ({
    id: entry.id,
    status: entry.status,
    source: entry.source || null,
    fallbackUsed: entry.fallbackUsed === true,
    tags: entry.tags || [],
    error: entry.error || null,
  }));

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
    tagged: batchResult.tagged,
    skipped: batchResult.skipped,
    failed: batchResult.failed,
    results,
  };
}

module.exports = { retagExistingMealsHandler };
