import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:file_picker/file_picker.dart';
import '../../../../core/theme/colors.dart';
import '../../../../providers/audio_provider.dart';

/// Background music section — import, volume, loop, remove
/// Ported from BGM controls in 16-audio-controls.js
class BgmSection extends ConsumerWidget {
  const BgmSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final audio = ref.watch(audioProvider);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.bgCard,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            children: [
              const Icon(Icons.music_note_rounded, size: 16, color: AppColors.amber),
              const SizedBox(width: 6),
              const Text('Background Music',
                  style: TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 13,
                      fontWeight: FontWeight.w600)),
              const Spacer(),
              if (!audio.hasBgm)
                GestureDetector(
                  onTap: () => _importBgm(ref),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppColors.accentSoft,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.add, size: 12, color: AppColors.accent),
                        SizedBox(width: 3),
                        Text('Import', style: TextStyle(color: AppColors.accent, fontSize: 11)),
                      ],
                    ),
                  ),
                ),
            ],
          ),

          if (audio.hasBgm) ...[
            const SizedBox(height: 12),

            // File name + remove
            Row(
              children: [
                const Icon(Icons.audio_file, size: 14, color: AppColors.textMuted),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    audio.bgmFilePath?.split('/').last ?? 'Background Music',
                    style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                GestureDetector(
                  onTap: () => ref.read(audioProvider.notifier).removeBgm(),
                  child: const Icon(Icons.close, size: 16, color: AppColors.red),
                ),
              ],
            ),
            const SizedBox(height: 10),

            // Volume slider
            Row(
              children: [
                const Icon(Icons.volume_down, size: 16, color: AppColors.textMuted),
                Expanded(
                  child: Slider(
                    value: audio.bgmVolume,
                    min: 0,
                    max: 1,
                    divisions: 20,
                    onChanged: (v) => ref.read(audioProvider.notifier).setBgmVolume(v),
                  ),
                ),
                SizedBox(
                  width: 36,
                  child: Text(
                    '${(audio.bgmVolume * 100).round()}%',
                    style: const TextStyle(
                      color: AppColors.textSecondary,
                      fontSize: 10,
                      fontFeatures: [FontFeature.tabularFigures()],
                    ),
                  ),
                ),
              ],
            ),

            // Loop toggle
            Row(
              children: [
                const SizedBox(width: 4),
                const Text('Loop', style: TextStyle(color: AppColors.textSecondary, fontSize: 11)),
                const Spacer(),
                Switch(
                  value: audio.bgmLoop,
                  onChanged: (v) => ref.read(audioProvider.notifier).setBgmLoop(v),
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
              ],
            ),
          ] else ...[
            const SizedBox(height: 8),
            const Text(
              'Add background music to play alongside your main audio.',
              style: TextStyle(color: AppColors.textMuted, fontSize: 11),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _importBgm(WidgetRef ref) async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.audio,
      allowMultiple: false,
    );
    if (result != null && result.files.isNotEmpty) {
      final path = result.files.first.path;
      if (path != null) {
        ref.read(audioProvider.notifier).setBgm(path);
      }
    }
  }
}
