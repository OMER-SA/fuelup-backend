import 'package:diet_app/models/mood.dart';

/// Tag-Based Mood Detection System
///
/// Infers user mood from meal tags (rule-based classification).
/// This is used as a fallback/augmentation for voice-based mood detection.
///
/// Key Design:
/// - No AI/ML required (pure rule logic)
/// - 100% deterministic (same tags → same mood)
/// - Works with guaranteed rule-based meal tags
/// - Handles all tag combinations
///
/// Mood Types (5 Primary):
/// 1. happy     - healthy, fresh, energizing meals
/// 2. stressed  - comfort foods, carbs, warmth
/// 3. tired     - heavy, rich, calorie-dense meals
/// 4. sad       - comfort foods, familiar, warm
/// 5. energetic - protein, light, fresh, active meals
///
/// Secondary moods (map to primary):
/// - calm       → stressed (counter-measure)
/// - anxious    → stressed (counter-measure)
/// - unknown    → neutral/balanced

class TagBasedMoodDetector {
  /// Core mood scoring function
  ///
  /// Accepts meal tags and returns a mood score map.
  /// Usage:
  ///   final scores = getMoodScoresFromTags(meal['tags'] ?? []);
  ///   final detectedMood = _getTopMood(scores);
  static Map<String, int> getMoodScoresFromTags(List<dynamic> tags) {
    final stringTags = _normalizeTagList(tags);

    // Initialize scores
    final scores = {
      'happy': 0,
      'stressed': 0,
      'tired': 0,
      'sad': 0,
      'energetic': 0,
    };

    // If no tags, return empty (will default to unknown/neutral)
    if (stringTags.isEmpty) {
      return scores;
    }

    // ── RULE SETS ──────────────────────────────────────────────────

    // 1. COMFORT FOODS → stressed, sad (indicates stress/sadness seeking relief)
    if (_hasTag(stringTags, ['comfort_food', 'warm', 'soup'])) {
      scores['stressed'] = scores['stressed']! + 3;
      scores['sad'] = scores['sad']! + 2;
    }

    // 2. FRIED / FATTY → tired, sad (heavy consumption)
    if (_hasTag(stringTags, ['fried', 'fat_rich', 'fatty'])) {
      scores['tired'] = scores['tired']! + 2;
      scores['sad'] = scores['sad']! + 1;
      scores['stressed'] = scores['stressed']! + 1;
    }

    // 3. HIGH CALORIE → tired (dense, energy-depleting)
    if (_hasTag(stringTags, ['high_calorie'])) {
      scores['tired'] = scores['tired']! + 1;
    }

    // 4. PROTEIN-RICH → energetic, happy (strength, vitality)
    if (_hasTag(stringTags, ['protein', 'chicken', 'beef', 'fish', 'paneer', 'tofu'])) {
      scores['energetic'] = scores['energetic']! + 2;
      scores['happy'] = scores['happy']! + 1;
    }

    // 5. HEALTHY / LOW CALORIE → happy, energetic (wellness, vitality)
    if (_hasTag(stringTags, ['healthy', 'low_calorie', 'light'])) {
      scores['happy'] = scores['happy']! + 3;
      scores['energetic'] = scores['energetic']! + 2;
    }

    // 6. FRESH / GREENS → happy, energetic (vitality, freshness)
    if (_hasTag(stringTags, ['fresh', 'salad', 'greens', 'vegetable'])) {
      scores['happy'] = scores['happy']! + 2;
      scores['energetic'] = scores['energetic']! + 2;
    }

    // 7. SPICY / ENERGIZING → energetic, happy (stimulation)
    if (_hasTag(stringTags, ['spicy', 'energetic', 'energizing', 'chili', 'pepper'])) {
      scores['energetic'] = scores['energetic']! + 3;
      scores['happy'] = scores['happy']! + 1;
    }

    // 8. HEAVY → tired (physical heaviness, digestion burden)
    if (_hasTag(stringTags, ['heavy', 'burden'])) {
      scores['tired'] = scores['tired']! + 3;
    }

    // 9. BALANCED → happy, energetic (wellness, stability)
    if (_hasTag(stringTags, ['balanced'])) {
      scores['happy'] = scores['happy']! + 2;
      scores['energetic'] = scores['energetic']! + 1;
    }

    // 10. SNACK (light, quick) → energetic (quick boost)
    if (_hasTag(stringTags, ['snack', 'light_snack'])) {
      scores['energetic'] = scores['energetic']! + 1;
      scores['happy'] = scores['happy']! + 1;
    }

    // 11. CARBS (complex) → energetic, happy (sustained energy)
    if (_hasTag(stringTags, ['carbs', 'complex_carb'])) {
      scores['energetic'] = scores['energetic']! + 1;
      scores['happy'] = scores['happy']! + 1;
    }

    // 12. BAKED / STEAMED / HEALTHY PREP → happy, energetic
    if (_hasTag(stringTags, ['baked', 'steamed', 'grilled', 'boiled'])) {
      scores['happy'] = scores['happy']! + 1;
      scores['energetic'] = scores['energetic']! + 1;
    }

    // 13. UNHEALTHY → stressed (guilt, concern)
    if (_hasTag(stringTags, ['unhealthy'])) {
      scores['stressed'] = scores['stressed']! + 1;
    }

    // ── INTERACTION RULES ──────────────────────────────────────────

    // Protein + Healthy = Strong energetic signal
    if (_hasTag(stringTags, ['protein']) && _hasTag(stringTags, ['healthy'])) {
      scores['energetic'] = scores['energetic']! + 2;
      scores['happy'] = scores['happy']! + 1;
    }

    // Comfort + Fried = Very stressed/sad
    if (_hasTag(stringTags, ['comfort_food']) && _hasTag(stringTags, ['fried'])) {
      scores['stressed'] = scores['stressed']! + 2;
      scores['sad'] = scores['sad']! + 2;
    }

    // Healthy + Light = Very happy
    if (_hasTag(stringTags, ['healthy']) &&
        (_hasTag(stringTags, ['light']) || _hasTag(stringTags, ['low_calorie']))) {
      scores['happy'] = scores['happy']! + 2;
      scores['energetic'] = scores['energetic']! + 1;
    }

    return scores;
  }

  /// Convert mood scores to a Mood enum
  ///
  /// Returns the mood with highest score.
  /// Handles ties by preferring: energetic > happy > stressed > sad > tired
  static Mood getMoodFromScores(Map<String, int> scores) {
    if (scores.isEmpty) {
      return Mood.unknown;
    }

    // Priority order for ties
    const priorityOrder = ['energetic', 'happy', 'stressed', 'sad', 'tired'];

    int maxScore = scores.values.fold(0, (a, b) => a > b ? a : b);

    // If all scores are 0, return unknown
    if (maxScore == 0) {
      return Mood.unknown;
    }

    // Find first mood in priority order with max score
    for (final moodName in priorityOrder) {
      if (scores[moodName] == maxScore) {
        return _moodFromString(moodName);
      }
    }

    return Mood.unknown;
  }

  /// All-in-one function: tags → Mood
  ///
  /// Usage:
  ///   final mood = detectMoodFromTags(meal['tags'] ?? []);
  static Mood detectMoodFromTags(List<dynamic> tags) {
    final scores = getMoodScoresFromTags(tags);
    return getMoodFromScores(scores);
  }

  /// Detailed mood detection with confidence
  ///
  /// Returns: (Mood, confidence_0_to_1)
  /// Confidence = (topScore - secondScore) / (topScore + 1)
  static (Mood, double) detectMoodWithConfidence(List<dynamic> tags) {
    final scores = getMoodScoresFromTags(tags);

    if (scores.values.isEmpty) {
      return (Mood.unknown, 0.0);
    }

    final sortedScores = scores.values.toList()..sort((a, b) => b.compareTo(a));
    final topScore = sortedScores.isNotEmpty ? sortedScores[0] : 0;
    final secondScore = sortedScores.length > 1 ? sortedScores[1] : 0;

    final mood = getMoodFromScores(scores);

    // Confidence: higher gap between top 2 = higher confidence
    final confidence = topScore == 0 ? 0.0 : ((topScore - secondScore) / (topScore + 1.0)).clamp(0.0, 1.0);

    return (mood, confidence);
  }

  /// Get detailed scoring breakdown
  ///
  /// Useful for debugging and understanding mood derivation
  static Map<String, dynamic> getDetailedAnalysis(List<dynamic> tags) {
    final stringTags = _normalizeTagList(tags);
    final scores = getMoodScoresFromTags(tags);
    final (mood, confidence) = detectMoodWithConfidence(tags);

    return {
      'normalizedTags': stringTags,
      'scores': scores,
      'detectedMood': _moodToString(mood),
      'confidence': confidence,
      'maxScore': scores.values.fold(0, (a, b) => a > b ? a : b),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  /// Normalize tag list to lowercase strings
  static List<String> _normalizeTagList(List<dynamic> tags) {
    return tags
        .where((tag) => tag != null && tag is String && tag.isNotEmpty)
        .map((tag) => (tag as String).toLowerCase().trim())
        .toSet()
        .toList();
  }

  /// Check if any of the searchTerms exist in tags
  static bool _hasTag(List<String> tags, List<String> searchTerms) {
    final normalizedSearchTerms = searchTerms.map((t) => t.toLowerCase()).toSet();
    return tags.any((tag) => normalizedSearchTerms.contains(tag));
  }

  /// Convert mood string to enum
  static Mood _moodFromString(String moodString) {
    switch (moodString.toLowerCase()) {
      case 'happy':
        return Mood.happy;
      case 'stressed':
        return Mood.stressed;
      case 'tired':
        return Mood.tired;
      case 'sad':
        return Mood.sad;
      case 'anxious':
        return Mood.anxious;
      case 'calm':
        return Mood.calm;
      default:
        return Mood.unknown;
    }
  }

  /// Convert enum to string
  static String _moodToString(Mood mood) {
    switch (mood) {
      case Mood.happy:
        return 'happy';
      case Mood.stressed:
        return 'stressed';
      case Mood.tired:
        return 'tired';
      case Mood.sad:
        return 'sad';
      case Mood.anxious:
        return 'anxious';
      case Mood.calm:
        return 'calm';
      case Mood.unknown:
        return 'unknown';
    }
  }
}
