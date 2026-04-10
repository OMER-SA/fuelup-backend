const {
  MEALS_COLLECTION,
  hasMealContent,
  getMealName,
  getComparableIngredientSignature,
  tagMealWithGemini,
} = require("./meal_tagger");

/**
 * Starts all real-time listeners that replace Firebase background triggers.
 * These run as long as the Render server is alive.
 */
function startListeners(admin) {
  const db = admin.firestore();
  const rtdb = admin.database();
  const apiKey = process.env.GEMINI_API_KEY;

  // ── 1. onOrderStatusChanged (was: RTDB onValueUpdated) ───────────────────
  // Listens to every order's status field in Realtime Database.
  // We watch /orders and compare status changes ourselves.
  const orderStatusCache = new Map(); // orderId -> last known status

  rtdb.ref("/orders").on(
    "value",
    async (snapshot) => {
      const orders = snapshot.val();
      if (!orders) return;

      for (const [orderId, orderData] of Object.entries(orders)) {
        const newStatus = orderData?.status;
        const previousStatus = orderStatusCache.get(orderId);

        // Skip if no change or first time seeing this order
        if (previousStatus === undefined) {
          orderStatusCache.set(orderId, newStatus);
          continue;
        }

        if (previousStatus === newStatus) continue;

        // Status changed — update cache and send notification
        orderStatusCache.set(orderId, newStatus);

        try {
          const customerId = orderData.customerId;
          const mealName = orderData.mealName || "your order";

          if (!customerId) continue;

          const userDoc = await admin
            .firestore()
            .collection("users")
            .doc(customerId)
            .get();

          if (!userDoc.exists) {
            console.warn(`[onOrderStatusChanged] User ${customerId} not found`);
            continue;
          }

          const fcmToken = userDoc.data().fcmToken;
          if (!fcmToken || fcmToken === "") {
            console.info(`[onOrderStatusChanged] No FCM token for user ${customerId}`);
            continue;
          }

          let message = "";
          switch (newStatus) {
            case "Preparing":
              message = `Your order '${mealName}' is being prepared.`;
              break;
            case "Ready":
              message = `Your order '${mealName}' is ready.`;
              break;
            case "Delivery in Progress":
              message = `Your order '${mealName}' is on its way!`;
              break;
            case "Delivered":
              message = `Your order '${mealName}' has been delivered.`;
              break;
            default:
              message = `The status of '${mealName}' has been changed to ${newStatus}.`;
          }

          const payload = {
            token: fcmToken,
            notification: { title: "Order Status Update", body: message },
            data: { orderId, status: newStatus },
          };

          const response = await admin.messaging().send(payload);
          console.info(`[onOrderStatusChanged] Notification sent to ${customerId}: ${response}`);
        } catch (err) {
          console.error(`[onOrderStatusChanged] Error for order ${orderId}:`, err);
        }
      }
    },
    (err) => {
      console.error("[onOrderStatusChanged] RTDB listener error:", err);
    }
  );

  console.info("[listeners] RTDB order status listener started");

  // ── 2. autoTagMeal (was: Firestore onCreate) ──────────────────────────────
  // ── 3. reTagOnIngredientUpdate (was: Firestore onUpdate) ─────────────────
  // Firestore JS SDK doesn't support onCreate/onUpdate natively in server SDK.
  // We use onSnapshot and track document state ourselves.

  const mealCache = new Map(); // mealId -> { exists, ingredientSignature }

  db.collection(MEALS_COLLECTION).onSnapshot(
    async (snapshot) => {
      for (const change of snapshot.docChanges()) {
        const doc = change.doc;
        const mealId = doc.id;
        const mealData = doc.data();

        // ── autoTagMeal (new document) ──────────────────────────────────────
        if (change.type === "added") {
          mealCache.set(mealId, {
            ingredientSignature: getComparableIngredientSignature(mealData),
          });

          if (mealData.autoTagged === true) {
            console.info(`[autoTagMeal] ${mealId} already tagged, skipping`);
            continue;
          }

          if (!hasMealContent(mealData)) {
            console.info(`[autoTagMeal] ${mealId} has no content, skipping`);
            continue;
          }

          try {
            const tagData = await tagMealWithGemini({
              mealId,
              mealData,
              apiKey,
              admin,
              log: console,
            });

            await doc.ref.update(tagData);

            if (tagData.autoTagged) {
              console.info(`[autoTagMeal] Tagged: ${getMealName(mealData)} -> ${tagData.tags.join(", ")}`);
            } else {
              console.warn(`[autoTagMeal] Failed for ${getMealName(mealData)}: ${tagData.autoTagError}`);
            }
          } catch (err) {
            console.error(`[autoTagMeal] Error for ${mealId}:`, err);
          }
        }

        // ── reTagOnIngredientUpdate (modified document) ─────────────────────
        if (change.type === "modified") {
          const cached = mealCache.get(mealId);
          const newSignature = getComparableIngredientSignature(mealData);
          const oldSignature = cached?.ingredientSignature;

          // Update cache
          mealCache.set(mealId, { ingredientSignature: newSignature });

          if (oldSignature === newSignature) continue;

          console.info(`[reTagOnIngredientUpdate] Ingredients changed for ${getMealName(mealData)}, re-tagging...`);

          try {
            const tagData = await tagMealWithGemini({
              mealId,
              mealData,
              apiKey,
              admin,
              log: console,
            });

            await doc.ref.update(tagData);
            console.info(`[reTagOnIngredientUpdate] Re-tagged: ${getMealName(mealData)}`);
          } catch (err) {
            console.error(`[reTagOnIngredientUpdate] Error for ${mealId}:`, err);
          }
        }

        // Clean up cache for deleted meals
        if (change.type === "removed") {
          mealCache.delete(mealId);
        }
      }
    },
    (err) => {
      console.error("[listeners] Firestore meal listener error:", err);
    }
  );

  console.info("[listeners] Firestore meal listener started");
}

module.exports = { startListeners };
