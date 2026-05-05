import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../painters/frame_painter.dart';
import '../../../../providers/timeline_provider.dart';
import '../../../../providers/audio_provider.dart';

/// Preview canvas widget — renders video frames using FramePainter
/// Driven by a Ticker at ~30fps, synced to audio playback
class PreviewCanvas extends ConsumerStatefulWidget {
  final double width;
  final double height;
  final Map<int, ui.Image> photoImages;
  final Map<int, ui.Image> pipFrames;

  const PreviewCanvas({
    super.key,
    required this.width,
    required this.height,
    this.photoImages = const {},
    this.pipFrames = const {},
  });

  @override
  ConsumerState<PreviewCanvas> createState() => _PreviewCanvasState();
}

class _PreviewCanvasState extends ConsumerState<PreviewCanvas>
    with SingleTickerProviderStateMixin {
  late Ticker _ticker;
  double _elapsed = 0;

  @override
  void initState() {
    super.initState();
    _ticker = createTicker(_onTick);
  }

  void _onTick(Duration duration) {
    final audio = ref.read(audioProvider);
    if (audio.isPlaying) {
      setState(() {
        _elapsed = audio.currentTime;
      });
    }
  }

  @override
  void dispose() {
    _ticker.dispose();
    super.dispose();
  }

  void startPreview() {
    if (!_ticker.isActive) _ticker.start();
  }

  void stopPreview() {
    if (_ticker.isActive) _ticker.stop();
  }

  @override
  Widget build(BuildContext context) {
    final audio = ref.watch(audioProvider);
    final sortedPhotos = ref.watch(sortedPhotosProvider);
    final sortedTexts = ref.watch(sortedTextsProvider);
    final sortedSubs = ref.watch(sortedSubtitlesProvider);
    final timeline = ref.watch(timelineProvider);

    // Use audio current time when not playing (scrubbing)
    final displayTime = audio.isPlaying ? _elapsed : audio.currentTime;

    // Start/stop ticker based on playback state
    if (audio.isPlaying && !_ticker.isActive) {
      _ticker.start();
    } else if (!audio.isPlaying && _ticker.isActive) {
      _ticker.stop();
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: SizedBox(
        width: widget.width,
        height: widget.height,
        child: CustomPaint(
          size: Size(widget.width, widget.height),
          painter: FramePainter(
            elapsed: displayTime,
            sortedPhotos: sortedPhotos,
            sortedTexts: sortedTexts,
            sortedSubtitles: sortedSubs,
            pipItems: timeline.pipItems,
            photoImages: widget.photoImages,
            pipFrames: widget.pipFrames,
          ),
        ),
      ),
    );
  }
}
