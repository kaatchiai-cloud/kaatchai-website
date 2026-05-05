import 'dart:math' as math;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/constants/app_constants.dart';

/// Zoom and scroll state for timelines
/// Ported from 02-zoom.js — viewport-aware coordinate conversion
class ZoomState {
  final double zoomLevel; // 1.0 - 10.0
  final double scrollOffset; // seconds from start (zoomOffset in web app)
  final double totalDuration; // total audio duration in seconds

  const ZoomState({
    this.zoomLevel = 1.0,
    this.scrollOffset = 0.0,
    this.totalDuration = 60.0,
  });

  /// Visible duration in seconds at current zoom
  double get visibleDuration => totalDuration / zoomLevel;

  /// Visible start time
  double get visibleStart => scrollOffset;

  /// Visible end time
  double get visibleEnd => scrollOffset + visibleDuration;

  /// Convert seconds to pixel position (zoom-aware)
  /// Ported from secToPx(s) in 02-zoom.js
  double secToPx(double seconds, double containerWidth) {
    final visDur = visibleDuration;
    if (visDur <= 0) return 0;
    return ((seconds - scrollOffset) / visDur) * containerWidth;
  }

  /// Convert duration to pixel width (zoom-aware)
  /// Ported from durToPx(d) in 02-zoom.js
  double durToPx(double duration, double containerWidth) {
    final visDur = visibleDuration;
    if (visDur <= 0) return 0;
    return (duration / visDur) * containerWidth;
  }

  /// Convert pixel position to seconds (zoom-aware)
  /// Ported from pxToSec(px) in 02-zoom.js
  double pxToSec(double px, double containerWidth) {
    final visDur = visibleDuration;
    if (containerWidth <= 0) return 0;
    return (px / containerWidth) * visDur + scrollOffset;
  }

  /// Convert pixel delta to time delta
  /// Ported from pxToDur(px) in 02-zoom.js
  double pxToDur(double px, double containerWidth) {
    final visDur = visibleDuration;
    if (containerWidth <= 0) return 0;
    return (px / containerWidth) * visDur;
  }

  /// Total timeline width in pixels (for scrollable content)
  double totalWidth(double containerWidth) {
    return containerWidth * zoomLevel;
  }

  /// Max scroll offset
  double get maxScrollOffset => math.max(0, totalDuration - visibleDuration);

  ZoomState copyWith({
    double? zoomLevel,
    double? scrollOffset,
    double? totalDuration,
  }) {
    return ZoomState(
      zoomLevel: zoomLevel ?? this.zoomLevel,
      scrollOffset: scrollOffset ?? this.scrollOffset,
      totalDuration: totalDuration ?? this.totalDuration,
    );
  }
}

class ZoomNotifier extends StateNotifier<ZoomState> {
  ZoomNotifier() : super(const ZoomState());

  void setTotalDuration(double duration) {
    state = state.copyWith(totalDuration: math.max(1, duration));
  }

  void setZoom(double level) {
    final clamped = level.clamp(AppConstants.minZoom, AppConstants.maxZoom);
    final maxOffset = math.max(0.0, state.totalDuration - state.totalDuration / clamped);
    state = state.copyWith(
      zoomLevel: clamped,
      scrollOffset: math.min(state.scrollOffset, maxOffset),
    );
  }

  void zoomIn() => setZoom(state.zoomLevel + 0.5);
  void zoomOut() => setZoom(state.zoomLevel - 0.5);

  void setScrollOffset(double offset) {
    state = state.copyWith(
      scrollOffset: offset.clamp(0.0, state.maxScrollOffset),
    );
  }

  /// Scroll by fraction of visible duration
  void scroll(double direction) {
    final step = state.visibleDuration * 0.25;
    setScrollOffset(state.scrollOffset + direction * step);
  }

  void reset() {
    state = ZoomState(totalDuration: state.totalDuration);
  }
}

final zoomProvider = StateNotifierProvider<ZoomNotifier, ZoomState>((ref) {
  return ZoomNotifier();
});
