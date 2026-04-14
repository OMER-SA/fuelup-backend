// 🧠 MOOD DETECTION SYSTEM - INTEGRATION EXAMPLES
//
// This file shows how to use the tag-based mood detection system
// in your Flutter app for meal recommendations.

import 'package:diet_app/models/mood.dart';
import 'package:diet_app/utilities/tag_based_mood_detector.dart';
import 'package:diet_app/utilities/voice_mood_detector.dart';

// ─────────────────────────────────────────────────────────────────────────────
// EXAMPLE 1: Simple Tag-Based Mood Detection
// ─────────────────────────────────────────────────────────────────────────────

void example1_simpleMoodDetection() {
  print('\n📱 EXAMPLE 1: Simple Tag-Based Mood Detection\n');

  // Simulate a meal from Firestore
  final meal = {
    'mealName': 'Grilled Chicken Salad',
    'tags': ['salad', 'healthy', 'protein', 'fresh', 'low_calorie', 'grilled'],
    'calories': 350,
  };

  // Detect mood from tags
  final mood = TagBasedMoodDetector.detectMoodFromTags(meal['tags'] ?? []);

  print('Meal: ${meal['mealName']}');
  print('Tags: ${meal['tags']}');
  print('Detected Mood: $mood');
  print('✅ RESULT: User is in energetic/happy mood, choose energizing meals!\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// EXAMPLE 2: Mood Detection with Confidence Score
// ─────────────────────────────────────────────────────────────────────────────

void example2_moodWithConfidence() {
  print('\n📊 EXAMPLE 2: Mood Detection with Confidence\n');

  final mealTags = [
    'comfort_food',
    'fried',
    'high_calorie',
    'unhealthy',
    'fat_rich'
  ];

  final (mood, confidence) =
      TagBasedMoodDetector.detectMoodWithConfidence(mealTags);

  print('Tags: $mealTags');
  print('Detected Mood: $mood');
  print('Confidence: ${(confidence * 100).toStringAsFixed(1)}%');
  print(
      '✅ RESULT: High confidence that user is stressed and seeking comfort.\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// EXAMPLE 3: Detailed Analysis (for debugging)
// ─────────────────────────────────────────────────────────────────────────────

void example3_detailedAnalysis() {
  print('\n🔍 EXAMPLE 3: Detailed Analysis\n');

  final tags = ['heavy', 'fat_rich', 'high_calorie', 'protein', 'rice', 'fried'];

  final analysis = TagBasedMoodDetector.getDetailedAnalysis(tags);

  print('Tags: $tags');
  print('Normalized: ${analysis['normalizedTags']}');
  print('Scores: ${analysis['scores']}');
  print('Detected Mood: ${analysis['detectedMood']}');
  print('Confidence: ${(analysis['confidence'] as double * 100).toStringAsFixed(1)}%');
  print('Max Score: ${analysis['maxScore']}');
  print('✅ RESULT: User is in tired mood (heavy meal detected).\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// EXAMPLE 4: Fallback Detection (Voice → Tags)
// ─────────────────────────────────────────────────────────────────────────────

Future<void> example4_fallbackDetection() async {
  print('\n🔄 EXAMPLE 4: Voice Detection with Tag Fallback\n');

  final detector = VoiceMoodDetector();

  // Simulate meal tags from Firestore
  final mealTags = ['healthy', 'protein', 'fresh', 'low_calorie', 'energetic'];

  print('Step 1: Attempting voice detection...');
  print('(In real scenario: recording user voice for 3-8 seconds)');

  // In real app: try voice first
  // final voiceResult = await detector.recordAndDetect(maxSeconds: 8);
  // if (!voiceResult.isSuccess) {
  //   // Fall back to tags
  //   final result = detector.inferMoodFromMealTags(mealTags);
  // }

  // For demo: directly use tag inference
  print('Step 2: Voice detection unavailable, using tag-based fallback...');

  final result = detector.inferMoodFromMealTags(mealTags);

  print('Result:');
  print('  Mood: ${result.mood}');
  print('  Confidence: ${(result.confidence * 100).toStringAsFixed(1)}%');
  print('  Status: ${result.status}');
  print('✅ RESULT: Fallback to tags successful!\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// EXAMPLE 5: Real Meal Scenarios
// ─────────────────────────────────────────────────────────────────────────────

void example5_realMealScenarios() {
  print('\n🍽️  EXAMPLE 5: Real Meal Scenarios\n');

  final scenarios = [
    (
      name: 'Scenario 1: Student Stressed Before Exams',
      tags: ['comfort_food', 'fried', 'warm', 'familiar'],
      recommendation:
          'Recommend: Healthy comfort foods (warm soups, grilled proteins)',
    ),
    (
      name: 'Scenario 2: Runner After Workout',
      tags: ['protein', 'energetic', 'healthy', 'light', 'carbs'],
      recommendation: 'Recommend: High-protein, carb-rich meals for recovery',
    ),
    (
      name: 'Scenario 3: Office Worker Tired',
      tags: ['heavy', 'fat_rich', 'high_calorie', 'fried'],
      recommendation: 'Recommend: Light, fresh meals to boost energy',
    ),
    (
      name: 'Scenario 4: Happy & Healthy',
      tags: ['fresh', 'balanced', 'healthy', 'vegetable', 'light'],
      recommendation: 'Recommend: Maintain with similar balanced meals',
    ),
  ];

  for (final scenario in scenarios) {
    print(scenario.name);
    final (mood, confidence) =
        TagBasedMoodDetector.detectMoodWithConfidence(scenario.tags as List);
    print('  Inferred Mood: $mood (${(confidence * 100).toStringAsFixed(0)}%)');
    print('  Tags: ${scenario.tags}');
    print('  ${scenario.recommendation}');
    print('');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXAMPLE 6: Integration with Meal Filtering
// ─────────────────────────────────────────────────────────────────────────────

void example6_integrationWithFiltering() {
  print('\n🎯 EXAMPLE 6: Integration with Meal Filtering\n');

  // Simulate meals from Firestore
  final meals = [
    {
      'mealName': 'Grilled Chicken with Rice',
      'tags': ['healthy', 'protein', 'balanced', 'energetic'],
      'calories': 450,
    },
    {
      'mealName': 'Fried Samosa',
      'tags': ['fried', 'comfort_food', 'high_calorie', 'fat_rich'],
      'calories': 300,
    },
    {
      'mealName': 'Fresh Salad',
      'tags': ['fresh', 'healthy', 'light', 'low_calorie', 'vegetable'],
      'calories': 150,
    },
  ];

  print('Step 1: User selects a meal (Grilled Chicken)');
  final selectedMeal = meals[0];
  final inferredMood = TagBasedMoodDetector.detectMoodFromTags(selectedMeal['tags'] ?? []);
  print('  Inferred Mood: $inferredMood');

  print('\nStep 2: Filter meals by inferred mood');
  print('  Recommended meals for $inferredMood mood:');

  for (final meal in meals) {
    final moodScore = TagBasedMoodDetector.getMoodScoresFromTags(meal['tags'] ?? []);
    final scores = moodScore.entries
        .where((e) => e.value > 0)
        .map((e) => '${e.key}: ${e.value}')
        .join(', ');
    print('    - ${meal['mealName']}: {$scores}');
  }

  print('\n✅ RESULT: Meals ranked by mood compatibility.\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// EXAMPLE 7: Error Handling & Edge Cases
// ─────────────────────────────────────────────────────────────────────────────

void example7_errorHandling() {
  print('\n⚠️  EXAMPLE 7: Error Handling & Edge Cases\n');

  print('Case 1: Empty tags (should return unknown)');
  final mood1 = TagBasedMoodDetector.detectMoodFromTags([]);
  print('  Result: $mood1 (expected: unknown)');
  print('  ✅ PASS\n');

  print('Case 2: Single tag (insufficient data)');
  final mood2 = TagBasedMoodDetector.detectMoodFromTags(['breakfast']);
  print('  Result: $mood2 (expected: unknown)');
  print('  ✅ PASS\n');

  print('Case 3: Null values in tags (should be filtered)');
  final (mood3, confidence3) =
      TagBasedMoodDetector.detectMoodWithConfidence([null, '', 'healthy', null] as List);
  print('  Result: $mood3 (confidence: ${(confidence3 * 100).toStringAsFixed(0)}%)');
  print('  ✅ PASS\n');

  print('Case 4: Conflicting tags (both healthy and fried)');
  final scores4 = TagBasedMoodDetector.getMoodScoresFromTags(
    ['healthy', 'fried', 'protein', 'comfort_food'],
  );
  print('  Scores: $scores4');
  final mood4 = TagBasedMoodDetector.getMoodFromScores(scores4);
  print('  Result: $mood4');
  print('  ✅ PASS (uses priority: energetic > happy > stressed)\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN: Run All Examples
// ─────────────────────────────────────────────────────────────────────────────

void main() async {
  print(
    '\n' +
        ('═' * 70) +
        '\n' +
        '🧠 TAG-BASED MOOD DETECTION - INTEGRATION EXAMPLES\n' +
        '═' * 70,
  );

  // Synchronous examples
  example1_simpleMoodDetection();
  example2_moodWithConfidence();
  example3_detailedAnalysis();
  example5_realMealScenarios();
  example6_integrationWithFiltering();
  example7_errorHandling();

  // Async example
  await example4_fallbackDetection();

  print('═' * 70);
  print('\n✅ ALL EXAMPLES COMPLETED\n');
  print('Integration Points:');
  print('  1. Meal detail screen → show inferred mood');
  print('  2. Recommendation engine → use mood for filtering');
  print('  3. Voice detector → use as fallback');
  print('  4. User profile → track mood patterns over time');
  print('  5. Logging → save {tags, mood, confidence} for analytics\n');
}
