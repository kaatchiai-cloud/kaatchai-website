import 'dart:math' as math;
import 'dart:typed_data';

/// Silence detection and removal — ported from 14-silence.js

/// A detected silent region in audio
class SilentRegion {
  final int startSample;
  final int endSample;
  final double startTime;
  final double endTime;
  final double duration;

  SilentRegion({
    required this.startSample,
    required this.endSample,
    required this.startTime,
    required this.endTime,
    required this.duration,
  });
}

enum SilenceDetectionMode { peak, rms }

class SilenceDetectorService {
  /// Detect silent regions in audio samples
  /// Ported from detectSilence(buffer, thresholdDb, minDurationSec, mode)
  ///
  /// [samples] — interleaved PCM samples
  /// [sampleRate] — e.g., 44100
  /// [channels] — 1 or 2
  /// [thresholdDb] — silence threshold in dB (e.g., -35)
  /// [minDurationSec] — minimum silence duration to detect (e.g., 0.5)
  /// [mode] — 'peak' or 'rms'
  static List<SilentRegion> detectSilence({
    required Float64List samples,
    required int sampleRate,
    required int channels,
    double thresholdDb = -35,
    double minDurationSec = 0.5,
    SilenceDetectionMode mode = SilenceDetectionMode.peak,
  }) {
    final threshold = math.pow(10, thresholdDb / 20).toDouble();
    final totalSamples = samples.length ~/ channels;

    // Window size: 1 for peak, ~10ms for RMS
    final windowSize =
        mode == SilenceDetectionMode.peak ? 1 : (sampleRate * 0.01).round();
    final minSilenceSamples = (minDurationSec * sampleRate).round();

    final regions = <SilentRegion>[];
    int? silenceStart;

    for (int i = 0; i < totalSamples; i += windowSize) {
      final end = math.min(i + windowSize, totalSamples);
      double level;

      if (mode == SilenceDetectionMode.peak) {
        // Peak: max absolute value across all channels
        double maxVal = 0;
        for (int j = i; j < end; j++) {
          for (int c = 0; c < channels; c++) {
            final idx = j * channels + c;
            if (idx < samples.length) {
              maxVal = math.max(maxVal, samples[idx].abs());
            }
          }
        }
        level = maxVal;
      } else {
        // RMS: root mean square across all channels
        double sumSq = 0;
        int count = 0;
        for (int j = i; j < end; j++) {
          for (int c = 0; c < channels; c++) {
            final idx = j * channels + c;
            if (idx < samples.length) {
              sumSq += samples[idx] * samples[idx];
              count++;
            }
          }
        }
        level = count > 0 ? math.sqrt(sumSq / count) : 0;
      }

      final isSilent = level < threshold;

      if (isSilent && silenceStart == null) {
        silenceStart = i;
      } else if (!isSilent && silenceStart != null) {
        final silenceDuration = i - silenceStart;
        if (silenceDuration >= minSilenceSamples) {
          regions.add(SilentRegion(
            startSample: silenceStart,
            endSample: i,
            startTime: silenceStart / sampleRate,
            endTime: i / sampleRate,
            duration: silenceDuration / sampleRate,
          ));
        }
        silenceStart = null;
      }
    }

    // Handle trailing silence
    if (silenceStart != null) {
      final silenceDuration = totalSamples - silenceStart;
      if (silenceDuration >= minSilenceSamples) {
        regions.add(SilentRegion(
          startSample: silenceStart,
          endSample: totalSamples,
          startTime: silenceStart / sampleRate,
          endTime: totalSamples / sampleRate,
          duration: silenceDuration / sampleRate,
        ));
      }
    }

    return regions;
  }

  /// Remove detected silent regions from audio
  /// Ported from removeSilentRegions(buffer, regions)
  ///
  /// Returns new samples with silent regions removed, or null if nothing left
  static Float64List? removeSilentRegions({
    required Float64List samples,
    required int channels,
    required List<SilentRegion> regions,
  }) {
    if (regions.isEmpty) return Float64List.fromList(samples);

    // Calculate total samples to remove
    int removedSamples = 0;
    for (final r in regions) {
      removedSamples += (r.endSample - r.startSample) * channels;
    }

    final newLength = samples.length - removedSamples;
    if (newLength <= 0) return null;

    final result = Float64List(newLength);
    int writePos = 0;
    int readPos = 0;

    for (final region in regions) {
      final regionStartIdx = region.startSample * channels;
      final regionEndIdx = region.endSample * channels;

      // Copy audio before this region
      final beforeLen = regionStartIdx - readPos;
      if (beforeLen > 0) {
        for (int i = 0; i < beforeLen && writePos < newLength; i++) {
          result[writePos++] = samples[readPos + i];
        }
      }
      readPos = regionEndIdx;
    }

    // Copy remaining audio after last region
    while (readPos < samples.length && writePos < newLength) {
      result[writePos++] = samples[readPos++];
    }

    return result;
  }

  /// Compute peaks for waveform visualization
  /// Returns array of peak values, one per pixel column
  static Float64List computePeaks(
    Float64List samples,
    int channels,
    int numBins,
  ) {
    final peaks = Float64List(numBins);
    final samplesPerChannel = samples.length ~/ channels;
    if (samplesPerChannel == 0 || numBins == 0) return peaks;

    final samplesPerBin = samplesPerChannel / numBins;

    for (int bin = 0; bin < numBins; bin++) {
      final start = (bin * samplesPerBin).floor();
      final end = math.min(((bin + 1) * samplesPerBin).ceil(), samplesPerChannel);

      double maxVal = 0;
      for (int i = start; i < end; i++) {
        for (int c = 0; c < channels; c++) {
          final idx = i * channels + c;
          if (idx < samples.length) {
            maxVal = math.max(maxVal, samples[idx].abs());
          }
        }
      }
      peaks[bin] = maxVal;
    }

    return peaks;
  }
}
