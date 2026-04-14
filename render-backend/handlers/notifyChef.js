const admin = require("firebase-admin");

/**
 * Sends a push notification to a chef.
 * Called from the Flutter app when a customer places an order.
 */
async function notifyChefHandler(request, { HttpsError }) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated to send notifications.");
  }

  const { chefId, title, body } = request.data;

  if (!chefId || !title || !body) {
    throw new HttpsError("invalid-argument", "chefId, title, and body are required.");
  }

  const userDoc = await admin.firestore().collection("users").doc(chefId).get();

  if (!userDoc.exists) {
    throw new HttpsError("not-found", `Chef ${chefId} not found.`);
  }

  const fcmToken = userDoc.data().fcmToken;
  if (!fcmToken || fcmToken === "") {
    console.info(`[notifyChef] No FCM token for chef ${chefId}, skipping`);
    return { success: false, reason: "No FCM token" };
  }

  const payload = {
    token: fcmToken,
    notification: { title, body },
    data: { chefId },
  };

  const response = await admin.messaging().send(payload);
  console.info(`[notifyChef] Notification sent to chef ${chefId}: ${response}`);
  return { success: true, messageId: response };
}

module.exports = { notifyChefHandler };
