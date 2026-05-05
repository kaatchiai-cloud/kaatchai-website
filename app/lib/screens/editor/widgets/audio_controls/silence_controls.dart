import 'package:flutter/material.dart';
import '../../../../core/theme/colors.dart';
import '../../../../services/audio/silence_detector.dart';

/// Silence detection controls panel
/// Ported from the silence detection UI in 14-silence.js
class SilenceControls extends StatefulWidget {
  final List<SilentRegion> detectedRegions;
  final void Function(double thresholdDb, double minDuration, SilenceDetectionMode mode)?
      onDetect;
  final void Function()? onApply;
  final void Function()? onClear;

  const SilenceControls({
    super.key,
    this.detectedRegions = const [],
    this.onDetect,
    this.onApply,
    this.onClear,
  });

  @override
  State<SilenceControls> createState() => _SilenceControlsState();
}

class _SilenceControlsState extends State<SilenceControls> {
  double _thresholdDb = -35;
  double _minDuration = 0.5;
  SilenceDetectionMode _mode = SilenceDetectionMode.peak;

  @override
  Widget build(BuildContext context) {
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
          const Row(
            children: [
              Icon(Icons.volume_off_rounded, size: 16, color: AppColors.accent),
              SizedBox(width: 6),
              Text(
                'Silence Detection',
                style: TextStyle(
                  color: AppColors.textPrimary,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Mode selector
          Row(
            children: [
              const Text('Mode:',
                  style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
              const SizedBox(width: 8),
              _ModeChip(
                label: 'Peak',
                selected: _mode == SilenceDetectionMode.peak,
                onTap: () =>
                    setState(() => _mode = SilenceDetectionMode.peak),
              ),
              const SizedBox(width: 6),
              _ModeChip(
                label: 'RMS',
                selected: _mode == SilenceDetectionMode.rms,
                onTap: () =>
                    setState(() => _mode = SilenceDetectionMode.rms),
              ),
            ],
          ),
          const SizedBox(height: 10),

          // Threshold slider
          Row(
            children: [
              const SizedBox(
                width: 70,
                child: Text('Threshold',
                    style: TextStyle(color: AppColors.textSecondary, fontSize: 11)),
              ),
              Expanded(
                child: Slider(
                  value: _thresholdDb,
                  min: -60,
                  max: -10,
                  divisions: 50,
                  onChanged: (v) => setState(() => _thresholdDb = v),
                ),
              ),
              SizedBox(
                width: 44,
                child: Text(
                  '${_thresholdDb.round()} dB',
                  style: const TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 11,
                    fontFeatures: [FontFeature.tabularFigures()],
                  ),
                ),
              ),
            ],
          ),

          // Min duration slider
          Row(
            children: [
              const SizedBox(
                width: 70,
                child: Text('Min dur.',
                    style: TextStyle(color: AppColors.textSecondary, fontSize: 11)),
              ),
              Expanded(
                child: Slider(
                  value: _minDuration,
                  min: 0.1,
                  max: 3.0,
                  divisions: 29,
                  onChanged: (v) => setState(() => _minDuration = v),
                ),
              ),
              SizedBox(
                width: 44,
                child: Text(
                  '${_minDuration.toStringAsFixed(1)}s',
                  style: const TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 11,
                    fontFeatures: [FontFeature.tabularFigures()],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),

          // Action buttons
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () =>
                      widget.onDetect?.call(_thresholdDb, _minDuration, _mode),
                  icon: const Icon(Icons.search, size: 16),
                  label: const Text('Detect', style: TextStyle(fontSize: 12)),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: widget.detectedRegions.isNotEmpty
                      ? widget.onApply
                      : null,
                  icon: const Icon(Icons.content_cut, size: 16),
                  label: const Text('Remove', style: TextStyle(fontSize: 12)),
                ),
              ),
              if (widget.detectedRegions.isNotEmpty) ...[
                const SizedBox(width: 8),
                IconButton(
                  onPressed: widget.onClear,
                  icon: const Icon(Icons.close, size: 18),
                  color: AppColors.textMuted,
                  padding: EdgeInsets.zero,
                  constraints:
                      const BoxConstraints(minWidth: 32, minHeight: 32),
                  tooltip: 'Clear',
                ),
              ],
            ],
          ),

          // Results
          if (widget.detectedRegions.isNotEmpty) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.amberSoft,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Row(
                children: [
                  const Icon(Icons.info_outline,
                      size: 14, color: AppColors.amber),
                  const SizedBox(width: 6),
                  Text(
                    '${widget.detectedRegions.length} silent region${widget.detectedRegions.length == 1 ? '' : 's'} found '
                    '(${_totalDuration(widget.detectedRegions)})',
                    style: const TextStyle(
                        color: AppColors.amber, fontSize: 11),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _totalDuration(List<SilentRegion> regions) {
    final total = regions.fold(0.0, (sum, r) => sum + r.duration);
    return '${total.toStringAsFixed(1)}s total';
  }
}

class _ModeChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _ModeChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: selected ? AppColors.accent : AppColors.bgElevated,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? AppColors.accent : AppColors.border,
          ),
        ),
        child: Text(
          label,
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
