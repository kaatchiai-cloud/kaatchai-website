import 'package:flutter/material.dart';
import '../../../../core/theme/colors.dart';

/// 3x3 position grid for text overlay placement
/// Ported from the 9-point grid in 06-text-timeline.js
class PositionGrid extends StatelessWidget {
  final String selectedPosition;
  final void Function(String position) onChanged;

  const PositionGrid({
    super.key,
    required this.selectedPosition,
    required this.onChanged,
  });

  static const _positions = [
    ['top-left', 'top-center', 'top-right'],
    ['mid-left', 'center', 'mid-right'],
    ['bot-left', 'bot-center', 'bot-right'],
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.bgElevated,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: AppColors.border),
      ),
      padding: const EdgeInsets.all(3),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (int row = 0; row < 3; row++)
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (int col = 0; col < 3; col++)
                  _PositionDot(
                    position: _positions[row][col],
                    isSelected: selectedPosition == _positions[row][col],
                    onTap: () => onChanged(_positions[row][col]),
                  ),
              ],
            ),
        ],
      ),
    );
  }
}

class _PositionDot extends StatelessWidget {
  final String position;
  final bool isSelected;
  final VoidCallback onTap;

  const _PositionDot({
    required this.position,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 24,
        height: 24,
        margin: const EdgeInsets.all(2),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.accent : Colors.transparent,
          borderRadius: BorderRadius.circular(4),
        ),
        child: Center(
          child: Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: isSelected ? Colors.white : AppColors.textMuted,
              shape: BoxShape.circle,
            ),
          ),
        ),
      ),
    );
  }
}
