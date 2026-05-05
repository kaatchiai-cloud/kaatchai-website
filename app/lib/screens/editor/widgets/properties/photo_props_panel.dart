import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/constants/transitions.dart';
import '../../../../core/utils/time_format.dart';
import '../../../../models/photo_item.dart';
import '../../../../providers/timeline_provider.dart';

/// Photo properties panel — shown when a photo is selected
class PhotoPropsPanel extends ConsumerWidget {
  final PhotoItem photo;

  const PhotoPropsPanel({super.key, required this.photo});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
          Row(
            children: [
              const Icon(Icons.image, size: 16, color: AppColors.accent),
              const SizedBox(width: 6),
              const Text('Photo Properties',
                  style: TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 13,
                      fontWeight: FontWeight.w600)),
              const Spacer(),
              GestureDetector(
                onTap: () {
                  ref.read(timelineProvider.notifier).removePhoto(photo.id);
                },
                child: const Icon(Icons.delete_outline,
                    size: 16, color: AppColors.red),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Thumbnail
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: SizedBox(
              width: double.infinity,
              height: 80,
              child: photo.imagePath.startsWith('/')
                  ? Image.file(File(photo.imagePath),
                      fit: BoxFit.cover,
                      errorBuilder: (c, e, s) => _placeholder())
                  : _placeholder(),
            ),
          ),
          const SizedBox(height: 12),

          // Time fields
          Row(
            children: [
              Expanded(
                child: _NumberField(
                  label: 'Start',
                  value: photo.startTime,
                  suffix: 's',
                  onChanged: (v) => _update(ref, (p) => p.startTime = v),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _NumberField(
                  label: 'Duration',
                  value: photo.duration,
                  suffix: 's',
                  min: 0.1,
                  onChanged: (v) => _update(ref, (p) => p.duration = v),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _ReadOnlyField(
                  label: 'End',
                  value: '${fmtShort(photo.endTime)}s',
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),

          // Transition
          _DropdownField<String>(
            label: 'Transition',
            value: photo.transition,
            items: TransitionType.values
                .map((t) => DropdownMenuItem(value: t.key, child: Text(t.label)))
                .toList(),
            onChanged: (v) => _update(ref, (p) => p.transition = v ?? 'none'),
          ),
          const SizedBox(height: 8),

          // Transition duration
          _NumberField(
            label: 'Trans. Duration',
            value: photo.transDur,
            suffix: 's',
            min: 0.1,
            max: 5.0,
            step: 0.1,
            onChanged: (v) => _update(ref, (p) => p.transDur = v),
          ),
          const SizedBox(height: 8),

          // Motion
          _DropdownField<String>(
            label: 'Motion',
            value: photo.motion,
            items: MotionType.values
                .map((m) => DropdownMenuItem(value: m.key, child: Text(m.label)))
                .toList(),
            onChanged: (v) => _update(ref, (p) => p.motion = v ?? 'none'),
          ),

          // Video-specific fields
          if (photo.type == 'video') ...[
            const SizedBox(height: 10),
            const Divider(),
            const SizedBox(height: 6),
            const Text('Video',
                style: TextStyle(color: AppColors.cyan, fontSize: 11, fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            Row(
              children: [
                Expanded(
                  child: _NumberField(
                    label: 'In Point',
                    value: photo.inPoint ?? 0,
                    suffix: 's',
                    onChanged: (v) => _update(ref, (p) => p.inPoint = v),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _NumberField(
                    label: 'Out Point',
                    value: photo.outPoint ?? photo.videoDuration ?? 0,
                    suffix: 's',
                    onChanged: (v) => _update(ref, (p) => p.outPoint = v),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  void _update(WidgetRef ref, void Function(PhotoItem) mutator) {
    ref.read(timelineProvider.notifier).updatePhoto(photo.id, (p) {
      mutator(p);
      return p;
    });
  }

  Widget _placeholder() {
    return Container(
      color: AppColors.bgElevated,
      child: const Center(
        child: Icon(Icons.image, size: 32, color: AppColors.textMuted),
      ),
    );
  }
}

// ── Shared form widgets ──

class _NumberField extends StatelessWidget {
  final String label;
  final double value;
  final String suffix;
  final double min;
  final double max;
  final double step;
  final void Function(double) onChanged;

  const _NumberField({
    required this.label,
    required this.value,
    this.suffix = '',
    this.min = 0,
    this.max = 9999,
    this.step = 0.5,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: const TextStyle(color: AppColors.textMuted, fontSize: 10)),
        const SizedBox(height: 3),
        SizedBox(
          height: 32,
          child: TextFormField(
            initialValue: value.toStringAsFixed(1),
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            style: const TextStyle(color: AppColors.textPrimary, fontSize: 12),
            decoration: InputDecoration(
              suffixText: suffix,
              suffixStyle: const TextStyle(color: AppColors.textMuted, fontSize: 10),
              contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 0),
              isDense: true,
            ),
            onFieldSubmitted: (text) {
              final v = double.tryParse(text);
              if (v != null) onChanged(v.clamp(min, max));
            },
          ),
        ),
      ],
    );
  }
}

class _ReadOnlyField extends StatelessWidget {
  final String label;
  final String value;

  const _ReadOnlyField({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: const TextStyle(color: AppColors.textMuted, fontSize: 10)),
        const SizedBox(height: 3),
        Container(
          height: 32,
          alignment: Alignment.centerLeft,
          padding: const EdgeInsets.symmetric(horizontal: 8),
          decoration: BoxDecoration(
            color: AppColors.bgInput,
            borderRadius: BorderRadius.circular(6),
            border: Border.all(color: AppColors.border),
          ),
          child: Text(value,
              style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
        ),
      ],
    );
  }
}

class _DropdownField<T> extends StatelessWidget {
  final String label;
  final T value;
  final List<DropdownMenuItem<T>> items;
  final void Function(T?) onChanged;

  const _DropdownField({
    required this.label,
    required this.value,
    required this.items,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: const TextStyle(color: AppColors.textMuted, fontSize: 10)),
        const SizedBox(height: 3),
        SizedBox(
          height: 34,
          child: DropdownButtonFormField<T>(
            initialValue: value,
            items: items,
            onChanged: onChanged,
            style: const TextStyle(color: AppColors.textPrimary, fontSize: 12),
            dropdownColor: AppColors.bgElevated,
            decoration: const InputDecoration(
              contentPadding: EdgeInsets.symmetric(horizontal: 8, vertical: 0),
              isDense: true,
            ),
          ),
        ),
      ],
    );
  }
}
