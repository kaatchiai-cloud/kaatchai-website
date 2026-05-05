import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:stori_app/services/audio/wav_encoder.dart';
import 'package:stori_app/services/audio/silence_detector.dart';
import 'package:stori_app/services/camera/speaker_detector.dart';
import 'package:stori_app/core/utils/easing.dart';

void main() {
  group('WavEncoder', () {
    test('encodes valid WAV header', () {
      final samples = Float64List.fromList([0.0, 0.5, -0.5, 1.0, -1.0]);
      final wav = WavEncoder.encode(samples, 44100, 1);

      // Check RIFF header
      expect(wav[0], 0x52); // R
      expect(wav[1], 0x49); // I
      expect(wav[2], 0x46); // F
      expect(wav[3], 0x46); // F

      // Check WAVE
      expect(wav[8], 0x57); // W
      expect(wav[9], 0x41); // A
      expect(wav[10], 0x56); // V
      expect(wav[11], 0x45); // E

      // Check fmt
      expect(wav[12], 0x66); // f
      expect(wav[13], 0x6D); // m
      expect(wav[14], 0x74); // t

      // Check PCM format = 1
      final data = ByteData.sublistView(wav);
      expect(data.getUint16(20, Endian.little), 1);

      // Check channels = 1
      expect(data.getUint16(22, Endian.little), 1);

      // Check sample rate = 44100
      expect(data.getUint32(24, Endian.little), 44100);

      // Total size: 44 header + 5 samples * 2 bytes = 54
      expect(wav.length, 54);
    });

    test('handles stereo encoding', () {
      final samples = Float64List.fromList([0.5, -0.5, 0.3, -0.3]);
      final wav = WavEncoder.encode(samples, 48000, 2);
      final data = ByteData.sublistView(wav);
      expect(data.getUint16(22, Endian.little), 2); // channels = 2
      expect(data.getUint32(24, Endian.little), 48000); // sample rate
    });
  });

  group('SilenceDetector', () {
    test('detects silence in audio', () {
      // Create audio: 1s silence + 1s tone + 1s silence
      final sr = 1000;
      final samples = Float64List(3000);
      // Fill middle section with a tone
      for (int i = 1000; i < 2000; i++) {
        samples[i] = 0.5;
      }

      final regions = SilenceDetectorService.detectSilence(
        samples: samples,
        sampleRate: sr,
        channels: 1,
        thresholdDb: -20,
        minDurationSec: 0.5,
        mode: SilenceDetectionMode.peak,
      );

      expect(regions.length, 2);
      expect(regions[0].startTime, closeTo(0.0, 0.02));
      expect(regions[0].endTime, closeTo(1.0, 0.02));
      expect(regions[1].startTime, closeTo(2.0, 0.02));
    });

    test('removes silent regions', () {
      final samples = Float64List.fromList([
        0.0, 0.0, 0.0, // silence (3 samples)
        0.5, 0.6, 0.7, // audio
        0.0, 0.0, 0.0, // silence (3 samples)
      ]);

      final regions = [
        SilentRegion(startSample: 0, endSample: 3, startTime: 0, endTime: 0.3, duration: 0.3),
        SilentRegion(startSample: 6, endSample: 9, startTime: 0.6, endTime: 0.9, duration: 0.3),
      ];

      final result = SilenceDetectorService.removeSilentRegions(
        samples: samples,
        channels: 1,
        regions: regions,
      );

      expect(result, isNotNull);
      expect(result!.length, 3); // Only the audio portion remains
      expect(result[0], 0.5);
      expect(result[1], 0.6);
      expect(result[2], 0.7);
    });

    test('computePeaks produces correct number of bins', () {
      final samples = Float64List(1000);
      for (int i = 0; i < 1000; i++) {
        samples[i] = (i % 100) / 100.0;
      }

      final peaks = SilenceDetectorService.computePeaks(samples, 1, 10);
      expect(peaks.length, 10);
      // All peaks should be > 0 since we have non-zero samples
      for (final p in peaks) {
        expect(p, greaterThanOrEqualTo(0));
      }
    });
  });

  group('SpeakerDetector', () {
    test('detects host when left channel is louder', () {
      final detector = SpeakerDetector();
      // Multiple consistent frames for hysteresis
      detector.processFrame(0.5, 0.1, 0.0);
      detector.processFrame(0.5, 0.1, 0.2);
      detector.processFrame(0.5, 0.1, 0.4);
      final result = detector.processFrame(0.5, 0.1, 0.6);
      expect(result, 'host');
    });

    test('detects guest when right channel is louder', () {
      final detector = SpeakerDetector();
      detector.processFrame(0.1, 0.5, 0.0);
      detector.processFrame(0.1, 0.5, 0.2);
      detector.processFrame(0.1, 0.5, 0.4);
      final result = detector.processFrame(0.1, 0.5, 0.6);
      expect(result, 'guest');
    });

    test('detects silence when both channels are quiet', () {
      final detector = SpeakerDetector();
      final result = detector.processFrame(0.01, 0.01, 0.0);
      expect(result, 'none');
    });
  });

  group('Easing', () {
    test('easeInOutCubic boundaries', () {
      expect(StoriEasing.easeInOutCubic(0), closeTo(0, 0.001));
      expect(StoriEasing.easeInOutCubic(0.5), closeTo(0.5, 0.001));
      expect(StoriEasing.easeInOutCubic(1), closeTo(1, 0.001));
    });

    test('easeOutQuart decelerates', () {
      expect(StoriEasing.easeOutQuart(0), closeTo(0, 0.001));
      expect(StoriEasing.easeOutQuart(1), closeTo(1, 0.001));
      // Should be past halfway at t=0.5
      expect(StoriEasing.easeOutQuart(0.5), greaterThan(0.5));
    });

    test('easeOutBack overshoots', () {
      // easeOutBack should go above 1.0 briefly
      expect(StoriEasing.easeOutBack(0.8), greaterThan(1.0));
      expect(StoriEasing.easeOutBack(1), closeTo(1, 0.001));
    });
  });
}
