import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/constants/api_endpoints.dart';
import '../../../../providers/project_provider.dart';

/// Export settings dialog — quality, FPS, format selection
/// Ported from export settings in 11-export.js
class ExportDialog extends ConsumerStatefulWidget {
  final VoidCallback onExport;

  const ExportDialog({super.key, required this.onExport});

  @override
  ConsumerState<ExportDialog> createState() => _ExportDialogState();
}

class _ExportDialogState extends ConsumerState<ExportDialog> {
  String _quality = 'balanced';
  int _fps = 24;

  @override
  void initState() {
    super.initState();
    final project = ref.read(projectProvider);
    _quality = project.exportQuality;
    _fps = project.exportFps;
  }

  @override
  Widget build(BuildContext context) {
    final project = ref.watch(projectProvider);
    final width = project.width;
    final height = project.height;

    final qualityPreset = ExportQuality.all.firstWhere(
      (q) => q.key == _quality,
      orElse: () => ExportQuality.balanced,
    );
    final bitrate = (ExportQuality.baseBitrate(height) *
            qualityPreset.bitrateMultiplier / 1000000)
        .toStringAsFixed(1);

    return AlertDialog(
      title: const Text('Export Video'),
      content: SizedBox(
        width: 300,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Resolution display
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.bgElevated,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  const Icon(Icons.aspect_ratio, size: 16, color: AppColors.accent),
                  const SizedBox(width: 8),
                  Text('${width}x$height',
                      style: const TextStyle(
                          color: AppColors.textPrimary,
                          fontSize: 14,
                          fontWeight: FontWeight.w600)),
                  const Spacer(),
                  Text('$bitrate Mbps',
                      style: const TextStyle(color: AppColors.textMuted, fontSize: 11)),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Quality selector
            const Text('Quality',
                style: TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            Row(
              children: ExportQuality.all.map((q) {
                final isSelected = q.key == _quality;
                return Expanded(
                  child: GestureDetector(
                    onTap: () {
                      setState(() => _quality = q.key);
                      ref.read(projectProvider.notifier).setExportQuality(q.key);
                    },
                    child: Container(
                      margin: EdgeInsets.only(
                          right: q.key != ExportQuality.all.last.key ? 6 : 0),
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      decoration: BoxDecoration(
                        color: isSelected ? AppColors.accent : AppColors.bgCard,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: isSelected ? AppColors.accent : AppColors.border,
                        ),
                      ),
                      child: Column(
                        children: [
                          Text(q.label,
                              style: TextStyle(
                                color: isSelected ? Colors.white : AppColors.textPrimary,
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              )),
                          Text('${q.bitrateMultiplier}x',
                              style: TextStyle(
                                color: isSelected
                                    ? Colors.white70
                                    : AppColors.textMuted,
                                fontSize: 9,
                              )),
                        ],
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 14),

            // FPS selector
            const Text('Frame Rate',
                style: TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            Row(
              children: exportFpsOptions.map((f) {
                final isSelected = f == _fps;
                return Expanded(
                  child: GestureDetector(
                    onTap: () {
                      setState(() => _fps = f);
                      ref.read(projectProvider.notifier).setExportFps(f);
                    },
                    child: Container(
                      margin: EdgeInsets.only(
                          right: f != exportFpsOptions.last ? 6 : 0),
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      decoration: BoxDecoration(
                        color: isSelected ? AppColors.accent : AppColors.bgCard,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: isSelected ? AppColors.accent : AppColors.border,
                        ),
                      ),
                      child: Center(
                        child: Text('${f}fps',
                            style: TextStyle(
                              color: isSelected ? Colors.white : AppColors.textSecondary,
                              fontSize: 12,
                              fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
                            )),
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        ElevatedButton.icon(
          onPressed: () {
            Navigator.pop(context);
            widget.onExport();
          },
          icon: const Icon(Icons.file_download, size: 18),
          label: const Text('Export'),
        ),
      ],
    );
  }
}
