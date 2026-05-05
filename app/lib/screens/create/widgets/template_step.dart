import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/colors.dart';
import '../../../core/constants/style_presets.dart';
import '../../../providers/create_provider.dart';
import '../../landing/widgets/template_grid.dart';

class TemplateStep extends ConsumerWidget {
  const TemplateStep({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final create = ref.watch(createProvider);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Output size
          const Text('Output Size',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            children: [
              _SizeChip('1280x720', '16:9', create.imageSize == '1280x720', ref),
              _SizeChip('1080x1920', '9:16', create.imageSize == '1080x1920', ref),
              _SizeChip('1080x1080', '1:1', create.imageSize == '1080x1080', ref),
              _SizeChip('1200x628', 'FB', create.imageSize == '1200x628', ref),
            ],
          ),
          const SizedBox(height: 16),

          // Style preset
          const Text('Visual Style',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          DropdownButtonFormField<String>(
            initialValue: create.stylePreset.isEmpty ? null : create.stylePreset,
            items: [
              const DropdownMenuItem(value: '', child: Text('Custom')),
              ...stylePresets.keys.map((k) => DropdownMenuItem(
                  value: k,
                  child: Text(k.replaceAll('-', ' ').replaceFirst(k[0], k[0].toUpperCase())))),
            ],
            onChanged: (v) {
              final preset = v ?? '';
              final prompt = stylePresets[preset] ?? '';
              ref.read(createProvider.notifier).setStyle(prompt, preset);
            },
            style: const TextStyle(color: AppColors.textPrimary, fontSize: 13),
            dropdownColor: AppColors.bgElevated,
            decoration: const InputDecoration(
              contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            ),
          ),
          const SizedBox(height: 8),

          // Custom style prompt
          if (create.stylePreset.isEmpty || create.stylePreset == '')
            TextField(
              maxLines: 2,
              style: const TextStyle(color: AppColors.textPrimary, fontSize: 13),
              decoration: const InputDecoration(
                hintText: 'Describe your visual style...',
              ),
              onChanged: (v) => ref.read(createProvider.notifier).setStyle(v, ''),
            ),

          if (create.stylePrompt.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              create.stylePrompt,
              style: const TextStyle(color: AppColors.textMuted, fontSize: 11, fontStyle: FontStyle.italic),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
          const SizedBox(height: 20),

          // Template grid
          TemplateGrid(
            onSelect: (tpl) {
              ref.read(createProvider.notifier).setTemplate(tpl.id);
              if (tpl.size.isNotEmpty) {
                ref.read(createProvider.notifier).setImageSize(tpl.size);
              }
              if (tpl.style != null && stylePresets.containsKey(tpl.style)) {
                ref.read(createProvider.notifier)
                    .setStyle(stylePresets[tpl.style]!, tpl.style!);
              }
            },
          ),
        ],
      ),
    );
  }

  Widget _SizeChip(String size, String label, bool selected, WidgetRef ref) {
    return GestureDetector(
      onTap: () => ref.read(createProvider.notifier).setImageSize(size),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: selected ? AppColors.accent : AppColors.bgElevated,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: selected ? AppColors.accent : AppColors.border),
        ),
        child: Text(
          '$label ($size)',
          style: TextStyle(
            color: selected ? Colors.white : AppColors.textSecondary,
            fontSize: 11,
            fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
          ),
        ),
      ),
    );
  }
}
