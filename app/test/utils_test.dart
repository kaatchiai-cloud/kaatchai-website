import 'dart:ui';
import 'package:flutter_test/flutter_test.dart';
import 'package:stori_app/core/utils/time_format.dart';
import 'package:stori_app/core/utils/color_utils.dart';
import 'package:stori_app/core/utils/easing.dart';
import 'package:stori_app/core/constants/transitions.dart';
import 'package:stori_app/core/constants/style_presets.dart';
import 'package:stori_app/providers/zoom_provider.dart';

void main() {
  group('Time Formatting', () {
    test('fmt formats with milliseconds', () {
      expect(fmt(0), '0:00.000');
      expect(fmt(65.5), '1:05.500');
      expect(fmt(3723.123), '62:03.123');
    });

    test('fmtShort formats M:SS', () {
      expect(fmtShort(0), '0:00');
      expect(fmtShort(65), '1:05');
      expect(fmtShort(3600), '60:00');
    });

    test('fmtLong formats HH:MM:SS', () {
      expect(fmtLong(0), '00:00');
      expect(fmtLong(65), '01:05');
      expect(fmtLong(3661), '1:01:01');
    });

    test('fmtDuration formats with s suffix', () {
      expect(fmtDuration(5), '5.0s');
      expect(fmtDuration(0.5), '0.5s');
    });
  });

  group('Color Utils', () {
    test('hexToColor parses 6-digit hex', () {
      final color = hexToColor('#ff0000');
      expect(color, const Color(0xFFff0000));
    });

    test('colorToHex produces correct hex', () {
      final hex = colorToHex(const Color(0xFF00ff00));
      expect(hex, '#00ff00');
    });

    test('parseGradient extracts colors', () {
      final colors = parseGradient('linear-gradient(135deg, #667eea, #764ba2)');
      expect(colors.length, 2);
    });

    test('parseGradient returns defaults for invalid input', () {
      final colors = parseGradient('invalid');
      expect(colors.length, 2); // default colors
    });
  });

  group('Easing Functions', () {
    test('all functions return 0 at t=0', () {
      expect(StoriEasing.easeInOutCubic(0), closeTo(0, 0.001));
      expect(StoriEasing.easeOutQuart(0), closeTo(0, 0.001));
      expect(StoriEasing.easeInQuart(0), closeTo(0, 0.001));
    });

    test('all functions return 1 at t=1', () {
      expect(StoriEasing.easeInOutCubic(1), closeTo(1, 0.001));
      expect(StoriEasing.easeOutQuart(1), closeTo(1, 0.001));
      expect(StoriEasing.easeInQuart(1), closeTo(1, 0.001));
      expect(StoriEasing.easeOutBack(1), closeTo(1, 0.001));
    });

    test('easeOutBack overshoots past 1.0', () {
      expect(StoriEasing.easeOutBack(0.7), greaterThan(1.0));
    });

    test('clamp01 works correctly', () {
      expect(StoriEasing.clamp01(-0.5), 0.0);
      expect(StoriEasing.clamp01(0.5), 0.5);
      expect(StoriEasing.clamp01(1.5), 1.0);
    });
  });

  group('TransitionType', () {
    test('fromKey finds correct transition', () {
      expect(TransitionType.fromKey('fade'), TransitionType.fade);
      expect(TransitionType.fromKey('glitch'), TransitionType.glitch);
      expect(TransitionType.fromKey('invalid'), TransitionType.none);
    });

    test('all 23 transitions exist', () {
      expect(TransitionType.values.length, 23);
    });
  });

  group('MotionType', () {
    test('fromKey finds correct motion', () {
      expect(MotionType.fromKey('ken-burns'), MotionType.kenBurns);
      expect(MotionType.fromKey('invalid'), MotionType.none);
    });

    test('all 8 motions exist', () {
      expect(MotionType.values.length, 8);
    });
  });

  group('Style Presets', () {
    test('20 presets defined', () {
      expect(stylePresets.length, 20);
    });

    test('all presets have non-empty descriptions', () {
      for (final entry in stylePresets.entries) {
        expect(entry.value.isNotEmpty, true, reason: '${entry.key} has empty description');
      }
    });
  });

  group('Templates', () {
    test('43+ templates defined', () {
      expect(templates.length, greaterThanOrEqualTo(43));
    });

    test('9 categories defined', () {
      expect(templateCategories.length, 9);
    });
  });

  group('ZoomState', () {
    test('coordinate conversion at zoom 1x', () {
      final zoom = ZoomState(totalDuration: 60);
      expect(zoom.visibleDuration, 60);
      expect(zoom.secToPx(30, 600), closeTo(300, 1)); // 30s = halfway
      expect(zoom.pxToSec(300, 600), closeTo(30, 0.1));
    });

    test('coordinate conversion at zoom 2x', () {
      final zoom = ZoomState(zoomLevel: 2, scrollOffset: 0, totalDuration: 60);
      expect(zoom.visibleDuration, 30); // half visible
      expect(zoom.secToPx(15, 600), closeTo(300, 1)); // 15s = halfway of visible 30s
    });

    test('coordinate conversion with scroll offset', () {
      final zoom = ZoomState(zoomLevel: 2, scrollOffset: 10, totalDuration: 60);
      expect(zoom.visibleStart, 10);
      expect(zoom.visibleEnd, 40); // 10 + 30
      expect(zoom.secToPx(10, 600), closeTo(0, 1)); // scroll offset = left edge
    });

    test('maxScrollOffset calculation', () {
      final zoom = ZoomState(zoomLevel: 2, totalDuration: 60);
      expect(zoom.maxScrollOffset, 30); // 60 - 30
    });
  });
}
