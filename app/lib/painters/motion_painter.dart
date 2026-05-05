import 'package:flutter/material.dart';

/// All 8 motion effects — ported from applyMotionTransform() in 09-transitions.js
class MotionRenderer {
  /// Apply continuous motion transform to canvas
  /// [lifeProgress] is 0→1 through the photo's entire duration
  /// [photoId] is used as a seed for Ken Burns variation
  static void apply({
    required Canvas canvas,
    required String motion,
    required double lifeProgress,
    required int photoId,
    required double cw,
    required double ch,
  }) {
    switch (motion) {
      case 'ken-burns':
        final seed = photoId % 4;
        final scale = 1.0 + 0.15 * lifeProgress;
        final panX = (seed < 2 ? 1.0 : -1.0) * lifeProgress * cw * 0.05;
        final panY = (seed % 2 == 0 ? 1.0 : -1.0) * lifeProgress * ch * 0.05;
        canvas.translate(cw / 2 + panX, ch / 2 + panY);
        canvas.scale(scale, scale);
        canvas.translate(-cw / 2, -ch / 2);
        break;

      case 'slow-zoom-in':
        final scale = 1.0 + 0.1 * lifeProgress;
        canvas.translate(cw / 2, ch / 2);
        canvas.scale(scale, scale);
        canvas.translate(-cw / 2, -ch / 2);
        break;

      case 'slow-zoom-out':
        final scale = 1.1 - 0.1 * lifeProgress;
        canvas.translate(cw / 2, ch / 2);
        canvas.scale(scale, scale);
        canvas.translate(-cw / 2, -ch / 2);
        break;

      case 'pan-left':
        final ox = -lifeProgress * cw * 0.08;
        canvas.translate(cw / 2 + ox, ch / 2);
        canvas.scale(1.05, 1.05);
        canvas.translate(-cw / 2, -ch / 2);
        break;

      case 'pan-right':
        final ox = lifeProgress * cw * 0.08;
        canvas.translate(cw / 2 + ox, ch / 2);
        canvas.scale(1.05, 1.05);
        canvas.translate(-cw / 2, -ch / 2);
        break;

      case 'pan-up':
        final oy = -lifeProgress * ch * 0.08;
        canvas.translate(cw / 2, ch / 2 + oy);
        canvas.scale(1.05, 1.05);
        canvas.translate(-cw / 2, -ch / 2);
        break;

      case 'pan-down':
        final oy = lifeProgress * ch * 0.08;
        canvas.translate(cw / 2, ch / 2 + oy);
        canvas.scale(1.05, 1.05);
        canvas.translate(-cw / 2, -ch / 2);
        break;
    }
  }
}
