import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:file_picker/file_picker.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/utils/time_format.dart';
import '../../../../models/pip_item.dart';
import '../../../../providers/timeline_provider.dart';
import '../../../../providers/selection_provider.dart';
import '../properties/pip_props_panel.dart';

/// PiP speaker video section — import, list, properties
/// Ported from PiP controls in 16-audio-controls.js
class PipSection extends ConsumerWidget {
  const PipSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final timeline = ref.watch(timelineProvider);
    final selection = ref.watch(selectionProvider);
    final selectedPip = selection.selectedPipId != null
        ? timeline.pipItems.cast<PipItem?>().firstWhere(
            (p) => p?.id == selection.selectedPipId,
            orElse: () => null)
        : null;

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
              const Icon(Icons.picture_in_picture_rounded, size: 16, color: AppColors.cyan),
              const SizedBox(width: 6),
              const Text('Picture-in-Picture',
                  style: TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 13,
                      fontWeight: FontWeight.w600)),
              const Spacer(),
              GestureDetector(
                onTap: () => _importPipVideo(ref),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.cyanSoft,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.add, size: 12, color: AppColors.cyan),
                      SizedBox(width: 3),
                      Text('Add Speaker', style: TextStyle(color: AppColors.cyan, fontSize: 11)),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),

          // PiP item tags
          if (timeline.pipItems.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Text(
                'Add speaker videos for picture-in-picture overlay.',
                style: TextStyle(color: AppColors.textMuted, fontSize: 11),
              ),
            )
          else
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: timeline.pipItems.map((pip) {
                final isSelected = pip.id == selection.selectedPipId;
                return GestureDetector(
                  onTap: () {
                    if (isSelected) {
                      ref.read(selectionProvider.notifier).clearPipSelection();
                    } else {
                      ref.read(selectionProvider.notifier).selectPip(pip.id);
                    }
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: isSelected ? AppColors.cyanSoft : AppColors.bgElevated,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: isSelected ? AppColors.cyan : AppColors.border,
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.videocam, size: 12,
                            color: isSelected ? AppColors.cyan : AppColors.textMuted),
                        const SizedBox(width: 4),
                        Text(
                          pip.name,
                          style: TextStyle(
                            color: isSelected ? AppColors.cyan : AppColors.textSecondary,
                            fontSize: 11,
                            fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
                          ),
                        ),
                        const SizedBox(width: 4),
                        Text(
                          fmtShort(pip.outPoint - pip.inPoint),
                          style: const TextStyle(color: AppColors.textMuted, fontSize: 9,
                              fontFeatures: [FontFeature.tabularFigures()]),
                        ),
                        const SizedBox(width: 4),
                        GestureDetector(
                          onTap: () {
                            ref.read(timelineProvider.notifier).removePip(pip.id);
                            if (isSelected) {
                              ref.read(selectionProvider.notifier).clearPipSelection();
                            }
                          },
                          child: const Icon(Icons.close, size: 12, color: AppColors.textMuted),
                        ),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),

          // Selected PiP properties
          if (selectedPip != null) ...[
            const SizedBox(height: 12),
            const Divider(height: 1),
            const SizedBox(height: 12),
            PipPropsPanel(pip: selectedPip),
          ],
        ],
      ),
    );
  }

  Future<void> _importPipVideo(WidgetRef ref) async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.video,
      allowMultiple: false,
    );
    if (result != null && result.files.isNotEmpty) {
      final path = result.files.first.path;
      if (path != null) {
        final timeline = ref.read(timelineProvider);
        ref.read(timelineProvider.notifier).addPip(PipItem(
          id: timeline.nextPipId,
          videoPath: path,
          videoDuration: 60, // TODO: get actual duration via video_player
          inPoint: 0,
          outPoint: 60,
          name: 'Speaker ${timeline.nextPipId}',
        ));
      }
    }
  }
}
