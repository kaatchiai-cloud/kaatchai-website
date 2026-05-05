import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import '../core/utils/easing.dart';
import '../models/models.dart';
import 'transition_painter.dart';
import 'motion_painter.dart';
import 'text_overlay_painter.dart';
import 'pip_painter.dart';

/// Master frame painter — orchestrates rendering a single video frame
/// Ported from renderTimelineFrame() + renderPiP() + renderTextOverlays()
/// in 09-transitions.js and 07-text-renderer.js
class FramePainter extends CustomPainter {
  final double elapsed; // current time in seconds
  final List<PhotoItem> sortedPhotos;
  final List<TextItem> sortedTexts;
  final List<SubtitleItem> sortedSubtitles;
  final List<PipItem> pipItems;
  final Map<int, ui.Image> photoImages; // photoId → decoded image
  final Map<int, ui.Image> pipFrames; // pipId → current video frame

  FramePainter({
    required this.elapsed,
    this.sortedPhotos = const [],
    this.sortedTexts = const [],
    this.sortedSubtitles = const [],
    this.pipItems = const [],
    this.photoImages = const {},
    this.pipFrames = const {},
  });

  @override
  void paint(Canvas canvas, Size size) {
    final cw = size.width;
    final ch = size.height;

    // Black background
    canvas.drawRect(
      Rect.fromLTWH(0, 0, cw, ch),
      Paint()..color = Colors.black,
    );

    // 1. Render photo/video items with transitions
    _renderTimelineFrame(canvas, cw, ch);

    // 2. Render PiP
    PipRenderer.render(
      canvas: canvas,
      cw: cw,
      ch: ch,
      elapsed: elapsed,
      pipItems: pipItems,
      pipFrames: pipFrames,
    );

    // 3. Render text overlays
    TextOverlayRenderer.renderAll(
      canvas: canvas,
      cw: cw,
      ch: ch,
      elapsed: elapsed,
      sortedTexts: sortedTexts,
    );

    // 4. Render subtitles (same renderer, different items)
    TextOverlayRenderer.renderAll(
      canvas: canvas,
      cw: cw,
      ch: ch,
      elapsed: elapsed,
      sortedTexts: sortedSubtitles,
    );
  }

  void _renderTimelineFrame(Canvas canvas, double cw, double ch) {
    // Gather all visible photos at this time
    final visible = <PhotoItem>[];
    for (final p in sortedPhotos) {
      if (elapsed >= p.startTime && elapsed < p.endTime) {
        visible.add(p);
      }
    }
    if (visible.isEmpty) return;

    for (final p in visible) {
      final image = photoImages[p.id];
      if (image == null) continue;

      final localT = elapsed - p.startTime;
      final td = math.min(p.transDur, p.duration / 2);

      // Handle ken-burns as motion + fade
      String transition = p.transition;
      String motion = (transition == 'ken-burns') ? 'ken-burns' : p.motion;
      if (transition == 'ken-burns') transition = 'fade';

      // Entry/exit progress
      final entryProgress = td > 0 ? (localT / td).clamp(0.0, 1.0) : 1.0;
      final timeToEnd = p.duration - localT;
      final exitProgress = td > 0 ? (timeToEnd / td).clamp(0.0, 1.0) : 1.0;

      // Eased versions
      final eEntry = StoriEasing.easeInOutCubic(entryProgress);
      final eExit = StoriEasing.easeInOutCubic(exitProgress);
      final eAlpha = math.min(eEntry, eExit);

      // Life progress (0→1 through entire duration)
      final lifeProgress = localT / p.duration;

      canvas.save();

      // Apply motion (independent of transition)
      if (motion != 'none') {
        MotionRenderer.apply(
          canvas: canvas,
          motion: motion,
          lifeProgress: lifeProgress,
          photoId: p.id,
          cw: cw,
          ch: ch,
        );
      }

      // Apply transition
      TransitionRenderer.render(
        canvas: canvas,
        image: image,
        cw: cw,
        ch: ch,
        transition: transition,
        entryProgress: entryProgress,
        exitProgress: exitProgress,
        eEntry: eEntry,
        eExit: eExit,
        eAlpha: eAlpha,
        lifeProgress: lifeProgress,
        photoId: p.id,
      );

      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(FramePainter oldDelegate) {
    return elapsed != oldDelegate.elapsed ||
        sortedPhotos != oldDelegate.sortedPhotos ||
        sortedTexts != oldDelegate.sortedTexts;
  }
}
