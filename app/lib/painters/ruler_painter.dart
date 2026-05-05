import 'package:flutter/material.dart';
import '../core/theme/colors.dart';
import '../core/utils/time_format.dart';

/// Timeline ruler with adaptive tick marks
/// Ported from drawRuler() in 03-ruler.js
class RulerPainter extends CustomPainter {
  final double visibleDuration;
  final double visibleStart;

  RulerPainter({
    required this.visibleDuration,
    required this.visibleStart,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;

    // Background
    canvas.drawRect(
      Rect.fromLTWH(0, 0, w, h),
      Paint()..color = AppColors.bgSecondary,
    );

    if (visibleDuration <= 0) return;

    // Choose interval based on visible duration
    // Ported exactly from 03-ruler.js
    double interval;
    if (visibleDuration > 300) {
      interval = 30;
    } else if (visibleDuration > 120) {
      interval = 15;
    } else if (visibleDuration > 60) {
      interval = 10;
    } else if (visibleDuration > 30) {
      interval = 5;
    } else if (visibleDuration > 10) {
      interval = 2;
    } else if (visibleDuration > 4) {
      interval = 1;
    } else if (visibleDuration > 2) {
      interval = 0.5;
    } else {
      interval = 0.25;
    }

    final tickPaint = Paint()
      ..color = AppColors.ruler.withAlpha(102)
      ..strokeWidth = 1;

    final textStyle = TextStyle(
      color: AppColors.ruler,
      fontSize: 9,
      fontFeatures: const [FontFeature.tabularFigures()],
    );

    // Draw ticks
    final firstTick = (visibleStart / interval).floor() * interval;
    for (double t = firstTick; t <= visibleStart + visibleDuration; t += interval) {
      final x = ((t - visibleStart) / visibleDuration) * w;
      if (x < -20 || x > w + 20) continue;

      // Tick line
      canvas.drawLine(
        Offset(x, 0),
        Offset(x, h * 0.6),
        tickPaint,
      );

      // Label
      final label = interval < 1 ? '${t.toStringAsFixed(1)}s' : fmtShort(t);
      final textSpan = TextSpan(text: label, style: textStyle);
      final tp = TextPainter(
        text: textSpan,
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, Offset(x + 2, h - tp.height - 1));
    }

    // Bottom border line
    canvas.drawLine(
      Offset(0, h - 0.5),
      Offset(w, h - 0.5),
      Paint()..color = AppColors.border,
    );
  }

  @override
  bool shouldRepaint(RulerPainter oldDelegate) {
    return visibleDuration != oldDelegate.visibleDuration ||
        visibleStart != oldDelegate.visibleStart;
  }
}
