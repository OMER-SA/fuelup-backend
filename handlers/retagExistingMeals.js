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

    await doc.ref.update(tagData);
    results.push({
      id: doc.id,
      tags: tagData.tags,
      autoTagged: tagData.autoTagged === true,
      error: tagData.autoTagError || null,
    });

    if (tagData.autoTagged === true) taggedCount++;

    await new Promise((resolve) => setTimeout(resolve, 1100));
  }

  return { tagged: taggedCount, results };
}

module.exports = { retagExistingMealsHandler };
