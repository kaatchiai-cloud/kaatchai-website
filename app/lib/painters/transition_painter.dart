import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import '../core/utils/easing.dart';

/// All 23 transition renderers — ported from 09-transitions.js
class TransitionRenderer {
  /// Draw image with cover-fit (aspect-ratio preserving fill)
  static void drawCoverFit(Canvas canvas, ui.Image img, double cw, double ch) {
    final iw = img.width.toDouble();
    final ih = img.height.toDouble();
    if (iw == 0 || ih == 0) return;

    final ir = iw / ih;
    final cr = cw / ch;
    double dw, dh, dx, dy;
    if (ir > cr) {
      dh = ch;
      dw = ch * ir;
      dx = (cw - dw) / 2;
      dy = 0;
    } else {
      dw = cw;
      dh = cw / ir;
      dx = 0;
      dy = (ch - dh) / 2;
    }

    canvas.drawImageRect(
      img,
      Rect.fromLTWH(0, 0, iw, ih),
      Rect.fromLTWH(dx, dy, dw, dh),
      Paint(),
    );
  }

  /// Render a photo with its transition effect
  static void render({
    required Canvas canvas,
    required ui.Image image,
    required double cw,
    required double ch,
    required String transition,
    required double entryProgress,
    required double exitProgress,
    required double eEntry,
    required double eExit,
    required double eAlpha,
    required double lifeProgress,
    required int photoId,
  }) {
    switch (transition) {
      case 'none':
        drawCoverFit(canvas, image, cw, ch);
        break;

      case 'fade':
      case 'crossfade':
        canvas.saveLayer(Rect.fromLTWH(0, 0, cw, ch),
            Paint()..color = Color.fromRGBO(0, 0, 0, eAlpha));
        drawCoverFit(canvas, image, cw, ch);
        canvas.restore();
        break;

      case 'slide-left':
        double ox = 0;
        if (entryProgress < 1) ox = (1 - eEntry) * cw;
        else if (exitProgress < 1) ox = -(1 - eExit) * cw;
        canvas.save();
        canvas.translate(ox, 0);
        drawCoverFit(canvas, image, cw, ch);
        canvas.restore();
        break;

      case 'slide-right':
        double ox = 0;
        if (entryProgress < 1) ox = -(1 - eEntry) * cw;
        else if (exitProgress < 1) ox = (1 - eExit) * cw;
        canvas.save();
        canvas.translate(ox, 0);
        drawCoverFit(canvas, image, cw, ch);
        canvas.restore();
        break;

      case 'slide-up':
        double oy = 0;
        if (entryProgress < 1) oy = (1 - eEntry) * ch;
        else if (exitProgress < 1) oy = -(1 - eExit) * ch;
        canvas.save();
        canvas.translate(0, oy);
        drawCoverFit(canvas, image, cw, ch);
        canvas.restore();
        break;

      case 'slide-down':
        double oy = 0;
        if (entryProgress < 1) oy = -(1 - eEntry) * ch;
        else if (exitProgress < 1) oy = (1 - eExit) * ch;
        canvas.save();
        canvas.translate(0, oy);
        drawCoverFit(canvas, image, cw, ch);
        canvas.restore();
        break;

      case 'whip-pan':
        double ox = 0;
        if (entryProgress < 1) ox = (1 - StoriEasing.easeOutQuart(entryProgress)) * cw * 1.2;
        else if (exitProgress < 1) ox = -(1 - StoriEasing.easeOutQuart(exitProgress)) * cw * 1.2;
        final blurAmt = (ox.abs() / cw * 30).round().toDouble();
        canvas.save();
        canvas.translate(ox, 0);
        if (blurAmt > 0) {
          canvas.saveLayer(Rect.fromLTWH(-cw, 0, cw * 3, ch),
              Paint()..imageFilter = ui.ImageFilter.blur(sigmaX: blurAmt, sigmaY: 0));
        }
        drawCoverFit(canvas, image, cw, ch);
        if (blurAmt > 0) canvas.restore();
        canvas.restore();
        break;

      case 'zoom-in':
        final scale = 0.5 + 0.5 * eAlpha;
        canvas.save();
        canvas.saveLayer(Rect.fromLTWH(0, 0, cw, ch),
            Paint()..color = Color.fromRGBO(0, 0, 0, eAlpha));
        canvas.translate(cw / 2, ch / 2);
        canvas.scale(scale, scale);
        canvas.translate(-cw / 2, -ch / 2);
        drawCoverFit(canvas, image, cw, ch);
        canvas.restore();
        canvas.restore();
        break;

      case 'zoom-out':
        final scale = 1.5 - 0.5 * eAlpha;
        canvas.save();
        canvas.saveLayer(Rect.fromLTWH(0, 0, cw, ch),
            Paint()..color = Color.fromRGBO(0, 0, 0, eAlpha));
        canvas.translate(cw / 2, ch / 2);
        canvas.scale(scale, scale);
        canvas.translate(-cw / 2, -ch / 2);
        drawCoverFit(canvas, image, cw, ch);
        canvas.restore();
        canvas.restore();
        break;

      case 'rotate':
        double angle = 0, scale = 1.0;
        if (entryProgress < 1) {
          angle = (1 - StoriEasing.easeOutBack(entryProgress)) * -15 * math.pi / 180;
          scale = 0.7 + 0.3 * StoriEasing.easeOutBack(entryProgress);
        } else if (exitProgress < 1) {
          angle = (1 - StoriEasing.easeOutBack(exitProgress)) * 15 * math.pi / 180;
          scale = 0.7 + 0.3 * StoriEasing.easeOutBack(exitProgress);
        }
        canvas.save();
        canvas.saveLayer(Rect.fromLTWH(0, 0, cw, ch),
            Paint()..color = Color.fromRGBO(0, 0, 0, eAlpha));
        canvas.translate(cw / 2, ch / 2);
        canvas.rotate(angle);
        canvas.scale(scale, scale);
        canvas.translate(-cw / 2, -ch / 2);
        drawCoverFit(canvas, image, cw, ch);
        canvas.restore();
        canvas.restore();
        break;

      case 'parallax':
        double ox = 0;
        if (entryProgress < 1) ox = (1 - eEntry) * cw * 0.3;
        else if (exitProgress < 1) ox = -(1 - eExit) * cw * 0.3;
        canvas.save();
        canvas.saveLayer(Rect.fromLTWH(0, 0, cw, ch),
            Paint()..color = Color.fromRGBO(0, 0, 0, eAlpha));
        canvas.translate(cw / 2 + ox, ch / 2);
        canvas.scale(1.1, 1.1);
        canvas.translate(-cw / 2, -ch / 2);
        drawCoverFit(canvas, image, cw, ch);
        canvas.restore();
        canvas.restore();
        break;

      case 'iris':
        final maxR = math.sqrt(cw * cw + ch * ch) / 2;
        double radius;
        if (entryProgress < 1) radius = eEntry * maxR;
        else if (exitProgress < 1) radius = eExit * maxR;
        else radius = maxR;
        canvas.save();
        canvas.clipPath(Path()..addOval(
            Rect.fromCircle(center: Offset(cw / 2, ch / 2), radius: radius)));
        drawCoverFit(canvas, image, cw, ch);
        canvas.restore();
        break;

      case 'wipe-right':
        double wipeX;
        if (entryProgress < 1) wipeX = eEntry * cw;
        else if (exitProgress < 1) wipeX = eExit * cw;
        else wipeX = cw;
        canvas.save();
        canvas.clipRect(Rect.fromLTWH(0, 0, wipeX, ch));
        drawCoverFit(canvas, image, cw, ch);
        canvas.restore();
        break;

      case 'wipe-diagonal':
        double t;
        if (entryProgress < 1) t = eEntry;
        else if (exitProgress < 1) t = eExit;
        else t = 1;
        final offset = (cw + ch) * t;
        canvas.save();
        canvas.clipPath(Path()
          ..moveTo(0, 0)
          ..lineTo(offset, 0)
          ..lineTo(0, offset)
          ..close());
        drawCoverFit(canvas, image, cw, ch);
        canvas.restore();
        break;

      case 'split-h':
        double t;
        if (entryProgress < 1) t = eEntry;
        else if (exitProgress < 1) t = eExit;
        else t = 1;
        final halfW = (t * cw) / 2;
        canvas.save();
        canvas.clipRect(Rect.fromLTWH(cw / 2 - halfW, 0, halfW * 2, ch));
        drawCoverFit(canvas, image, cw, ch);
        canvas.restore();
        break;

      case 'split-v':
        double t;
        if (entryProgress < 1) t = eEntry;
        else if (exitProgress < 1) t = eExit;
        else t = 1;
        final halfH = (t * ch) / 2;
        canvas.save();
        canvas.clipRect(Rect.fromLTWH(0, ch / 2 - halfH, cw, halfH * 2));
        drawCoverFit(canvas, image, cw, ch);
        canvas.restore();
        break;

      case 'dissolve':
        double t;
        if (entryProgress < 1) t = eEntry;
        else if (exitProgress < 1) t = eExit;
        else t = 1;
        drawCoverFit(canvas, image, cw, ch);
        if (t < 1) {
          const blockSize = 20.0;
          final cols = (cw / blockSize).ceil();
          final rows = (ch / blockSize).ceil();
          // Mask: only show blocks where hash < t
          canvas.save();
          final path = Path();
          for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
              final hash = (math.sin((r * 127.1 + c * 311.7) * 43758.5453) * 0.5 + 0.5);
              if (hash >= t) {
                path.addRect(Rect.fromLTWH(
                    c * blockSize, r * blockSize, blockSize, blockSize));
              }
            }
          }
          // Paint black over blocks that shouldn't show yet
          canvas.drawPath(path, Paint()..color = Colors.black);
          canvas.restore();
        }
        break;

      case 'blur':
        final blurPx = ((1 - eAlpha) * 20).roundToDouble();
        final blurScale = 1 + (1 - eAlpha) * 0.1;
        canvas.save();
        canvas.saveLayer(Rect.fromLTWH(0, 0, cw, ch),
            Paint()
              ..color = Color.fromRGBO(0, 0, 0, eAlpha)
              ..imageFilter = ui.ImageFilter.blur(sigmaX: blurPx, sigmaY: blurPx));
        canvas.translate(cw / 2, ch / 2);
        canvas.scale(blurScale, blurScale);
        canvas.translate(-cw / 2, -ch / 2);
        drawCoverFit(canvas, image, cw, ch);
        canvas.restore();
        canvas.restore();
        break;

      case 'flash':
        drawCoverFit(canvas, image, cw, ch);
        double flashAlpha = 0;
        if (entryProgress < 1) flashAlpha = 1 - StoriEasing.easeOutQuart(entryProgress);
        else if (exitProgress < 1) flashAlpha = 1 - StoriEasing.easeOutQuart(exitProgress);
        if (flashAlpha > 0) {
          canvas.drawRect(Rect.fromLTWH(0, 0, cw, ch),
              Paint()..color = Color.fromRGBO(255, 255, 255, flashAlpha));
        }
        break;

      case 'light-leak':
        canvas.save();
        canvas.saveLayer(Rect.fromLTWH(0, 0, cw, ch),
            Paint()..color = Color.fromRGBO(0, 0, 0, eAlpha));
        drawCoverFit(canvas, image, cw, ch);
        canvas.restore();
        double leakAlpha = 0;
        if (entryProgress < 1) leakAlpha = 0.6 * (1 - StoriEasing.easeOutQuart(entryProgress));
        else if (exitProgress < 1) leakAlpha = 0.6 * (1 - StoriEasing.easeOutQuart(exitProgress));
        if (leakAlpha > 0) {
          final gradient = ui.Gradient.radial(
            Offset(cw * 0.7, ch * 0.3), cw * 0.8,
            [
              Color.fromRGBO(255, 180, 50, leakAlpha),
              Color.fromRGBO(255, 100, 30, leakAlpha * 0.5),
              const Color.fromRGBO(255, 50, 20, 0),
            ],
            [0, 0.5, 1],
          );
          canvas.drawRect(Rect.fromLTWH(0, 0, cw, ch),
              Paint()..shader = gradient);
        }
        canvas.restore();
        break;

      case 'glitch':
        double t = 0;
        if (entryProgress < 1) t = 1 - entryProgress;
        else if (exitProgress < 1) t = 1 - exitProgress;
        canvas.save();
        canvas.saveLayer(Rect.fromLTWH(0, 0, cw, ch),
            Paint()..color = Color.fromRGBO(0, 0, 0, eAlpha));
        if (t > 0) {
          final shift = (t * 15).roundToDouble();
          // Red channel shifted left
          canvas.save();
          canvas.saveLayer(Rect.fromLTWH(0, 0, cw, ch),
              Paint()..colorFilter = const ColorFilter.mode(
                  Color.fromRGBO(255, 0, 0, 0.3), BlendMode.srcATop));
          canvas.translate(-shift, 0);
          drawCoverFit(canvas, image, cw, ch);
          canvas.restore();
          canvas.restore();
          // Blue channel shifted right
          canvas.save();
          canvas.saveLayer(Rect.fromLTWH(0, 0, cw, ch),
              Paint()..colorFilter = const ColorFilter.mode(
                  Color.fromRGBO(0, 0, 255, 0.3), BlendMode.srcATop));
          canvas.translate(shift, 0);
          drawCoverFit(canvas, image, cw, ch);
          canvas.restore();
          canvas.restore();
        }
        // Base image
        drawCoverFit(canvas, image, cw, ch);
        canvas.restore();
        canvas.restore();
        break;

      case 'film-grain':
        canvas.save();
        canvas.saveLayer(Rect.fromLTWH(0, 0, cw, ch),
            Paint()..color = Color.fromRGBO(0, 0, 0, eAlpha));
        drawCoverFit(canvas, image, cw, ch);
        // Vignette overlay
        final vignette = ui.Gradient.radial(
          Offset(cw / 2, ch / 2), cw * 0.7,
          [Colors.transparent, const Color.fromRGBO(0, 0, 0, 0.4)],
          [0.5, 1.0],
        );
        canvas.drawRect(Rect.fromLTWH(0, 0, cw, ch),
            Paint()..shader = vignette);
        canvas.restore();
        canvas.restore();
        break;

      default:
        drawCoverFit(canvas, image, cw, ch);
    }
  }
}
