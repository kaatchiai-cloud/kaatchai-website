import 'dart:typed_data';
import 'package:flutter/material.dart';
import '../../../../core/theme/colors.dart';
import '../../../../painters/waveform_painter.dart';
import '../../../../services/audio/silence_detector.dart';

/// Interactive audio waveform widget with region selection
/// Replaces WaveSurfer.js + Regions plugin from the web app
class AudioWaveformWidget extends StatefulWidget {
  final Float64List? samples;
  final int channels;
  final double duration; // total audio duration in seconds
  final double currentTime; // current playback position in seconds
  final double? regionStart; // selected region start in seconds
  final double? regionEnd; // selected region end in seconds
  final List<SilentRegion>? silentRegions;
  final double height;
  final void Function(double time)? onSeek;
  final void Function(double start, double end)? onRegionChanged;
  final void Function()? onRegionCleared;

  const AudioWaveformWidget({
    super.key,
    this.samples,
    this.channels = 1,
    this.duration = 0,
    this.currentTime = 0,
    this.regionStart,
    this.regionEnd,
    this.silentRegions,
    this.height = 100,
    this.onSeek,
    this.onRegionChanged,
    this.onRegionCleared,
  });

  @override
  State<AudioWaveformWidget> createState() => _AudioWaveformWidgetState();
}

class _AudioWaveformWidgetState extends State<AudioWaveformWidget> {
  bool _isDraggingRegion = false;
  double? _dragStart; // normalized 0-1
  double? _dragEnd; // normalized 0-1

  @override
  Widget build(BuildContext context) {
    final progress =
        widget.duration > 0 ? widget.currentTime / widget.duration : 0.0;
    final regionStartNorm =
        widget.regionStart != null && widget.duration > 0
            ? widget.regionStart! / widget.duration
            : _dragStart;
    final regionEndNorm = widget.regionEnd != null && widget.duration > 0
        ? widget.regionEnd! / widget.duration
        : _dragEnd;

    return Container(
      height: widget.height,
      decoration: BoxDecoration(
        color: AppColors.bgCard,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.border),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(7),
        child: GestureDetector(
          onTapDown: (details) => _handleTap(details),
          onPanStart: (details) => _handleDragStart(details),
          onPanUpdate: (details) => _handleDragUpdate(details),
          onPanEnd: (details) => _handleDragEnd(details),
          child: widget.samples != null && widget.samples!.isNotEmpty
              ? CustomPaint(
                  size: Size(double.infinity, widget.height),
                  painter: WaveformPainter(
                    samples: widget.samples,
                    channels: widget.channels,
                    progress: progress,
                    regionStart: regionStartNorm,
                    regionEnd: regionEndNorm,
                    silentRegions: widget.silentRegions,
                    totalDuration: widget.duration,
                  ),
                )
              : Center(
                  child: Text(
                    widget.samples == null
                        ? 'No audio loaded'
                        : 'Empty audio',
                    style: const TextStyle(
                      color: AppColors.textMuted,
                      fontSize: 12,
                    ),
                  ),
                ),
        ),
      ),
    );
  }

  void _handleTap(TapDownDetails details) {
    if (widget.duration <= 0) return;
    final box = context.findRenderObject() as RenderBox;
    final localX = details.localPosition.dx;
    final normalized = (localX / box.size.width).clamp(0.0, 1.0);
    final time = normalized * widget.duration;

    // If tapping outside existing region, clear it
    if (widget.regionStart != null && widget.regionEnd != null) {
      widget.onRegionCleared?.call();
    }

    widget.onSeek?.call(time);
  }

  void _handleDragStart(DragStartDetails details) {
    if (widget.duration <= 0) return;
    final box = context.findRenderObject() as RenderBox;
    final normalized =
        (details.localPosition.dx / box.size.width).clamp(0.0, 1.0);

    setState(() {
      _isDraggingRegion = true;
      _dragStart = normalized;
      _dragEnd = normalized;
    });
  }

  void _handleDragUpdate(DragUpdateDetails details) {
    if (!_isDraggingRegion || widget.duration <= 0) return;
    final box = context.findRenderObject() as RenderBox;
    final normalized =
        (details.localPosition.dx / box.size.width).clamp(0.0, 1.0);

    setState(() {
      _dragEnd = normalized;
    });
  }

  void _handleDragEnd(DragEndDetails details) {
    if (!_isDraggingRegion) return;

    setState(() => _isDraggingRegion = false);

    if (_dragStart != null && _dragEnd != null) {
      final start = _dragStart! < _dragEnd! ? _dragStart! : _dragEnd!;
      final end = _dragStart! < _dragEnd! ? _dragEnd! : _dragStart!;

      // Minimum region size: 1% of duration
      if ((end - start) > 0.01) {
        final startTime = start * widget.duration;
        final endTime = end * widget.duration;
        widget.onRegionChanged?.call(startTime, endTime);
      } else {
        // Too small — treat as seek
        final time = start * widget.duration;
        widget.onSeek?.call(time);
        widget.onRegionCleared?.call();
      }
    }

    _dragStart = null;
    _dragEnd = null;
  }
}
