import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/constants/transitions.dart';
import '../../../../models/pip_item.dart';
import '../../../../providers/timeline_provider.dart';
import 'position_grid.dart';

/// PiP properties panel — position, size, shape, border, shadow
/// Ported from PiP controls in 16-audio-controls.js
class PipPropsPanel extends ConsumerWidget {
  final PipItem pip;

  const PipPropsPanel({super.key, required this.pip});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Position grid
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _Label('Position'),
                const SizedBox(height: 4),
                PositionGrid(
                  selectedPosition: pip.position,
                  onChanged: (p) => _update(ref, (pip) => pip.position = p),
                ),
              ],
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Size slider
                  const _Label('Size'),
                  Row(
                    children: [
                      Expanded(
                        child: Slider(
                          value: pip.size,
                          min: 10,
                          max: 50,
                          divisions: 40,
                          onChanged: (v) => _update(ref, (pip) => pip.size = v),
                        ),
                      ),
                      SizedBox(
                        width: 32,
                        child: Text('${pip.size.round()}%',
                            style: const TextStyle(
                                color: AppColors.textSecondary, fontSize: 10,
                                fontFeatures: [FontFeature.tabularFigures()])),
                      ),
                    ],
                  ),

                  // Shape selector
                  const _Label('Shape'),
                  const SizedBox(height: 4),
                  Row(
                    children: PipShape.values.map((s) {
                      final isSelected = s.key == pip.shape;
                      return Expanded(
                        child: GestureDetector(
                          onTap: () => _update(ref, (pip) => pip.shape = s.key),
                          child: Container(
                            margin: EdgeInsets.only(
                                right: s != PipShape.values.last ? 4 : 0),
                            padding: const EdgeInsets.symmetric(vertical: 6),
                            decoration: BoxDecoration(
                              color: isSelected
                                  ? AppColors.accent
                                  : AppColors.bgElevated,
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(
                                color: isSelected
                                    ? AppColors.accent
                                    : AppColors.border,
                              ),
                            ),
                            child: Center(
                              child: Text(s.label,
                                  style: TextStyle(
                                    color: isSelected
                                        ? Colors.white
                                        : AppColors.textSecondary,
                                    fontSize: 10,
                                    fontWeight: isSelected
                                        ? FontWeight.w600
                                        : FontWeight.w400,
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
          ],
        ),
        const SizedBox(height: 10),

        // Border
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const _Label('Border Width'),
                  Slider(
                    value: pip.border,
                    min: 0,
                    max: 10,
                    divisions: 20,
                    onChanged: (v) => _update(ref, (pip) => pip.border = v),
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _Label('Border Color'),
                const SizedBox(height: 4),
                GestureDetector(
                  onTap: () {
                    // Cycle through preset colors
                    const colors = ['#ffffff', '#000000', '#8b5cf6', '#ef4444', '#22c55e'];
                    final idx = colors.indexOf(pip.borderColor);
                    final next = colors[(idx + 1) % colors.length];
                    _update(ref, (pip) => pip.borderColor = next);
                  },
                  child: Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      color: _parseColor(pip.borderColor),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: AppColors.border),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),

        // Shadow toggle
        Row(
          children: [
            const Text('Shadow',
                style: TextStyle(color: AppColors.textSecondary, fontSize: 11)),
            const Spacer(),
            Switch(
              value: pip.shadow,
              onChanged: (v) => _update(ref, (pip) => pip.shadow = v),
              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
          ],
        ),
        const SizedBox(height: 6),

        // In/Out points
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const _Label('In Point'),
                  TextFormField(
                    initialValue: pip.inPoint.toStringAsFixed(1),
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    style: const TextStyle(color: AppColors.textPrimary, fontSize: 12),
                    decoration: const InputDecoration(
                      suffixText: 's',
                      contentPadding: EdgeInsets.symmetric(horizontal: 8),
                      isDense: true,
                    ),
                    onFieldSubmitted: (v) {
                      final val = double.tryParse(v);
                      if (val != null) _update(ref, (pip) => pip.inPoint = val.clamp(0, pip.outPoint));
                    },
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const _Label('Out Point'),
                  TextFormField(
                    initialValue: pip.outPoint.toStringAsFixed(1),
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    style: const TextStyle(color: AppColors.textPrimary, fontSize: 12),
                    decoration: const InputDecoration(
                      suffixText: 's',
                      contentPadding: EdgeInsets.symmetric(horizontal: 8),
                      isDense: true,
                    ),
                    onFieldSubmitted: (v) {
                      final val = double.tryParse(v);
                      if (val != null) _update(ref, (pip) => pip.outPoint = val.clamp(pip.inPoint, 9999));
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),

        // Name field
        Row(
          children: [
            const _Label('Name'),
            const SizedBox(width: 8),
            Expanded(
              child: TextFormField(
                initialValue: pip.name,
                style: const TextStyle(color: AppColors.textPrimary, fontSize: 12),
                decoration: const InputDecoration(
                  contentPadding: EdgeInsets.symmetric(horizontal: 8),
                  isDense: true,
                ),
                onFieldSubmitted: (v) => _update(ref, (pip) => pip.name = v),
              ),
            ),
          ],
        ),
      ],
    );
  }

  void _update(WidgetRef ref, void Function(PipItem) mutator) {
    ref.read(timelineProvider.notifier).updatePip(pip.id, (p) {
      mutator(p);
      return p;
    });
  }

  Color _parseColor(String hex) {
    hex = hex.replaceFirst('#', '');
    if (hex.length == 6) hex = 'FF$hex';
    return Color(int.parse(hex, radix: 16));
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
