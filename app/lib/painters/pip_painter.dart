import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import '../models/pip_item.dart';

/// Picture-in-Picture renderer — ported from renderPiP() in 09-transitions.js
class PipRenderer {
  /// Render PiP overlay at the given time
  /// [pipFrames] maps PipItem id → current video frame as ui.Image
  static void render({
    required Canvas canvas,
    required double cw,
    required double ch,
    required double elapsed,
    required List<PipItem> pipItems,
    required Map<int, ui.Image> pipFrames,
  }) {
    if (pipItems.isEmpty) return;

    // Find first active PiP at this time (first wins on overlap)
    final pip = pipItems.cast<PipItem?>().firstWhere(
      (p) => p != null && elapsed >= p.inPoint && elapsed <= p.outPoint,
      orElse: () => null,
    );
    if (pip == null) return;

    final frame = pipFrames[pip.id];
    if (frame == null) return;

    // Dimensions
    final pipW = (cw * pip.size / 100).roundToDouble();
    final pipH = pip.shape == 'circle'
        ? pipW
        : (pipW * (frame.height / math.max(frame.width, 1))).roundToDouble();
    final pad = math.max(pip.border + 4, cw * 0.02);

    // Position
    double x, y;
    if (pip.customX != null && pip.customY != null) {
      x = pip.customX!;
      y = pip.customY!;
    } else {
      switch (pip.position) {
        case 'top-left':
          x = pad; y = pad;
        case 'top-center':
          x = (cw - pipW) / 2; y = pad;
        case 'top-right':
          x = cw - pipW - pad; y = pad;
        case 'mid-left':
          x = pad; y = (ch - pipH) / 2;
        case 'center':
          x = (cw - pipW) / 2; y = (ch - pipH) / 2;
        case 'mid-right':
          x = cw - pipW - pad; y = (ch - pipH) / 2;
        case 'bot-left':
          x = pad; y = ch - pipH - pad;
        case 'bot-center':
          x = (cw - pipW) / 2; y = ch - pipH - pad;
        default: // bot-right
          x = cw - pipW - pad; y = ch - pipH - pad;
      }
    }

    canvas.save();

    // Shadow
    if (pip.shadow) {
      final shadowPath = _shapePath(x, y, pipW, pipH, pip.shape);
      canvas.drawShadow(shadowPath, Colors.black, 12, false);
    }

    // Border
    if (pip.border > 0) {
      final borderPath = _shapePath(
        x - pip.border, y - pip.border,
        pipW + pip.border * 2, pipH + pip.border * 2,
        pip.shape,
      );
      canvas.drawPath(
        borderPath,
        Paint()..color = _parseColor(pip.borderColor),
      );
    }

    // Clip to shape and draw video frame
    final clipPath = _shapePath(x, y, pipW, pipH, pip.shape);
    canvas.clipPath(clipPath);

    // Cover-fit the video frame
    _drawCoverFitRect(canvas, frame, x, y, pipW, pipH);

    canvas.restore();
  }

  /// Create path for PiP shape
  static Path _shapePath(double x, double y, double w, double h, String shape) {
    final path = Path();
    if (shape == 'circle') {
      final r = math.min(w, h) / 2;
      path.addOval(Rect.fromCircle(
        center: Offset(x + w / 2, y + h / 2),
        radius: r,
      ));
    } else if (shape == 'rounded') {
      final r = math.min(w, h) * 0.15;
      path.addRRect(RRect.fromRectAndRadius(
        Rect.fromLTWH(x, y, w, h),
        Radius.circular(r),
      ));
    } else {
      path.addRect(Rect.fromLTWH(x, y, w, h));
    }
    return path;
  }

  /// Draw image cover-fit within a rect
  static void _drawCoverFitRect(
      Canvas canvas, ui.Image img, double x, double y, double w, double h) {
    final iw = img.width.toDouble();
    final ih = img.height.toDouble();
    if (iw == 0 || ih == 0) return;

    final ir = iw / ih;
    final cr = w / h;
    double dw, dh, dx, dy;
    if (ir > cr) {
      dh = h; dw = h * ir; dx = x + (w - dw) / 2; dy = y;
    } else {
      dw = w; dh = w / ir; dx = x; dy = y + (h - dh) / 2;
    }

    canvas.drawImageRect(
      img,
      Rect.fromLTWH(0, 0, iw, ih),
      Rect.fromLTWH(dx, dy, dw, dh),
      Paint(),
    );
  }

  static Color _parseColor(String hex) {
    hex = hex.replaceFirst('#', '');
    if (hex.length == 6) hex = 'FF$hex';
    return Color(int.parse(hex, radix: 16));
  }
}
