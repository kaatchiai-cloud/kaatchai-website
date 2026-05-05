import 'dart:math' as math;
import 'dart:typed_data';
import '../../models/recording_session.dart';
import '../../core/constants/app_constants.dart';

/// Real-time speaker detection using stereo audio level comparison
/// Left channel = front mic (host), Right channel = back mic (guest)
class SpeakerDetector {
  final List<SpeakerSegment> _segments = [];
  String _currentSpeaker = 'none';
  double _currentSegmentStart = 0;

  // Hysteresis: prevent rapid switching
  int _sameCount = 0;
  static const int _hysteresisFrames = 3; // ~600ms at 200ms windows

  /// Process a stereo audio frame and return the active speaker
  /// [leftRms] = front mic (host) RMS level (0-1)
  /// [rightRms] = back mic (guest) RMS level (0-1)
  /// [timestamp] = current time in seconds
  String processFrame(double leftRms, double rightRms, double timestamp) {
    final silenceThreshold = _dbToLinear(AppConstants.speakerSilenceThresholdDb);

    String detected;
    if (leftRms < silenceThreshold && rightRms < silenceThreshold) {
      detected = 'none'; // Both silent
    } else if (leftRms > rightRms * 1.3) {
      detected = 'host'; // Host is louder (30% threshold to avoid ties)
    } else if (rightRms > leftRms * 1.3) {
      detected = 'guest'; // Guest is louder
    } else {
      detected = _currentSpeaker; // Too close, keep current
    }

    // Hysteresis: require consistent detection before switching
    if (detected == _currentSpeaker) {
      _sameCount = 0;
    } else {
      _sameCount++;
      if (_sameCount < _hysteresisFrames) {
        return _currentSpeaker; // Not enough consistent frames to switch
      }
      _sameCount = 0;
    }

    // Speaker changed — close current segment and start new one
    if (detected != _currentSpeaker) {
      _closeSegment(timestamp);
      _currentSpeaker = detected;
      _currentSegmentStart = timestamp;
    }

    return _currentSpeaker;
  }

  /// Finalize and get all speaker segments
  List<SpeakerSegment> finalize(double totalDuration) {
    _closeSegment(totalDuration);
    return List.from(_segments);
  }

  void _closeSegment(double endTime) {
    if (_currentSpeaker != 'none' && endTime > _currentSegmentStart) {
      _segments.add(SpeakerSegment(
        speakerId: _currentSpeaker,
        startTime: _currentSegmentStart,
        endTime: endTime,
        confidence: 1.0,
      ));
    }
  }

  /// Reset detector state
  void reset() {
    _segments.clear();
    _currentSpeaker = 'none';
    _currentSegmentStart = 0;
    _sameCount = 0;
  }

  /// Convert dB to linear amplitude
  static double _dbToLinear(double db) {
    return math.pow(10, db / 20).toDouble();
  }

  /// Compute RMS energy from PCM samples
  static double computeRms(Float64List samples) {
    if (samples.isEmpty) return 0;
    double sum = 0;
    for (final s in samples) {
      sum += s * s;
    }
    return math.sqrt(sum / samples.length);
  }

  /// Compute RMS from raw Int16 PCM bytes (common from platform channels)
  static double computeRmsFromInt16(Uint8List bytes) {
    if (bytes.length < 2) return 0;
    final samples = bytes.buffer.asInt16List();
    double sum = 0;
    for (final s in samples) {
      final normalized = s / 32768.0;
      sum += normalized * normalized;
    }
    return math.sqrt(sum / samples.length);
  }
}

/// Post-recording speaker diarization
/// Analyzes the full stereo audio file and produces a complete speaker timeline
class PostRecordingSpeakerAnalyzer {
  /// Analyze stereo WAV file and generate speaker timeline
  /// Uses windowed RMS comparison with smoothing
  static List<SpeakerSegment> analyze({
    required Float64List leftChannel,
    required Float64List rightChannel,
    required int sampleRate,
    double windowMs = 200,
    double silenceDbThreshold = -40,
  }) {
    final windowSamples = (sampleRate * windowMs / 1000).round();
    final detector = SpeakerDetector();
    final totalSamples = math.min(leftChannel.length, rightChannel.length);

    for (int i = 0; i < totalSamples; i += windowSamples) {
      final end = math.min(i + windowSamples, totalSamples);
      final leftWindow = Float64List.sublistView(leftChannel, i, end);
      final rightWindow = Float64List.sublistView(rightChannel, i, end);

      final leftRms = SpeakerDetector.computeRms(leftWindow);
      final rightRms = SpeakerDetector.computeRms(rightWindow);
      final timestamp = i / sampleRate;

      detector.processFrame(leftRms, rightRms, timestamp);
    }

    return detector.finalize(totalSamples / sampleRate);
  }

  /// Merge short segments and fill small gaps for smoother switching
  static List<SpeakerSegment> smooth(
    List<SpeakerSegment> segments, {
    double minSegmentDuration = 0.5, // merge segments shorter than this
    double maxGap = 0.3, // fill gaps shorter than this
  }) {
    if (segments.isEmpty) return segments;

    final result = <SpeakerSegment>[];
    SpeakerSegment? current;

    for (final seg in segments) {
      if (seg.duration < minSegmentDuration) continue; // skip very short

      if (current == null) {
        current = seg;
        continue;
      }

      // Same speaker and close together — merge
      if (seg.speakerId == current.speakerId &&
          (seg.startTime - current.endTime) <= maxGap) {
        current = SpeakerSegment(
          speakerId: current.speakerId,
          startTime: current.startTime,
          endTime: seg.endTime,
          confidence: (current.confidence + seg.confidence) / 2,
        );
      } else {
        result.add(current);
        current = seg;
      }
    }

    if (current != null) result.add(current);
    return result;
  }
}
