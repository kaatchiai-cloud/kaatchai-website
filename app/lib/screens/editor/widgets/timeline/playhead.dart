import 'package:flutter/material.dart';
import '../../../../core/theme/colors.dart';

/// Playhead line synced to audio current time
/// Ported from playhead-line in 08-playhead.js
class PlayheadLine extends StatelessWidget {
  final double leftPx; // pixel position from left edge

  const PlayheadLine({super.key, required this.leftPx});

  @override
  Widget build(BuildContext context) {
    return Positioned(
      left: leftPx,
      top: 0,
      bottom: 0,
      child: IgnorePointer(
        child: Container(
          width: 2,
          color: AppColors.playhead,
        ),
      ),
    );
  }
}
