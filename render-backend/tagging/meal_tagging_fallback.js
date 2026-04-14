const ANIMAL_TERMS = ["chicken", "beef", "mutton", "lamb", "fish", "shrimp", "prawn", "egg"];
const HALAL_UNSAFE_TERMS = ["pork", "ham", "bacon", "wine", "alcohol", "rum"];

const ALLERGEN_RULES = {
  gluten: ["wheat", "flour", "bread", "naan", "roti", "pasta", "bun", "noodle", "samosa"],
  dairy: ["milk", "cheese", "butter", "cream", "yogurt", "paneer", "ghee"],
  oil: ["oil", "fried", "deep fried", "frying"],
  nuts: ["almond", "cashew", "peanut", "pistachio", "walnut", "nut"],
};

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function toIngredientText(recipie) {
  if (!Array.isArray(recipie)) {
    return "";
  }

  return recipie
    .map((item) => {
      if (!item) return "";
      if (typeof item === "string") return item;
      if (typeof item === "object") return item.ingredient || "";
      return "";
    })
    .join(" ");
}

function normalizeMealText(mealData = {}) {
  const name = mealData.mealName || mealData.name || mealData.title || "";
  const description = mealData.description || "";
  const category = mealData.category || "";
  const ingredients = toIngredientText(mealData.recipie);

  return `${name} ${description} ${category} ${ingredients}`.toLowerCase();
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function estimateProtein(text) {
  if (includesAny(text, ["chicken", "beef", "mutton", "lamb"])) return 24;
  if (includesAny(text, ["fish", "salmon", "tuna", "prawn", "shrimp"])) return 20;
  if (includesAny(text, ["paneer", "tofu", "egg"])) return 14;
  if (includesAny(text, ["lentil", "beans", "chickpea", "peas"])) return 10;
  return 6;
}

function inferPrepStyle(text) {
  if (includesAny(text, ["fried", "fry", "deep fried", "samosa", "pakora"])) return "fried";
  if (includesAny(text, ["baked", "oven", "roasted"])) return "baked";
  if (includesAny(text, ["boiled", "soup", "broth"])) return "boiled";
  if (includesAny(text, ["grilled", "bbq"])) return "grilled";
  if (includesAny(text, ["steamed"])) return "steamed";
  return "mixed";
}

function generateRuleBasedTags(mealData = {}) {
  const text = normalizeMealText(mealData);
  const calories = Number(mealData.calories || mealData.calorie || 0);
  const category = String(mealData.category || "").toLowerCase();

  const tags = [];
  const allergens = [];
  const dietaryLabels = [];

  // 1) Food type
  if (includesAny(text, ["snack", "samosa", "chips", "fries"]) || category.includes("snack")) tags.push("snack");
  if (includesAny(text, ["breakfast", "omelette", "paratha"]) || category.includes("breakfast")) tags.push("breakfast");
  if (includesAny(text, ["lunch", "thali"]) || category.includes("lunch")) tags.push("lunch");
  if (includesAny(text, ["dinner", "supper"]) || category.includes("dinner")) tags.push("dinner");

  // 2) Health type + cooking method
  const prepStyle = inferPrepStyle(text);
  if (prepStyle === "fried") {
    tags.push("fried", "unhealthy", "fat_rich", "comfort_food", "heavy");
  } else if (prepStyle === "baked" || prepStyle === "boiled" || prepStyle === "steamed" || prepStyle === "grilled") {
    tags.push("healthy");
  }

  // 3) Mood tags
  if (includesAny(text, ["soup", "warm", "khichdi", "samosa", "comfort"])) tags.push("comfort_food", "stress_relief");
  if (includesAny(text, ["coffee", "tea", "spicy", "chili", "pepper"])) tags.push("energetic");
  if (includesAny(text, ["salad", "fruit", "light", "steamed"])) tags.push("light");
  if (includesAny(text, ["fried", "cream", "butter", "cheese", "heavy"]) || calories > 400) tags.push("heavy");

  // 4) Nutritional tags
  if (includesAny(text, ["chicken", "beef", "mutton", "fish", "paneer", "tofu", "egg", "lentil", "beans", "chickpea"])) {
    tags.push("protein");
  }
  if (includesAny(text, ["rice", "potato", "bread", "flour", "naan", "roti", "pasta", "noodle", "peas"])) {
    tags.push("carbs");
  }
  if (includesAny(text, ["oil", "butter", "cream", "ghee", "fried", "fat"])) {
    tags.push("fat_rich");
  }
  if (calories > 0 && calories <= 250) tags.push("low_calorie", "light");
  if (calories >= 400) tags.push("high_calorie", "heavy");

  // 5) Dietary tags
  const containsAnimal = includesAny(text, ANIMAL_TERMS);
  const containsDairy = includesAny(text, ALLERGEN_RULES.dairy);
  if (!containsAnimal || (containsAnimal && !includesAny(text, ["chicken", "beef", "mutton", "lamb", "fish", "shrimp", "prawn"])) ) {
    dietaryLabels.push("vegetarian");
  }
  if (!containsAnimal && !containsDairy) {
    dietaryLabels.push("vegan");
  }
  if (!includesAny(text, HALAL_UNSAFE_TERMS)) {
    dietaryLabels.push("halal");
  }

  // 6) Allergens
  for (const [allergen, terms] of Object.entries(ALLERGEN_RULES)) {
    if (includesAny(text, terms)) {
      allergens.push(allergen);
    }
  }

  // 7) Balanced fallback
  if (!tags.includes("healthy") && !tags.includes("unhealthy")) {
    tags.push("balanced");
  }

  if (!tags.length) {
    tags.push("balanced", "light");
  }

  return {
    tags: unique(tags),
    allergens: unique(allergens),
    dietaryLabels: unique(dietaryLabels),
    protein: estimateProtein(text),
    prepStyle,
  };
}

function scoreRuleConfidence(tagData = {}) {
  const tagCount = Array.isArray(tagData.tags) ? tagData.tags.length : 0;
  const dietCount = Array.isArray(tagData.dietaryLabels) ? tagData.dietaryLabels.length : 0;
  const allergenCount = Array.isArray(tagData.allergens) ? tagData.allergens.length : 0;
  return tagCount + dietCount + allergenCount;
}

function buildRuleBasedFallback(mealData = {}, reason = "Gemini unavailable") {
  const ruleTags = generateRuleBasedTags(mealData);
  return {
    ...ruleTags,
    autoTagged: true,
    autoTagModel: "rule-based",
    autoTagError: "fallback_used",
    autoTagFallbackReason: reason,
    autoTagConfidence: scoreRuleConfidence(ruleTags),
  };
}

module.exports = {
  generateRuleBasedTags,
  scoreRuleConfidence,
  buildRuleBasedFallback,
};