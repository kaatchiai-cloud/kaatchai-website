import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart' show Share, XFile;
import '../../../../core/theme/colors.dart';
import '../../../../providers/export_provider.dart';

/// Export progress overlay — shown during export
class ExportProgress extends ConsumerWidget {
  final VoidCallback? onCancel;

  const ExportProgress({super.key, this.onCancel});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final export = ref.watch(exportProvider);

    if (!export.isExporting && export.outputPath == null && export.error == null) {
      return const SizedBox.shrink();
    }

    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.bgCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: export.error != null
              ? AppColors.red
              : export.outputPath != null
                  ? AppColors.green
                  : AppColors.accent,
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Header
          Row(
            children: [
              Icon(
                export.error != null
                    ? Icons.error_outline
                    : export.outputPath != null
                        ? Icons.check_circle
                        : Icons.file_download_rounded,
                color: export.error != null
                    ? AppColors.red
                    : export.outputPath != null
                        ? AppColors.green
                        : AppColors.accent,
                size: 20,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  export.error != null
                      ? 'Export Failed'
                      : export.outputPath != null
                          ? 'Export Complete!'
                          : 'Exporting...',
                  style: TextStyle(
                    color: export.error != null
                        ? AppColors.red
                        : AppColors.textPrimary,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              if (!export.isExporting)
                GestureDetector(
                  onTap: () => ref.read(exportProvider.notifier).reset(),
                  child: const Icon(Icons.close, size: 18, color: AppColors.textMuted),
                ),
            ],
          ),

          // Progress bar (while exporting)
          if (export.isExporting) ...[
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: export.progress,
                backgroundColor: AppColors.bgElevated,
                valueColor: const AlwaysStoppedAnimation(AppColors.accent),
                minHeight: 6,
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Text(
                  export.status,
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 11),
                ),
                const Spacer(),
                Text(
                  '${(export.progress * 100).round()}%',
                  style: const TextStyle(
                    color: AppColors.accent,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    fontFeatures: [FontFeature.tabularFigures()],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            TextButton.icon(
              onPressed: onCancel,
              icon: const Icon(Icons.cancel_outlined, size: 16, color: AppColors.red),
              label: const Text('Cancel', style: TextStyle(color: AppColors.red, fontSize: 12)),
            ),
          ],

          // Error message
          if (export.error != null) ...[
            const SizedBox(height: 8),
            Text(
              export.error!,
              style: const TextStyle(color: AppColors.red, fontSize: 11),
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
          ],

          // Success actions
          if (export.outputPath != null) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: () {
                      Share.shareXFiles([XFile(export.outputPath!)]);
                    },
                    icon: const Icon(Icons.share, size: 16),
                    label: const Text('Share', style: TextStyle(fontSize: 13)),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () {
                      // Save to gallery — platform specific
                    },
                    icon: const Icon(Icons.save_alt, size: 16),
                    label: const Text('Save', style: TextStyle(fontSize: 13)),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
