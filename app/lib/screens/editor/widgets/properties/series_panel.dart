import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/colors.dart';
import '../../../../providers/project_provider.dart';

/// Series management — series name, episode number
/// Ported from series inputs in the editor header
class SeriesPanel extends ConsumerWidget {
  const SeriesPanel({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final project = ref.watch(projectProvider);

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
          const Row(
            children: [
              Icon(Icons.folder_rounded, size: 16, color: AppColors.textSecondary),
              SizedBox(width: 6),
              Text('Series',
                  style: TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 13,
                      fontWeight: FontWeight.w600)),
            ],
          ),
          const SizedBox(height: 10),

          // Series name
          const _Label('Series Name'),
          const SizedBox(height: 4),
          TextFormField(
            initialValue: project.seriesName,
            style: const TextStyle(color: AppColors.textPrimary, fontSize: 13),
            decoration: const InputDecoration(
              hintText: 'e.g., My Podcast',
              contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              isDense: true,
            ),
            onChanged: (v) => ref.read(projectProvider.notifier).setSeries(
                  v,
                  project.episodeNumber,
                ),
          ),
          const SizedBox(height: 10),

          // Episode number
          Row(
            children: [
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _Label('Episode Number'),
                  ],
                ),
              ),
              SizedBox(
                width: 80,
                child: TextFormField(
                  initialValue: project.episodeNumber > 0
                      ? project.episodeNumber.toString()
                      : '',
                  keyboardType: TextInputType.number,
                  style: const TextStyle(color: AppColors.textPrimary, fontSize: 13),
                  decoration: const InputDecoration(
                    hintText: '#',
                    contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    isDense: true,
                  ),
                  onChanged: (v) {
                    final num = int.tryParse(v) ?? 0;
                    ref.read(projectProvider.notifier).setSeries(
                          project.seriesName,
                          num,
                        );
                  },
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Label extends StatelessWidget {
  final String text;
  const _Label(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(text,
        style: const TextStyle(color: AppColors.textMuted, fontSize: 10));
  }
}
