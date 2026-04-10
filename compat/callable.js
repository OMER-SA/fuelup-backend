/**
 * Minimal shim that makes an Express route behave like a Firebase callable.
 * Flutter's firebase_functions SDK sends: POST { "data": { ... } }
 * and expects back:                       { "result": { ... } }
 *
 * Auth is verified via the Firebase ID token in the Authorization header.
 */

const admin = require("firebase-admin");

function onCall(handler) {
  return async (req, res) => {
    // ── Verify auth token ──────────────────────────────────────────────────
    let authContext = null;
    const authHeader = req.headers.authorization || "";
    if (authHeader.startsWith("Bearer ")) {
      const idToken = authHeader.slice(7);
      try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        authContext = { uid: decoded.uid, token: decoded };
      } catch {
        // token invalid — auth will be null, handler can reject if needed
      }
    }

    const data = req.body?.data ?? {};

    // ── Fake HttpsError ────────────────────────────────────────────────────
    class HttpsError extends Error {
      constructor(code, message) {
        super(message);
        this.code = code;
      }
    }

    const request = { data, auth: authContext };

    try {
      const result = await handler(request, { HttpsError });
      res.json({ result });
    } catch (err) {
      const code = err.code || "internal";
      const httpStatus = {
        unauthenticated: 401,
        "invalid-argument": 400,
        "not-found": 404,
        internal: 500,
      }[code] ?? 500;

      res.status(httpStatus).json({ error: { status: code.toUpperCase(), message: err.message } });
    }
  };
}

module.exports = { onCall };
