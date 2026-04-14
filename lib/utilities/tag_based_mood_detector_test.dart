/// Tag-Based Mood Detection Test Suite
///
/// This file demonstrates how the mood detection system works
/// with various meal tag combinations.

import 'package:diet_app/utilities/tag_based_mood_detector.dart';

void main() {
  print('🧠 TAG-BASED MOOD DETECTION TEST SUITE\n');
  print('=' * 70);

  // Test cases with expected moods
  final testCases = [
    // --- ENERGETIC FOODS ---
    (
      name: 'Grilled Chicken Salad',
      tags: ['salad', 'healthy', 'protein', 'fresh', 'low_calorie', 'grilled'],
      expectedMood: 'energetic',
      reason: 'Protein + healthy + fresh = high energy',
    ),
    (
      name: 'Spicy Lentil Soup',
      tags: ['spicy', 'soup', 'protein', 'warm', 'healthy', 'energetic'],
      expectedMood: 'energetic',
      reason: 'Spicy + protein = energetic',
    ),

    // --- HAPPY FOODS ---
    (
      name: 'Fresh Fruit Smoothie',
      tags: ['fresh', 'healthy', 'light', 'balanced', 'low_calorie'],
      expectedMood: 'happy',
      reason: 'Fresh + healthy + balanced = happiness',
    ),
    (
      name: 'Green Salad with Greens',
      tags: ['greens', 'fresh', 'healthy', 'vegetable', 'light'],
      expectedMood: 'happy',
      reason: 'Fresh greens + healthy = happiness',
    ),

    // --- STRESSED/COMFORT FOODS ---
    (
      name: 'Aloo Samosa (Fried Potato)',
      tags: ['snack', 'fried', 'comfort_food', 'high_calorie', 'unhealthy', 'fat_rich'],
      expectedMood: 'stressed',
      reason: 'Fried + comfort_food + unhealthy = stress relief seeking',
    ),
    (
      name: 'Warm Khichdi',
      tags: ['warm', 'comfort_food', 'heavy', 'carbs', 'light'],
      expectedMood: 'stressed',
      reason: 'Warm + comfort_food + heavy = comfort seeking',
    ),

    // --- TIRED FOODS ---
    (
      name: 'Biryani (Rich)',
      tags: ['heavy', 'fat_rich', 'high_calorie', 'protein', 'rice', 'fried'],
      expectedMood: 'tired',
      reason: 'Heavy + fat_rich + high_calorie = fatigue/lethargy',
    ),
    (
      name: 'Buttery Naan with Cream Curry',
      tags: ['heavy', 'butter', 'cream', 'oil', 'high_calorie', 'fat_rich'],
      expectedMood: 'tired',
      reason: 'Very heavy + fatty = extreme fatigue signal',
    ),

    // --- SAD/COMFORT FOODS ---
    (
      name: 'Fried Chicken with Fries',
      tags: ['fried', 'comfort_food', 'fat_rich', 'unhealthy', 'heavy'],
      expectedMood: 'sad',
      reason: 'Fried comfort + fat = sadness relief seeking',
    ),
    (
      name: 'Warm Soup',
      tags: ['warm', 'comfort_food', 'soup', 'light'],
      expectedMood: 'stressed',
      reason: 'Warm comfort = stressed/anxious relief',
    ),

    // --- EDGE CASES ---
    (
      name: 'Balanced Meal',
      tags: ['balanced', 'protein', 'healthy'],
      expectedMood: 'happy',
      reason: 'Balanced meals = happiness',
    ),
    (
      name: 'Empty Tags (Should be Unknown)',
      tags: [],
      expectedMood: 'unknown',
      reason: 'No tags = unknown mood',
    ),
    (
      name: 'Single Tag',
      tags: ['breakfast'],
      expectedMood: 'unknown',
      reason: 'Insufficient tags for inference',
    ),
  ];

  int passCount = 0;
  int failCount = 0;

  for (final testCase in testCases) {
    print('\n[TEST] ${testCase.name}');
    print('Tags: ${testCase.tags}');
    print('Expected: ${testCase.expectedMood}');
    print('Reason: ${testCase.reason}');

    final (detectedMood, confidence) = TagBasedMoodDetector.detectMoodWithConfidence(testCase.tags);
    final detectedMoodStr = _moodToString(detectedMood);
    final scores = TagBasedMoodDetector.getMoodScoresFromTags(testCase.tags);

    print('Detected: $detectedMoodStr (confidence: ${(confidence * 100).toStringAsFixed(1)}%)');
    print('Scores: $scores');

    final passed = detectedMoodStr.toLowerCase() == testCase.expectedMood.toLowerCase();
    print('Result: ${passed ? '✅ PASS' : '❌ FAIL'}');

    if (passed) {
      passCount++;
    } else {
      failCount++;
    }
  }

  print('\n' + '=' * 70);
  print('\n📊 SUMMARY');
  print('Passed: $passCount');
  print('Failed: $failCount');
  print('Total: ${passCount + failCount}');
  print('Success Rate: ${((passCount / (passCount + failCount)) * 100).toStringAsFixed(1)}%\n');

  print('=' * 70);
  print('\n🧪 DETAILED ANALYSIS EXAMPLES\n');

  final detailedExamples = [
    ['comfort_food', 'fried', 'high_calorie', 'unhealthy', 'fat_rich'],
    ['healthy', 'protein', 'fresh', 'low_calorie', 'energetic'],
    ['warm', 'soup', 'comfort_food', 'light'],
  ];

  for (final tags in detailedExamples) {
    print('\nTags: $tags');
    final analysis = TagBasedMoodDetector.getDetailedAnalysis(tags);
    print('Detected Mood: ${analysis['detectedMood']}');
    print('Confidence: ${(analysis['confidence'] as double * 100).toStringAsFixed(1)}%');
    print('Scores: ${analysis['scores']}');
  }

  print('\n' + '=' * 70);
  print('\n✅ TEST SUITE COMPLETE\n');
}

String _moodToString(dynamic mood) {
  final str = mood.toString();
  if (str.contains('Mood.')) {
    return str.split('.')[1];
  }
  return str;
}
