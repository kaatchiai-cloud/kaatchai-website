import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/colors.dart';
import '../../../core/utils/time_format.dart';
import '../../../providers/create_provider.dart';

class ReviewStep extends ConsumerWidget {
  const ReviewStep({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final create = ref.watch(createProvider);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Review & Send to Editor',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
          const SizedBox(height: 4),
          const Text('Everything looks good? Send to the editor to fine-tune and export.',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
          const SizedBox(height: 20),

          // Summary cards
          _SummaryRow(icon: Icons.audio_file, label: 'Audio',
              value: create.audioFilePath != null ? fmtLong(create.audioDuration) : 'Text input'),
          _SummaryRow(icon: Icons.image_rounded, label: 'Scenes',
              value: '${create.scenes.length} images'),
          _SummaryRow(icon: Icons.palette_rounded, label: 'Style',
              value: create.stylePreset.isNotEmpty
                  ? create.stylePreset.replaceAll('-', ' ')
                  : 'Custom'),
          _SummaryRow(icon: Icons.aspect_ratio, label: 'Size',
              value: create.imageSize),
          if (create.selectedTemplate != null)
            _SummaryRow(icon: Icons.dashboard_rounded, label: 'Template',
                value: create.selectedTemplate!),
          if (create.generatedTracks.isNotEmpty)
            _SummaryRow(icon: Icons.language, label: 'Languages',
                value: '${create.generatedTracks.length} tracks'),

          const SizedBox(height: 20),

          // Scene preview grid
          if (create.scenes.isNotEmpty) ...[
            const Text('Scene Preview',
                style: TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            SizedBox(
              height: 80,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: create.scenes.length,
                separatorBuilder: (_, __) => const SizedBox(width: 6),
                itemBuilder: (_, i) {
                  return Container(
                    width: 120,
                    decoration: BoxDecoration(
                      color: AppColors.bgElevated,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Stack(
                      children: [
                        Center(
                          child: Icon(
                            create.scenes[i].status == 'done'
                                ? Icons.check_circle
                                : Icons.image_rounded,
                            size: 20,
                            color: create.scenes[i].status == 'done'
                                ? AppColors.green
                                : AppColors.textMuted,
                          ),
                        ),
                        Positioned(
                          bottom: 4,
                          left: 4,
                          right: 4,
                          child: Text(
                            create.scenes[i].text,
                            style: const TextStyle(color: AppColors.textMuted, fontSize: 8),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],

          const SizedBox(height: 24),

          // What happens next
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.bgElevated,
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('What happens next:',
                    style: TextStyle(color: AppColors.textPrimary, fontSize: 13, fontWeight: FontWeight.w600)),
                SizedBox(height: 8),
                _NextStep(num: '1', text: 'Photos placed on timeline matching audio segments'),
                _NextStep(num: '2', text: 'Subtitles auto-generated from transcript'),
                _NextStep(num: '3', text: 'Transitions and motions applied'),
                _NextStep(num: '4', text: 'Preview, adjust, and export your video'),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _SummaryRow({required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Icon(icon, size: 16, color: AppColors.accent),
          const SizedBox(width: 10),
          Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
          const Spacer(),
          Text(value, style: const TextStyle(color: AppColors.textPrimary, fontSize: 13, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}

class _NextStep extends StatelessWidget {
  final String num;
  final String text;

  const _NextStep({required this.num, required this.text});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 18,
            height: 18,
            decoration: BoxDecoration(
              color: AppColors.accentSoft,
              borderRadius: BorderRadius.circular(9),
            ),
            child: Center(
              child: Text(num, style: const TextStyle(color: AppColors.accent, fontSize: 10, fontWeight: FontWeight.w600)),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
          ),
        ],
      ),
    );
  }
}
