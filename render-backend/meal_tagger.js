// Identical to the original functions/meal_tagger.js.
// No firebase-functions dependency — works standalone in Node.js.

const { GoogleGenerativeAI } = require("@google/generative-ai");

async function callGeminiWithRetry(model, prompt, options = {}) {
  const maxRetries = Number.isFinite(options.maxRetries) ? options.maxRetries : 3;
  const baseDelayMs = Number.isFinite(options.baseDelayMs)
    ? options.baseDelayMs
    : 5000;
  const log = options.log || console;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      return result;

    } catch (err) {
      const msg = err.message || '';

      const is503 = msg.includes('503')
        || msg.includes('Service Unavailable')
        || msg.includes('high demand')
        || msg.includes('overloaded');

      const isRateLimit = msg.includes('429')
        || msg.includes('quota')
        || msg.includes('RESOURCE_EXHAUSTED');

      const isRetryable = is503 || isRateLimit;

      if (!isRetryable || attempt === maxRetries) {
        throw err;
      }

      const delay = Math.min(baseDelayMs * (2 ** attempt), 30000);
      log.warn(
        `[meal_tagger] Gemini error on attempt ${attempt + 1}/${maxRetries + 1}: ` +
        `${msg.substring(0, 120)}. Retrying in ${Math.round(delay / 1000)}s...`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

const MEALS_COLLECTION = "kitchenMeals";
const GEMINI_MODEL = "gemini-2.5-flash";

const ALLOWED_TAGS = new Set([
  "warm", "light", "comfort", "energizing", "calming",
  "serotonin", "dopamine", "balanced", "fresh", "colorful", "varied",
  "magnesium", "iron", "b12", "omega3", "protein",
  "complex_carb", "whole_grain", "greens", "fiber",
  "sugar", "caffeine", "spicy", "fried", "processed",
  "refined_sugar", "alcohol", "fatty", "heavy", "mild", "rich",
]);

const ALLOWED_ALLERGENS = new Set([
  "gluten", "dairy", "nuts", "eggs", "soy",
  "shellfish", "fish", "wheat", "sesame", "sulphites",
]);

const ALLOWED_DIETARY_LABELS = new Set([
  "vegetarian", "vegan", "halal", "kosher", "keto",
  "low_carb", "high_protein", "low_fat", "gluten_free", "dairy_free",
]);

const ALLOWED_PREP_STYLES = new Set([
  "grilled", "fried", "steamed", "raw", "baked", "boiled", "mixed",
]);

function getMealName(mealData = {}) {
  return mealData.mealName || mealData.name || mealData.title || "Unknown dish";
}

function extractMealIngredients(mealData = {}) {
  const directIngredients =
    mealData.ingredients || mealData.ingredientsList || mealData.ingredient_list;

  if (Array.isArray(directIngredients)) {
    return directIngredients.map((item) => String(item || "").trim()).filter(Boolean);
  }

  if (typeof directIngredients === "string" && directIngredients.trim() !== "") {
    return directIngredients.trim();
  }

  if (Array.isArray(mealData.recipie)) {
    return mealData.recipie
      .map((item) => {
        if (!item) return "";
        if (typeof item === "string") return item.trim();
        if (typeof item === "object") return String(item.ingredient || "").trim();
        return "";
      })
      .filter(Boolean);
  }

  return [];
}

function hasMealContent(mealData = {}) {
  const mealName = getMealName(mealData).trim();
  const ingredients = extractMealIngredients(mealData);
  const hasName = mealName !== "" && mealName !== "Unknown dish";
  const hasIngredients = Array.isArray(ingredients)
    ? ingredients.length > 0
    : String(ingredients || "").trim() !== "";
  return hasName || hasIngredients;
}

function getComparableIngredientSignature(mealData = {}) {
  if (Array.isArray(mealData.recipie)) return JSON.stringify(mealData.recipie);
  const ingredients =
    mealData.ingredients || mealData.ingredientsList || mealData.ingredient_list || [];
  return JSON.stringify(ingredients);
}

function normalizeSelectedValues(values, allowedValues) {
  if (!Array.isArray(values)) return [];
  const normalized = [];
  const seen = new Set();
  for (const value of values) {
    const v = String(value || "").trim().toLowerCase();
    if (!allowedValues.has(v) || seen.has(v)) continue;
    seen.add(v);
    normalized.push(v);
  }
  return normalized;
}

function buildMealTagPrompt({ name, ingredientText, calories }) {
  return `
You are a food nutrition and mood science expert.
Analyze this meal and return ONLY a raw JSON object.
No markdown. No backticks. No explanation. Just the JSON.

Meal name: ${name}
Ingredients: ${ingredientText}
Calories per serving: ${calories}

Return this exact structure:

{
  "tags": [],
  "allergens": [],
  "dietaryLabels": [],
  "protein": 0,
  "prepStyle": ""
}

FIELD RULES:

"tags" - select ALL that apply from ONLY these values:
  Mood-positive: warm, light, comfort, energizing, calming,
                 serotonin, dopamine, balanced, fresh, colorful, varied
  Nutrients:     magnesium, iron, b12, omega3, protein,
                 complex_carb, whole_grain, greens, fiber
  Mood-negative: sugar, caffeine, spicy, fried, processed,
                 refined_sugar, alcohol, fatty, heavy
  Texture/style: mild, rich

"allergens" - select ALL that apply from ONLY these values:
  gluten, dairy, nuts, eggs, soy, shellfish, fish,
  wheat, sesame, sulphites

"dietaryLabels" - select ALL that apply from ONLY these values:
  vegetarian, vegan, halal, kosher, keto,
  low_carb, high_protein, low_fat, gluten_free, dairy_free

"protein" - integer, estimated grams of protein per serving

"prepStyle" - exactly ONE of:
  grilled, fried, steamed, raw, baked, boiled, mixed
`;
}

async function tagMealWithGemini({
  mealId,
  mealData,
  apiKey,
  admin,
  log = console,
  retryOptions = {},
}) {
  const name = getMealName(mealData);
  const ingredients = extractMealIngredients(mealData);
  const ingredientText = Array.isArray(ingredients)
    ? ingredients.join(", ")
    : String(ingredients || "not specified");
  const calories = mealData.calories || mealData.calorie || "unknown";

  if (!apiKey) {
    const message = "Missing Gemini API key";
    log.error(`Gemini config error for ${mealId || name}: ${message}`);
    return { tags: [], allergens: [], dietaryLabels: [], protein: 0, prepStyle: "mixed", autoTagged: false, autoTagError: message };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const prompt = buildMealTagPrompt({ name, ingredientText, calories });

  try {
    const result = await callGeminiWithRetry(model, prompt, {
      maxRetries: retryOptions.maxRetries,
      baseDelayMs: retryOptions.baseDelayMs,
      log,
    });
    const text = result.response.text().trim();
    const clean = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(clean);

    return {
      tags: normalizeSelectedValues(parsed.tags, ALLOWED_TAGS),
      allergens: normalizeSelectedValues(parsed.allergens, ALLOWED_ALLERGENS),
      dietaryLabels: normalizeSelectedValues(parsed.dietaryLabels, ALLOWED_DIETARY_LABELS),
      protein: Number.isFinite(parsed.protein) ? Math.round(parsed.protein) : 0,
      prepStyle:
        typeof parsed.prepStyle === "string" &&
        ALLOWED_PREP_STYLES.has(parsed.prepStyle.trim().toLowerCase())
          ? parsed.prepStyle.trim().toLowerCase()
          : "mixed",
      autoTagged: true,
      autoTaggedAt: admin.firestore.FieldValue.serverTimestamp(),
      autoTagModel: GEMINI_MODEL,
    };
  } catch (parseErr) {
    log.error(`Gemini parse error for ${name}:`, parseErr);
    return { tags: [], allergens: [], dietaryLabels: [], protein: 0, prepStyle: "mixed", autoTagged: false, autoTagError: parseErr.message };
  }
}

module.exports = {
  GEMINI_MODEL, MEALS_COLLECTION, getMealName,
  extractMealIngredients, hasMealContent,
  getComparableIngredientSignature, buildMealTagPrompt, tagMealWithGemini,
  callGeminiWithRetry,
};
