import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/utils/time_format.dart';
import '../../../../providers/audio_provider.dart';
import 'preview_canvas.dart';

/// Compact inline preview panel in the editor
/// Ported from the inline preview section in 10-preview.js
class InlinePreview extends ConsumerWidget {
  final Map<int, ui.Image> photoImages;
  final Map<int, ui.Image> pipFrames;
  final VoidCallback? onExpandToFullscreen;

  const InlinePreview({
    super.key,
    this.photoImages = const {},
    this.pipFrames = const {},
    this.onExpandToFullscreen,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final audio = ref.watch(audioProvider);

    return Container(
      decoration: BoxDecoration(
        color: AppColors.bgCard,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: [
          // Preview canvas
          PreviewCanvas(
            width: double.infinity,
            height: 180,
            photoImages: photoImages,
            pipFrames: pipFrames,
          ),

          // Controls bar
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            child: Row(
              children: [
                // Play/Pause
                GestureDetector(
                  onTap: () {
                    ref.read(audioProvider.notifier).setPlaying(!audio.isPlaying);
                  },
                  child: Icon(
                    audio.isPlaying
                        ? Icons.pause_rounded
                        : Icons.play_arrow_rounded,
                    color: AppColors.textPrimary,
                    size: 22,
                  ),
                ),
                const SizedBox(width: 8),

                // Scrub slider
                Expanded(
                  child: SliderTheme(
                    data: SliderThemeData(
                      trackHeight: 3,
                      thumbShape:
                          const RoundSliderThumbShape(enabledThumbRadius: 5),
                      overlayShape:
                          const RoundSliderOverlayShape(overlayRadius: 10),
                      activeTrackColor: AppColors.accent,
                      inactiveTrackColor: AppColors.bgElevated,
                      thumbColor: AppColors.accent,
                    ),
                    child: Slider(
                      value: audio.duration > 0
                          ? (audio.currentTime / audio.duration).clamp(0.0, 1.0)
                          : 0,
                      onChanged: (v) {
                        ref
                            .read(audioProvider.notifier)
                            .updateCurrentTime(v * audio.duration);
                      },
                    ),
                  ),
                ),
                const SizedBox(width: 8),

                // Time display
                Text(
                  '${fmtShort(audio.currentTime)} / ${fmtShort(audio.duration)}',
                  style: const TextStyle(
                    color: AppColors.textMuted,
                    fontSize: 10,
                    fontFeatures: [FontFeature.tabularFigures()],
                  ),
                ),
                const SizedBox(width: 6),

                // Expand button
                if (onExpandToFullscreen != null)
                  GestureDetector(
                    onTap: onExpandToFullscreen,
                    child: const Icon(
                      Icons.fullscreen_rounded,
                      color: AppColors.textSecondary,
                      size: 20,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
