import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/utils/time_format.dart';
import '../../../../providers/audio_provider.dart';
import 'preview_canvas.dart';

/// Fullscreen preview overlay
/// Ported from the fullscreen preview in 10-preview.js
class FullscreenPreview extends ConsumerWidget {
  final Map<int, ui.Image> photoImages;
  final Map<int, ui.Image> pipFrames;

  const FullscreenPreview({
    super.key,
    this.photoImages = const {},
    this.pipFrames = const {},
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final audio = ref.watch(audioProvider);
    final screenSize = MediaQuery.of(context).size;

    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Column(
          children: [
            // Close button
            Align(
              alignment: Alignment.topRight,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: GestureDetector(
                  onTap: () => Navigator.pop(context),
                  child: Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: Colors.white.withAlpha(26),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.close, color: Colors.white, size: 20),
                  ),
                ),
              ),
            ),

            // Canvas
            Expanded(
              child: Center(
                child: PreviewCanvas(
                  width: screenSize.width,
                  height: screenSize.width * 9 / 16, // 16:9 aspect
                  photoImages: photoImages,
                  pipFrames: pipFrames,
                ),
              ),
            ),

            // Controls
            Container(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  // Scrub bar
                  SliderTheme(
                    data: SliderThemeData(
                      trackHeight: 4,
                      thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 7),
                      activeTrackColor: AppColors.accent,
                      inactiveTrackColor: Colors.white24,
                      thumbColor: AppColors.accent,
                    ),
                    child: Slider(
                      value: audio.duration > 0
                          ? (audio.currentTime / audio.duration).clamp(0.0, 1.0)
                          : 0,
                      onChanged: (v) {
                        ref.read(audioProvider.notifier)
                            .updateCurrentTime(v * audio.duration);
                      },
                    ),
                  ),

                  // Time + controls
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        fmtShort(audio.currentTime),
                        style: const TextStyle(
                          color: Colors.white70,
                          fontSize: 13,
                          fontFeatures: [FontFeature.tabularFigures()],
                        ),
                      ),
                      const SizedBox(width: 20),

                      // Play/Pause button
                      GestureDetector(
                        onTap: () {
                          ref.read(audioProvider.notifier)
                              .setPlaying(!audio.isPlaying);
                        },
                        child: Container(
                          width: 56,
                          height: 56,
                          decoration: const BoxDecoration(
                            color: AppColors.accent,
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            audio.isPlaying
                                ? Icons.pause_rounded
                                : Icons.play_arrow_rounded,
                            color: Colors.white,
                            size: 32,
                          ),
                        ),
                      ),

                      const SizedBox(width: 20),
                      Text(
                        fmtShort(audio.duration),
                        style: const TextStyle(
                          color: Colors.white70,
                          fontSize: 13,
                          fontFeatures: [FontFeature.tabularFigures()],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
