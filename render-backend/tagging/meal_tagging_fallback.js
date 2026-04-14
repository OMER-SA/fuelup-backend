const FALLBACK_TAG_KEYWORDS = [
  { terms: ["fried", "fry", "crispy", "samosa", "pakora"], tags: ["fried", "heavy", "fatty"] },
  { terms: ["salad", "greens", "spinach", "lettuce", "fresh"], tags: ["fresh", "light", "greens", "balanced"] },
  { terms: ["soup", "broth", "steamed", "boiled"], tags: ["light", "calming"] },
  { terms: ["spicy", "chili", "chilli", "pepper", "hot"], tags: ["spicy", "energizing"] },
  { terms: ["grilled", "roasted", "bbq"], tags: ["protein", "balanced"] },
  { terms: ["bread", "rice", "noodle", "pasta", "naan", "roti", "wrap"], tags: ["complex_carb", "whole_grain"] },
  { terms: ["sweet", "dessert", "cake", "syrup", "sugar"], tags: ["refined_sugar", "heavy", "comfort"] },
  { terms: ["butter", "cream", "cheese", "ghee", "mayo"], tags: ["fatty", "rich", "heavy"] },
];

const ALLERGEN_KEYWORDS = {
  gluten: ["wheat", "flour", "bread", "naan", "roti", "pasta", "bun", "samosa"],
  dairy: ["milk", "cheese", "butter", "cream", "yogurt", "paneer", "ghee"],
  eggs: ["egg", "mayonnaise", "mayo"],
  nuts: ["almond", "cashew", "peanut", "pistachio", "walnut", "nut"],
  soy: ["soy", "tofu", "soya"],
  shellfish: ["shrimp", "prawn", "crab", "lobster", "shellfish"],
  fish: ["fish", "salmon", "tuna", "anchovy"],
  wheat: ["wheat", "flour", "bread", "naan", "roti", "pasta", "bun"],
  sesame: ["sesame", "tahini", "benniseed"],
  sulphites: ["wine", "vinegar", "dried fruit", "preserved"],
};

function normalizeText(mealData = {}) {
  const parts = [mealData.mealName, mealData.name, mealData.title];
  const ingredients = Array.isArray(mealData.recipie)
    ? mealData.recipie
        .map((item) => {
          if (!item) return "";
          if (typeof item === "string") return item;
          if (typeof item === "object") return item.ingredient || "";
          return "";
        })
        .join(" ")
    : [mealData.ingredients, mealData.ingredientsList, mealData.ingredient_list]
        .filter(Boolean)
        .join(" ");

  parts.push(ingredients);
  return parts.join(" ").toLowerCase();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function estimateProtein(text) {
  const proteinMatches = [
    ["chicken", 28],
    ["beef", 26],
    ["mutton", 25],
    ["lamb", 25],
    ["fish", 24],
    ["salmon", 24],
    ["tuna", 24],
    ["egg", 12],
    ["paneer", 14],
    ["tofu", 12],
    ["lentil", 10],
    ["beans", 9],
    ["chickpea", 9],
    ["yogurt", 8],
    ["milk", 7],
    ["samosa", 8],
  ];

  for (const [term, protein] of proteinMatches) {
    if (text.includes(term)) {
      return protein;
    }
  }

  return 6;
}

function determinePrepStyle(text) {
  if (text.includes("fried") || text.includes("samosa") || text.includes("pakora")) {
    return "fried";
  }

  if (text.includes("grilled") || text.includes("bbq") || text.includes("roasted")) {
    return "grilled";
  }

  if (text.includes("steamed")) {
    return "steamed";
  }

  if (text.includes("boiled") || text.includes("soup") || text.includes("broth")) {
    return "boiled";
  }

  if (text.includes("raw") || text.includes("salad")) {
    return "raw";
  }

  if (text.includes("baked") || text.includes("cake") || text.includes("bread")) {
    return "baked";
  }

  return "mixed";
}

function buildRuleBasedFallback(mealData = {}, reason = "Gemini unavailable") {
  const text = normalizeText(mealData);
  const tags = [];

  for (const rule of FALLBACK_TAG_KEYWORDS) {
    if (rule.terms.some((term) => text.includes(term))) {
      tags.push(...rule.tags);
    }
  }

  if (text.includes("chicken") || text.includes("fish") || text.includes("paneer") || text.includes("tofu") || text.includes("egg")) {
    tags.push("protein", "balanced");
  }

  if (text.includes("salad") || text.includes("vegetable") || text.includes("spinach") || text.includes("greens")) {
    tags.push("fresh", "greens", "light");
  }

  if (!tags.length) {
    tags.push("balanced", "light");
  }

  const allergens = [];
  for (const [allergen, terms] of Object.entries(ALLERGEN_KEYWORDS)) {
    if (terms.some((term) => text.includes(term))) {
      allergens.push(allergen);
    }
  }

  const dietaryLabels = [];
  if (!text.includes("chicken") && !text.includes("fish") && !text.includes("beef") && !text.includes("mutton") && !text.includes("egg")) {
    dietaryLabels.push("vegetarian");
  }

  if (
    !text.includes("milk") &&
    !text.includes("cheese") &&
    !text.includes("butter") &&
    !text.includes("cream") &&
    !text.includes("paneer") &&
    !text.includes("yogurt")
  ) {
    dietaryLabels.push("dairy_free");
  }

  if (!allergens.includes("gluten") && !text.includes("bread") && !text.includes("flour") && !text.includes("naan") && !text.includes("roti")) {
    dietaryLabels.push("gluten_free");
  }

  return {
    tags: unique(tags),
    allergens: unique(allergens),
    dietaryLabels: unique(dietaryLabels),
    protein: estimateProtein(text),
    prepStyle: determinePrepStyle(text),
    autoTagged: true,
    autoTagModel: "fallback-rules",
    autoTagFallbackReason: reason,
  };
}

module.exports = { buildRuleBasedFallback };