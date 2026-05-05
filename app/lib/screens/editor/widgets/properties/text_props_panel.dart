import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/constants/transitions.dart';
import '../../../../core/utils/color_utils.dart';
import '../../../../models/text_item.dart';
import '../../../../providers/timeline_provider.dart';
import 'position_grid.dart';

/// Text overlay properties panel
class TextPropsPanel extends ConsumerWidget {
  final TextItem textItem;

  const TextPropsPanel({super.key, required this.textItem});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.bgCard,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Row(
              children: [
                const Icon(Icons.text_fields, size: 16, color: AppColors.accent),
                const SizedBox(width: 6),
                const Text('Text Properties',
                    style: TextStyle(
                        color: AppColors.textPrimary,
                        fontSize: 13,
                        fontWeight: FontWeight.w600)),
                const Spacer(),
                GestureDetector(
                  onTap: () => ref.read(timelineProvider.notifier).removeText(textItem.id),
                  child: const Icon(Icons.delete_outline, size: 16, color: AppColors.red),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Text input
            const _Label('Text'),
            TextFormField(
              initialValue: textItem.text,
              maxLines: 3,
              style: const TextStyle(color: AppColors.textPrimary, fontSize: 13),
              onChanged: (v) => _update(ref, (t) => t.text = v),
            ),
            const SizedBox(height: 10),

            // Font & Size
            Row(
              children: [
                Expanded(
                  flex: 2,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const _Label('Font'),
                      DropdownButtonFormField<String>(
                        initialValue: textItem.font,
                        items: _fonts.map((f) =>
                          DropdownMenuItem(value: f, child: Text(f, style: const TextStyle(fontSize: 12)))).toList(),
                        onChanged: (v) => _update(ref, (t) => t.font = v ?? 'Poppins'),
                        style: const TextStyle(color: AppColors.textPrimary, fontSize: 12),
                        dropdownColor: AppColors.bgElevated,
                        isExpanded: true,
                        decoration: const InputDecoration(
                          contentPadding: EdgeInsets.symmetric(horizontal: 8),
                          isDense: true,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const _Label('Size'),
                      TextFormField(
                        initialValue: textItem.fontSize.round().toString(),
                        keyboardType: TextInputType.number,
                        style: const TextStyle(color: AppColors.textPrimary, fontSize: 12),
                        decoration: const InputDecoration(
                          contentPadding: EdgeInsets.symmetric(horizontal: 8),
                          isDense: true,
                        ),
                        onFieldSubmitted: (v) {
                          final size = double.tryParse(v);
                          if (size != null) _update(ref, (t) => t.fontSize = size.clamp(12, 96));
                        },
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),

            // Colors row
            Row(
              children: [
                _ColorField(
                  label: 'Color',
                  color: hexToColor(textItem.color),
                  onChanged: (c) => _update(ref, (t) => t.color = colorToHex(c)),
                ),
                const SizedBox(width: 8),
                _ColorField(
                  label: 'Stroke',
                  color: hexToColor(textItem.strokeColor),
                  onChanged: (c) => _update(ref, (t) => t.strokeColor = colorToHex(c)),
                ),
                const SizedBox(width: 8),
                _ColorField(
                  label: 'BG',
                  color: hexToColor(textItem.bgColor),
                  onChanged: (c) => _update(ref, (t) => t.bgColor = colorToHex(c)),
                ),
              ],
            ),
            const SizedBox(height: 10),

            // Stroke width + BG alpha + Bold
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const _Label('Stroke W.'),
                      Slider(
                        value: textItem.strokeWidth,
                        min: 0, max: 10, divisions: 20,
                        onChanged: (v) => _update(ref, (t) => t.strokeWidth = v),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const _Label('BG Alpha'),
                      Slider(
                        value: textItem.bgAlpha,
                        min: 0, max: 1, divisions: 20,
                        onChanged: (v) => _update(ref, (t) => t.bgAlpha = v),
                      ),
                    ],
                  ),
                ),
                Column(
                  children: [
                    const _Label('Bold'),
                    Switch(
                      value: textItem.bold,
                      onChanged: (v) => _update(ref, (t) => t.bold = v),
                      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 10),

            // Position grid
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const _Label('Position'),
                      const SizedBox(height: 4),
                      PositionGrid(
                        selectedPosition: textItem.position,
                        onChanged: (p) => _update(ref, (t) => t.position = p),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Time fields
                      const _Label('Start'),
                      TextFormField(
                        initialValue: textItem.startTime.toStringAsFixed(1),
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        style: const TextStyle(color: AppColors.textPrimary, fontSize: 12),
                        decoration: const InputDecoration(
                          suffixText: 's', isDense: true,
                          contentPadding: EdgeInsets.symmetric(horizontal: 8),
                        ),
                        onFieldSubmitted: (v) {
                          final val = double.tryParse(v);
                          if (val != null) _update(ref, (t) => t.startTime = val.clamp(0, 9999));
                        },
                      ),
                      const SizedBox(height: 6),
                      const _Label('Duration'),
                      TextFormField(
                        initialValue: textItem.duration.toStringAsFixed(1),
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        style: const TextStyle(color: AppColors.textPrimary, fontSize: 12),
                        decoration: const InputDecoration(
                          suffixText: 's', isDense: true,
                          contentPadding: EdgeInsets.symmetric(horizontal: 8),
                        ),
                        onFieldSubmitted: (v) {
                          final val = double.tryParse(v);
                          if (val != null) _update(ref, (t) => t.duration = val.clamp(0.1, 9999));
                        },
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),

            // Animation
            Row(
              children: [
                Expanded(
                  flex: 2,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const _Label('Animation'),
                      DropdownButtonFormField<String>(
                        initialValue: textItem.animation,
                        items: TextAnimation.values
                            .map((a) => DropdownMenuItem(value: a.key, child: Text(a.label)))
                            .toList(),
                        onChanged: (v) => _update(ref, (t) => t.animation = v ?? 'none'),
                        style: const TextStyle(color: AppColors.textPrimary, fontSize: 12),
                        dropdownColor: AppColors.bgElevated,
                        decoration: const InputDecoration(
                          contentPadding: EdgeInsets.symmetric(horizontal: 8),
                          isDense: true,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const _Label('Anim Dur.'),
                      TextFormField(
                        initialValue: textItem.animDur.toStringAsFixed(1),
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        style: const TextStyle(color: AppColors.textPrimary, fontSize: 12),
                        decoration: const InputDecoration(
                          suffixText: 's', isDense: true,
                          contentPadding: EdgeInsets.symmetric(horizontal: 8),
                        ),
                        onFieldSubmitted: (v) {
                          final val = double.tryParse(v);
                          if (val != null) _update(ref, (t) => t.animDur = val.clamp(0.1, 5));
                        },
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _update(WidgetRef ref, void Function(TextItem) mutator) {
    ref.read(timelineProvider.notifier).updateText(textItem.id, (t) {
      mutator(t);
      return t;
    });
  }

  static const _fonts = [
    'Poppins', 'Roboto', 'Playfair Display', 'Noto Sans',
    'Noto Sans Tamil', 'Noto Sans Devanagari', 'Courier Prime',
    'Dancing Script', 'Pacifico', 'Oswald',
  ];
}

class _Label extends StatelessWidget {
  final String text;
  const _Label(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 3),
      child: Text(text,
          style: const TextStyle(color: AppColors.textMuted, fontSize: 10)),
    );
  }
}

class _ColorField extends StatelessWidget {
  final String label;
  final Color color;
  final void Function(Color) onChanged;

  const _ColorField({
    required this.label,
    required this.color,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _Label(label),
        GestureDetector(
          onTap: () {
            // Simple color picker — cycle through preset colors for now
            // Full color picker will use flutter_colorpicker package
          },
          child: Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: AppColors.border),
            ),
          ),
        ),
      ],
    );
  }
}
