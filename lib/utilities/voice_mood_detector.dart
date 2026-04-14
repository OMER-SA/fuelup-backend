import 'dart:io';
import 'dart:math' as math;
import 'dart:async';

import 'package:diet_app/models/mood.dart';
import 'package:diet_app/utilities/mfcc_extractor.dart';
import 'package:diet_app/utilities/tag_based_mood_detector.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:record/record.dart';
import 'package:tflite_flutter/tflite_flutter.dart';

class VoiceMoodDetector {
  static const String _modelAssetPath = 'assets/models/SER_quant.tflite';
  static const int _minimumRecordingSeconds = 3;
  static const int _sampleRate = 22050;
  static const int _expectedFrames = 47;
  static const int _expectedFeatures = 13;
  static const int _expectedClasses = 4;

  VoiceMoodDetector._internal();

  static final VoiceMoodDetector _instance = VoiceMoodDetector._internal();

  factory VoiceMoodDetector() => _instance;

  final AudioRecorder _recorder = AudioRecorder();

  Interpreter? _interpreter;
  bool _isLoaded = false;
  Mood? _lastDetectedMood;
  double? _lastConfidence;
  bool _isRecordingSessionActive = false;

  bool get isLoaded => _isLoaded;
  Mood? get lastDetectedMood => _lastDetectedMood;
  double? get lastConfidence => _lastConfidence;

  Future<void> load() async {
    if (_isLoaded && _interpreter != null) {
      return;
    }

    _interpreter?.close();
    _interpreter = null;
    _isLoaded = false;

    try {
      debugPrint('VoiceMoodDetector: starting model load from $_modelAssetPath');
      
      final options = InterpreterOptions()..threads = 2;
      // NNAPI causes checkArgument failures on emulators; CPU-only is stable
      if (Platform.isAndroid) {
        options.useNnApiForAndroid = false;
      }

      _interpreter = await Interpreter.fromAsset(
        _modelAssetPath,
        options: options,
      );

      final interpreter = _interpreter;
      if (interpreter != null) {
        final inputTensor = interpreter.getInputTensor(0);
        final outputTensor = interpreter.getOutputTensor(0);
        debugPrint('=== SER Model Contract ===');
        debugPrint('Input shape:  ${inputTensor.shape}');
        debugPrint('Input type:   ${inputTensor.type}');
        debugPrint('Output shape: ${outputTensor.shape}');
        debugPrint('Output type:  ${outputTensor.type}');

        final inShape = inputTensor.shape;
        if (inShape.length != 3 ||
            inShape[0] != 1 ||
            inShape[1] != _expectedFrames ||
            inShape[2] != _expectedFeatures) {
          debugPrint('WARNING: unexpected input shape $inShape');
          debugPrint('Expected: [1, $_expectedFrames, $_expectedFeatures]');
        }
        final outShape = outputTensor.shape;
        if (outShape.length != 2 ||
            outShape[0] != 1 ||
            outShape[1] != _expectedClasses) {
          debugPrint('WARNING: unexpected output classes $outShape');
          debugPrint('Expected: [1, $_expectedClasses]');
        }

        debugPrint('Expected classes: ${MoodConfig.serModelLabels.length}');
        debugPrint('==========================');
      }

      _isLoaded = true;
      debugPrint('VoiceMoodDetector: model loaded successfully');
    } catch (error, stackTrace) {
      debugPrint('VoiceMoodDetector: model load failed — $error');
      debugPrintStack(stackTrace: stackTrace);
      _isLoaded = false;
    }
  }

  Future<bool> requestPermission() async {
    final status = await Permission.microphone.status;
    if (status.isGranted) {
      return true;
    }

    if (status.isPermanentlyDenied) {
      return false;
    }

    final requestedStatus = await Permission.microphone.request();
    return requestedStatus.isGranted;
  }

  Future<MoodResult> recordAndDetect({
    int maxSeconds = 8,
    void Function(int elapsed)? onSecondElapsed,
    Future<void> Function()? stopSignal,
  }) async {
    File? audioFile;
    Timer? elapsedTimer;
    Timer? maxTimer;
    final stopCompleter = Completer<void>();

    void finishRecording() {
      if (!stopCompleter.isCompleted) {
        stopCompleter.complete();
      }
    }

    try {
      if (_isRecordingSessionActive) {
        return const MoodResult(
          mood: Mood.unknown,
          confidence: 0.0,
          status: MoodResultStatus.error,
        );
      }

      _isRecordingSessionActive = true;
      _lastDetectedMood = null;
      _lastConfidence = null;

      final granted = await requestPermission();
      if (!granted) {
        return const MoodResult(
          mood: Mood.unknown,
          confidence: 0.0,
          status: MoodResultStatus.permissionDenied,
        );
      }

      if (!_isLoaded || _interpreter == null) {
        return const MoodResult(
          mood: Mood.unknown,
          confidence: 0.0,
          status: MoodResultStatus.modelNotLoaded,
        );
      }

      final tempDir = await getTemporaryDirectory();
      audioFile = File('${tempDir.path}${Platform.pathSeparator}mood_sample.wav');

      if (await audioFile.exists()) {
        await audioFile.delete();
      }

      final recorderHasPermission = await _recorder.hasPermission();
      if (!recorderHasPermission) {
        return const MoodResult(
          mood: Mood.unknown,
          confidence: 0.0,
          status: MoodResultStatus.permissionDenied,
        );
      }

      try {
        await _recorder.start(
          const RecordConfig(
            encoder: AudioEncoder.wav,
            sampleRate: _sampleRate,
            numChannels: 1,
          ),
          path: audioFile.path,
        );
      } on PlatformException catch (error, stackTrace) {
        debugPrint('VoiceMoodDetector: recorder start failed — $error');
        debugPrintStack(stackTrace: stackTrace);
        return const MoodResult(
          mood: Mood.unknown,
          confidence: 0.0,
          status: MoodResultStatus.error,
        );
      } catch (error, stackTrace) {
        debugPrint('VoiceMoodDetector: unexpected recorder error — $error');
        debugPrintStack(stackTrace: stackTrace);
        return const MoodResult(
          mood: Mood.unknown,
          confidence: 0.0,
          status: MoodResultStatus.error,
        );
      }

      if (maxSeconds <= 0) {
        finishRecording();
      }

      if (stopSignal != null) {
        unawaited(
          stopSignal().then((_) => finishRecording()).catchError((_) {
            finishRecording();
          }),
        );
      }

      if (maxSeconds > 0) {
        maxTimer = Timer(Duration(seconds: maxSeconds), finishRecording);
        elapsedTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
          final elapsed = timer.tick;
          onSecondElapsed?.call(elapsed);
          if (elapsed >= maxSeconds) {
            timer.cancel();
          }
        });
      }

      await stopCompleter.future;

      elapsedTimer?.cancel();
      maxTimer?.cancel();

      if (await _recorder.isRecording()) {
        await _recorder.stop();
      }

      final audioBytes = await audioFile.readAsBytes();
      final samples = _parseWavPcm16(audioBytes);
      if (samples.isEmpty) {
        return const MoodResult(
          mood: Mood.unknown,
          confidence: 0.0,
          status: MoodResultStatus.error,
        );
      }

      final durationSeconds = samples.length / _sampleRate;
      if (durationSeconds < _minimumRecordingSeconds) {
        return const MoodResult(
          mood: Mood.unknown,
          confidence: 0.0,
          status: MoodResultStatus.tooShort,
        );
      }

      final mfcc = MFCCExtractor.extract(
        samples,
        sampleRate: _sampleRate,
        numMFCC: _expectedFeatures,
        frameSize: 2048,
        hopSize: 512,
        numFilters: 128,
      );
      final normalized = MFCCExtractor.normalize(mfcc);
      if (normalized.isEmpty) {
        return const MoodResult(
          mood: Mood.unknown,
          confidence: 0.0,
          status: MoodResultStatus.error,
        );
      }

      final interpreter = _interpreter;
      if (interpreter == null) {
        return const MoodResult(
          mood: Mood.unknown,
          confidence: 0.0,
          status: MoodResultStatus.modelNotLoaded,
        );
      }

      final inputTensor = interpreter.getInputTensor(0);
      final inputShape = inputTensor.shape;
      debugPrint('Model expects input shape: $inputShape');

      final shapedFeatures = _reshapeFeatures(
        normalized,
        maxFrames: _expectedFrames,
        featureCount: _expectedFeatures,
      );
      assert(shapedFeatures.length == _expectedFrames);
      assert(shapedFeatures.first.length == _expectedFeatures);

      final input = <List<List<double>>>[shapedFeatures];
      final output = <List<double>>[
        List<double>.filled(_expectedClasses, 0.0, growable: false),
      ];

      interpreter.run(input, output);

      final probabilities = List<double>.from(output.first);
      if (probabilities.length != _expectedClasses) {
        return const MoodResult(
          mood: Mood.unknown,
          confidence: 0.0,
          status: MoodResultStatus.error,
        );
      }

      final sum = probabilities.reduce((a, b) => a + b);
      debugPrint(
        'Raw probs: neutral=${probabilities[0].toStringAsFixed(3)} '
        'happy=${probabilities[1].toStringAsFixed(3)} '
        'surprise=${probabilities[2].toStringAsFixed(3)} '
        'unpleasant=${probabilities[3].toStringAsFixed(3)} '
        'sum=${sum.toStringAsFixed(3)}',
      );

      final bestIndex = _argMax(probabilities);
      if (bestIndex < 0 || bestIndex >= MoodConfig.serModelLabels.length) {
        return const MoodResult(
          mood: Mood.unknown,
          confidence: 0.0,
          status: MoodResultStatus.error,
        );
      }

      final label = MoodConfig.serModelLabels[bestIndex];
      final mood = MoodConfig.serLabelToMood[label] ?? Mood.unknown;
      final confidence = probabilities[bestIndex].clamp(0.0, 1.0);

      _lastDetectedMood = mood;
      _lastConfidence = confidence;

      return MoodResult(
        mood: mood,
        confidence: confidence,
        status: MoodResultStatus.success,
      );
    } catch (error, stackTrace) {
      debugPrint('VoiceMoodDetector detect failed: $error');
      debugPrintStack(stackTrace: stackTrace);
      return const MoodResult(
        mood: Mood.unknown,
        confidence: 0.0,
        status: MoodResultStatus.error,
      );
    } finally {
      _isRecordingSessionActive = false;
      elapsedTimer?.cancel();
      maxTimer?.cancel();
      try {
        if (await _recorder.isRecording()) {
          await _recorder.stop();
        }
      } catch (_) {
        // Ignore stop errors during cleanup.
      }

      if (audioFile != null && await audioFile.exists()) {
        try {
          await audioFile.delete();
        } catch (_) {
          // Best-effort cleanup only.
        }
      }
    }
  }

  void dispose() {
    try {
      _interpreter?.close();
    } catch (_) {
      // Ignore interpreter close errors during disposal.
    }
    _interpreter = null;
    _isLoaded = false;
    _recorder.dispose();
  }

  List<double> _parseWavPcm16(Uint8List bytes) {
    if (bytes.length <= 44) {
      return <double>[];
    }

    final pcmData = bytes.sublist(44);
    final byteData = ByteData.sublistView(pcmData);
    final samples = <double>[];

    for (var offset = 0; offset + 1 < pcmData.length; offset += 2) {
      final sample = byteData.getInt16(offset, Endian.little);
      samples.add(sample / 32768.0);
    }

    return samples;
  }

  List<List<double>> _reshapeFeatures(
    List<List<double>> features, {
    required int maxFrames,
    required int featureCount,
  }) {
    final reshaped = List<List<double>>.generate(
      maxFrames,
      (_) => List<double>.filled(featureCount, 0.0, growable: false),
      growable: false,
    );

    final framesToCopy = math.min(features.length, maxFrames);
    for (var frameIndex = 0; frameIndex < framesToCopy; frameIndex++) {
      final frame = features[frameIndex];
      final valuesToCopy = math.min(frame.length, featureCount);
      for (var valueIndex = 0; valueIndex < valuesToCopy; valueIndex++) {
        reshaped[frameIndex][valueIndex] = frame[valueIndex];
      }
    }

    return reshaped;
  }

  int _argMax(List<double> values) {
    if (values.isEmpty) {
      return -1;
    }

    var bestIndex = 0;
    var bestValue = values.first;

    for (var index = 1; index < values.length; index++) {
      if (values[index] > bestValue) {
        bestValue = values[index];
        bestIndex = index;
      }
    }

    return bestIndex;
  }

  /// Fallback: Infer mood from meal tags
  ///
  /// This method uses the tag-based mood detection system to infer
  /// user mood from meal characteristics when voice detection is unavailable.
  ///
  /// USAGE:
  ///   final mealTags = ['healthy', 'protein', 'fresh', 'low_calorie'];
  ///   final result = detector.inferMoodFromMealTags(mealTags);
  ///
  /// RETURNS:
  ///   MoodResult with:
  ///   - mood: Inferred mood from tags
  ///   - confidence: 0.0-1.0 based on tag coverage
  ///   - status: always "success" (no failures)
  ///
  /// ADVANTAGES:
  ///   ✅ Never fails (always has tags)
  ///   ✅ No recording needed
  ///   ✅ Instant (no ML processing)
  ///   ✅ Explainable (rule-based)
  ///   ✅ Works offline
  MoodResult inferMoodFromMealTags(List<dynamic> mealTags) {
    try {
      final (inferredMood, confidence) =
          TagBasedMoodDetector.detectMoodWithConfidence(mealTags);

      _lastDetectedMood = inferredMood;
      _lastConfidence = confidence;

      debugPrint(
        '[VoiceMoodDetector] Tag-based mood inferred: ${_moodToString(inferredMood)} (confidence: ${(confidence * 100).toStringAsFixed(1)}%)',
      );

      return MoodResult(
        mood: inferredMood,
        confidence: confidence,
        status: MoodResultStatus.success,
      );
    } catch (error, stackTrace) {
      debugPrint('[VoiceMoodDetector] Tag-based inference error: $error');
      debugPrintStack(stackTrace: stackTrace);

      return const MoodResult(
        mood: Mood.unknown,
        confidence: 0.0,
        status: MoodResultStatus.error,
      );
    }
  }

  /// Combined mood detection: Voice + Tags
  ///
  /// Attempts voice detection first; falls back to tag-based detection.
  /// This eliminates single points of failure.
  ///
  /// RETURNS:
  ///   MoodResult with status indicating which method succeeded:
  ///   - "success" (voice succeeded)
  ///   - "fallback_to_tags" (voice failed, tags succeeded)
  ///   - "error" (both failed)
  Future<MoodResult> detectMoodWithFallback({
    int maxSeconds = 8,
    void Function(int elapsed)? onSecondElapsed,
    Future<void> Function()? stopSignal,
    List<dynamic>? fallbackMealTags,
  }) async {
    // Try voice detection first
    final voiceResult = await recordAndDetect(
      maxSeconds: maxSeconds,
      onSecondElapsed: onSecondElapsed,
      stopSignal: stopSignal,
    );

    if (voiceResult.isSuccess) {
      debugPrint('[VoiceMoodDetector] Voice detection succeeded');
      return voiceResult;
    }

    // Voice failed; try tag-based fallback
    if (fallbackMealTags != null && fallbackMealTags.isNotEmpty) {
      debugPrint('[VoiceMoodDetector] Voice failed (${voiceResult.status}); falling back to tags');
      final tagResult = inferMoodFromMealTags(fallbackMealTags);

      return MoodResult(
        mood: tagResult.mood,
        confidence: tagResult.confidence,
        status: MoodResultStatus.success,
      );
    }

    // Both failed
    debugPrint('[VoiceMoodDetector] Both voice and tag detection failed');
    return voiceResult;
  }

  String _moodToString(Mood mood) {
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

enum MoodResultStatus {
  success,
  tooShort,
  modelNotLoaded,
  permissionDenied,
  error,
}

class MoodResult {
  const MoodResult({
    required this.mood,
    required this.confidence,
    required this.status,
  });

  final Mood mood;
  final double confidence;
  final MoodResultStatus status;

  bool get isSuccess => status == MoodResultStatus.success;
}
