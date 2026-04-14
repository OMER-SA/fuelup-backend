const admin = require("firebase-admin");
const { MEALS_COLLECTION, tagMealWithGemini } = require("../meal_tagger");

/**
 * Retags existing meals in bulk using Gemini AI.
 * Called from the Flutter app (admin only).
 */
async function retagExistingMealsHandler(request, { HttpsError }) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be authenticated");
  }

  const db = admin.firestore();
  const apiKey = process.env.GEMINI_API_KEY;

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

  for (const doc of docsToTag) {
    const tagData = await tagMealWithGemini({
      mealId: doc.id,
      mealData: doc.data(),
      apiKey,
      admin,
      log: console,
    });

    // Clear autoTagError on success, keep it on failure
    if (tagData.autoTagged === true) {
      tagData.autoTagError = admin.firestore.FieldValue.delete();
    }

    await doc.ref.update(tagData);
    results.push({
      id: doc.id,
      tags: tagData.tags,
      autoTagged: tagData.autoTagged === true,
      error: tagData.autoTagError || null,
    });

    if (tagData.autoTagged === true) taggedCount++;

    await new Promise((resolve) => setTimeout(resolve, 3000));
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

  return { tagged: taggedCount, results };
}

module.exports = { retagExistingMealsHandler };
