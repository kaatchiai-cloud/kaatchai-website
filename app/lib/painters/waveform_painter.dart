import 'dart:math' as math;
import 'dart:typed_data';
import 'package:flutter/material.dart';
import '../core/theme/colors.dart';
import '../services/audio/silence_detector.dart';

/// CustomPainter for audio waveform visualization
/// Replaces WaveSurfer.js from the web app
class WaveformPainter extends CustomPainter {
  final Float64List? samples;
  final int channels;
  final double progress; // 0-1 playback progress
  final double? regionStart; // 0-1 normalized
  final double? regionEnd; // 0-1 normalized
  final List<SilentRegion>? silentRegions; // optional silence overlay
  final double totalDuration; // seconds

  WaveformPainter({
    this.samples,
    this.channels = 1,
    this.progress = 0,
    this.regionStart,
    this.regionEnd,
    this.silentRegions,
    this.totalDuration = 1,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (samples == null || samples!.isEmpty) {
      _paintEmpty(canvas, size);
      return;
    }

    final w = size.width;
    final h = size.height;
    final midY = h / 2;
    final numBins = w.floor();

    // Compute peaks
    final peaks = SilenceDetectorService.computePeaks(samples!, channels, numBins);

    // ── Draw silent regions (background) ──
    if (silentRegions != null && totalDuration > 0) {
      final silencePaint = Paint()..color = AppColors.redSoft;
      for (final region in silentRegions!) {
        final x1 = (region.startTime / totalDuration) * w;
        final x2 = (region.endTime / totalDuration) * w;
        canvas.drawRect(
          Rect.fromLTRB(x1, 0, x2, h),
          silencePaint,
        );
      }
    }

    // ── Draw selected region (background) ──
    if (regionStart != null && regionEnd != null) {
      final regionPaint = Paint()
        ..color = AppColors.waveformRegion;
      final x1 = regionStart! * w;
      final x2 = regionEnd! * w;
      canvas.drawRect(
        Rect.fromLTRB(x1, 0, x2, h),
        regionPaint,
      );
    }

    // ── Draw waveform bars ──
    final barWidth = 2.0;
    final barGap = 1.0;
    final barStep = barWidth + barGap;
    final numBars = (w / barStep).floor();

    final playedPaint = Paint()
      ..color = AppColors.waveformProgress
      ..strokeWidth = barWidth
      ..strokeCap = StrokeCap.round;

    final unplayedPaint = Paint()
      ..color = AppColors.waveform
      ..strokeWidth = barWidth
      ..strokeCap = StrokeCap.round;

    final progressX = progress * w;

    for (int i = 0; i < numBars && i < peaks.length; i++) {
      final x = i * barStep + barWidth / 2;
      final peak = peaks[math.min(i, peaks.length - 1)];
      final barHeight = math.max(2.0, peak * (h * 0.9));

      final paint = x <= progressX ? playedPaint : unplayedPaint;

      canvas.drawLine(
        Offset(x, midY - barHeight / 2),
        Offset(x, midY + barHeight / 2),
        paint,
      );
    }

    // ── Draw cursor (playhead) ──
    final cursorPaint = Paint()
      ..color = AppColors.playhead
      ..strokeWidth = 2;
    canvas.drawLine(
      Offset(progressX, 0),
      Offset(progressX, h),
      cursorPaint,
    );

    // ── Draw region handles ──
    if (regionStart != null && regionEnd != null) {
      final handlePaint = Paint()
        ..color = AppColors.accent
        ..strokeWidth = 2;
      final x1 = regionStart! * w;
      final x2 = regionEnd! * w;
      canvas.drawLine(Offset(x1, 0), Offset(x1, h), handlePaint);
      canvas.drawLine(Offset(x2, 0), Offset(x2, h), handlePaint);
    }
  }

  void _paintEmpty(Canvas canvas, Size size) {
    // Draw a center line for empty state
    final paint = Paint()
      ..color = AppColors.textMuted.withAlpha(51)
      ..strokeWidth = 1;
    canvas.drawLine(
      Offset(0, size.height / 2),
      Offset(size.width, size.height / 2),
      paint,
    );
  }

  @override
  bool shouldRepaint(WaveformPainter oldDelegate) {
    return samples != oldDelegate.samples ||
        progress != oldDelegate.progress ||
        regionStart != oldDelegate.regionStart ||
        regionEnd != oldDelegate.regionEnd ||
        silentRegions != oldDelegate.silentRegions;
  }
}
