import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import '../../models/models.dart';
import '../../painters/frame_painter.dart';

/// Renders a single video frame at a given time to pixel bytes
/// Used by the export pipeline to generate frame images for FFmpeg
class FrameRenderer {
  final int width;
  final int height;
  final List<PhotoItem> sortedPhotos;
  final List<TextItem> sortedTexts;
  final List<SubtitleItem> sortedSubtitles;
  final List<PipItem> pipItems;
  final Map<int, ui.Image> photoImages;
  final Map<int, ui.Image> pipFrames;

  FrameRenderer({
    required this.width,
    required this.height,
    required this.sortedPhotos,
    this.sortedTexts = const [],
    this.sortedSubtitles = const [],
    this.pipItems = const [],
    this.photoImages = const {},
    this.pipFrames = const {},
  });

  /// Render frame at time [t] and return as PNG bytes
  Future<Uint8List> renderFrame(double t) async {
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    final size = Size(width.toDouble(), height.toDouble());

    // Use FramePainter to render the frame
    final painter = FramePainter(
      elapsed: t,
      sortedPhotos: sortedPhotos,
      sortedTexts: sortedTexts,
      sortedSubtitles: sortedSubtitles,
      pipItems: pipItems,
      photoImages: photoImages,
      pipFrames: pipFrames,
    );

    painter.paint(canvas, size);

    final picture = recorder.endRecording();
    final image = await picture.toImage(width, height);
    final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    picture.dispose();

    if (byteData == null) throw Exception('Failed to render frame at t=$t');
    return byteData.buffer.asUint8List();
  }

  /// Render frame and return as raw RGBA bytes (faster than PNG for FFmpeg pipe)
  Future<Uint8List> renderFrameRaw(double t) async {
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    final size = Size(width.toDouble(), height.toDouble());

    final painter = FramePainter(
      elapsed: t,
      sortedPhotos: sortedPhotos,
      sortedTexts: sortedTexts,
      sortedSubtitles: sortedSubtitles,
      pipItems: pipItems,
      photoImages: photoImages,
      pipFrames: pipFrames,
    );

    painter.paint(canvas, size);

    final picture = recorder.endRecording();
    final image = await picture.toImage(width, height);
    final byteData = await image.toByteData(format: ui.ImageByteFormat.rawRgba);
    image.dispose();
    picture.dispose();

    if (byteData == null) throw Exception('Failed to render raw frame at t=$t');
    return byteData.buffer.asUint8List();
  }
}
