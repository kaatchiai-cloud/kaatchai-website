import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import '../core/utils/easing.dart';
import '../core/utils/color_utils.dart';
import '../models/text_item.dart';

/// Text overlay renderer — ported from 07-text-renderer.js
class TextOverlayRenderer {
  /// Render all text overlays visible at the given time
  static void renderAll({
    required Canvas canvas,
    required double cw,
    required double ch,
    required double elapsed,
    required List<TextItem> sortedTexts,
  }) {
    for (final t in sortedTexts) {
      if (elapsed < t.startTime || elapsed >= t.endTime) continue;
      _renderText(canvas, cw, ch, elapsed, t);
    }
  }

  static void _renderText(
      Canvas canvas, double cw, double ch, double elapsed, TextItem t) {
    final localT = elapsed - t.startTime;
    final td = math.min(t.animDur, t.duration / 2);

    // Entry/exit progress
    final entryProgress = td > 0 ? (localT / td).clamp(0.0, 1.0) : 1.0;
    final timeToEnd = t.duration - localT;
    final exitProgress = td > 0 ? (timeToEnd / td).clamp(0.0, 1.0) : 1.0;

    final eEntry = StoriEasing.easeInOutCubic(entryProgress);
    final eExit = StoriEasing.easeInOutCubic(exitProgress);
    final eAlpha = math.min(eEntry, eExit);

    // Determine display text (typewriter shortens it)
    String displayText = t.text;
    if (t.animation == 'typewriter' && entryProgress < 1) {
      final charCount = (t.text.length * entryProgress).round();
      displayText = t.text.substring(0, charCount);
    }
    if (displayText.isEmpty) return;

    // Build text style
    final color = hexToColor(t.color);
    final textStyle = TextStyle(
      fontSize: t.fontSize * (cw / 1280), // scale relative to 1280px reference
      color: color,
      fontWeight: t.bold ? FontWeight.bold : FontWeight.normal,
      fontFamily: t.font,
    );

    // Measure text
    final tp = TextPainter(
      text: TextSpan(text: displayText, style: textStyle),
      textDirection: TextDirection.ltr,
      textAlign: TextAlign.center,
    )..layout(maxWidth: cw * 0.9);

    final tw = tp.width;
    final th = tp.height;

    // Calculate position from 9-point grid
    final padSide = cw * 0.04;
    final padTop = ch * 0.06;
    final padBot = ch * 0.08;

    double x, y;
    switch (t.position) {
      case 'top-left':
        x = padSide + tw / 2;
        y = padTop + th / 2;
      case 'top-center':
        x = cw / 2;
        y = padTop + th / 2;
      case 'top-right':
        x = cw - padSide - tw / 2;
        y = padTop + th / 2;
      case 'mid-left':
        x = padSide + tw / 2;
        y = ch / 2;
      case 'center':
        x = cw / 2;
        y = ch / 2;
      case 'mid-right':
        x = cw - padSide - tw / 2;
        y = ch / 2;
      case 'bot-left':
        x = padSide + tw / 2;
        y = ch - padBot - th / 2;
      case 'bot-center':
        x = cw / 2;
        y = ch - padBot - th / 2;
      case 'bot-right':
        x = cw - padSide - tw / 2;
        y = ch - padBot - th / 2;
      default:
        x = cw / 2;
        y = ch / 2;
    }

    // Clamp to canvas bounds
    x = x.clamp(tw / 2 + 4, cw - tw / 2 - 4);
    y = y.clamp(th / 2 + 4, ch - th / 2 - 4);

    // Apply animation
    double drawAlpha = eAlpha;
    double offsetY = 0;
    double scale = 1.0;
    double blurPx = 0;

    switch (t.animation) {
      case 'fade':
        drawAlpha = eAlpha;
      case 'slide-up':
        if (entryProgress < 1) offsetY = -(1 - eEntry) * t.fontSize * 2;
        else if (exitProgress < 1) offsetY = (1 - eExit) * t.fontSize * 2;
      case 'slide-down':
        if (entryProgress < 1) offsetY = (1 - eEntry) * t.fontSize * 2;
        else if (exitProgress < 1) offsetY = -(1 - eExit) * t.fontSize * 2;
      case 'scale':
        scale = StoriEasing.easeOutBack(entryProgress);
        if (exitProgress < 1) scale *= eExit;
      case 'blur-in':
        blurPx = (1 - eEntry) * 15;
        if (exitProgress < 1) blurPx = math.max(blurPx, (1 - eExit) * 15);
      case 'typewriter':
        // Text already truncated above
        if (exitProgress < 1) drawAlpha = eExit;
    }

    canvas.save();
    canvas.translate(x, y + offsetY);
    canvas.scale(scale, scale);

    // Background rect
    if (t.bgAlpha > 0) {
      final bgColor = hexToColor(t.bgColor).withAlpha((t.bgAlpha * drawAlpha * 255).round());
      final bgPad = 6.0;
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromCenter(center: Offset.zero, width: tw + bgPad * 2, height: th + bgPad * 2),
          const Radius.circular(4),
        ),
        Paint()..color = bgColor,
      );
    }

    // Blur effect
    if (blurPx > 0) {
      canvas.saveLayer(
        Rect.fromCenter(center: Offset.zero, width: tw + 20, height: th + 20),
        Paint()..imageFilter = ui.ImageFilter.blur(sigmaX: blurPx, sigmaY: blurPx),
      );
    }

    // Stroke text
    if (t.strokeWidth > 0) {
      final strokeTp = TextPainter(
        text: TextSpan(
          text: displayText,
          style: textStyle.copyWith(
            foreground: Paint()
              ..style = PaintingStyle.stroke
              ..strokeWidth = t.strokeWidth * (cw / 1280)
              ..color = hexToColor(t.strokeColor).withAlpha((drawAlpha * 255).round()),
          ),
        ),
        textDirection: TextDirection.ltr,
        textAlign: TextAlign.center,
      )..layout(maxWidth: cw * 0.9);
      strokeTp.paint(canvas, Offset(-tw / 2, -th / 2));
    }

    // Fill text
    final fillTp = TextPainter(
      text: TextSpan(
        text: displayText,
        style: textStyle.copyWith(
          color: color.withAlpha((drawAlpha * 255).round()),
        ),
      ),
      textDirection: TextDirection.ltr,
      textAlign: TextAlign.center,
    )..layout(maxWidth: cw * 0.9);
    fillTp.paint(canvas, Offset(-tw / 2, -th / 2));

    if (blurPx > 0) canvas.restore();
    canvas.restore();
  }
}
