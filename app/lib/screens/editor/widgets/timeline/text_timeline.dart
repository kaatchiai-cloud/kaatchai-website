import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/utils/time_format.dart';
import '../../../../core/utils/color_utils.dart';
import '../../../../models/text_item.dart';
import '../../../../providers/timeline_provider.dart';
import '../../../../providers/zoom_provider.dart';
import '../../../../providers/selection_provider.dart';
import 'timeline_block.dart';

/// Text overlay timeline row
class TextTimeline extends ConsumerWidget {
  const TextTimeline({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final timeline = ref.watch(timelineProvider);
    final zoom = ref.watch(zoomProvider);
    final selection = ref.watch(selectionProvider);

    return LayoutBuilder(
      builder: (context, constraints) {
        final containerWidth = constraints.maxWidth;
        final totalWidth = zoom.totalWidth(containerWidth);

        return SizedBox(
          height: 44,
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: SizedBox(
              width: totalWidth,
              height: 44,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  if (timeline.texts.isEmpty)
                    const Center(
                      child: Text(
                        'Tap + to add text',
                        style: TextStyle(color: AppColors.textMuted, fontSize: 11),
                      ),
                    ),
                  for (final text in timeline.texts)
                    _TextBlock(
                      textItem: text,
                      containerWidth: containerWidth,
                      zoom: zoom,
                      isSelected: selection.selectedTextIds.contains(text.id),
                    ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _TextBlock extends ConsumerWidget {
  final TextItem textItem;
  final double containerWidth;
  final ZoomState zoom;
  final bool isSelected;

  const _TextBlock({
    required this.textItem,
    required this.containerWidth,
    required this.zoom,
    required this.isSelected,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final left = zoom.secToPx(textItem.startTime, containerWidth);
    final width = zoom.durToPx(textItem.duration, containerWidth);

    final durationLabel =
        '${fmtDuration(textItem.duration)} · ${fmtShort(textItem.startTime)}–${fmtShort(textItem.endTime)}';

    return TimelineBlock(
      left: left,
      width: width,
      height: 40,
      color: AppColors.textBlock,
      isSelected: isSelected,
      durationLabel: durationLabel,
      onTap: () {
        ref.read(selectionProvider.notifier).selectText(textItem.id);
      },
      onDragUpdate: (deltaPx) {
        final deltaSec = zoom.pxToDur(deltaPx, containerWidth);
        ref.read(timelineProvider.notifier).updateText(textItem.id, (t) {
          t.startTime = (t.startTime + deltaSec).clamp(0, double.infinity);
          return t;
        });
      },
      onResizeUpdate: (deltaPx, fromLeft) {
        final deltaSec = zoom.pxToDur(deltaPx, containerWidth);
        ref.read(timelineProvider.notifier).updateText(textItem.id, (t) {
          if (fromLeft) {
            final newStart = (t.startTime + deltaSec).clamp(0.0, t.endTime - 0.1);
            t.duration = t.endTime - newStart;
            t.startTime = newStart;
          } else {
            t.duration = (t.duration + deltaSec).clamp(0.1, double.infinity);
          }
          return t;
        });
      },
      onDelete: () {
        ref.read(timelineProvider.notifier).removeText(textItem.id);
        ref.read(selectionProvider.notifier).clearTextSelection();
      },
      child: Row(
        children: [
          // Color indicator
          Container(
            width: 3,
            height: 20,
            decoration: BoxDecoration(
              color: hexToColor(textItem.color),
              borderRadius: BorderRadius.circular(1.5),
            ),
          ),
          const SizedBox(width: 6),
          // Text preview
          Expanded(
            child: Text(
              textItem.text,
              style: TextStyle(
                color: hexToColor(textItem.color),
                fontSize: 11,
                fontWeight: textItem.bold ? FontWeight.bold : FontWeight.normal,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

/// Subtitle timeline row — similar to text but separate styling
class SubtitleTimeline extends ConsumerWidget {
  const SubtitleTimeline({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final timeline = ref.watch(timelineProvider);
    final zoom = ref.watch(zoomProvider);

    return LayoutBuilder(
      builder: (context, constraints) {
        final containerWidth = constraints.maxWidth;
        final totalWidth = zoom.totalWidth(containerWidth);

        return SizedBox(
          height: 36,
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: SizedBox(
              width: totalWidth,
              height: 36,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  if (timeline.subtitles.isEmpty)
                    const Center(
                      child: Text(
                        'Auto-generated from AI pipeline',
                        style: TextStyle(color: AppColors.textMuted, fontSize: 10),
                      ),
                    ),
                  for (final sub in timeline.subtitles)
                    _SubtitleBlock(
                      subtitle: sub,
                      containerWidth: containerWidth,
                      zoom: zoom,
                    ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _SubtitleBlock extends StatelessWidget {
  final SubtitleItem subtitle;
  final double containerWidth;
  final ZoomState zoom;

  const _SubtitleBlock({
    required this.subtitle,
    required this.containerWidth,
    required this.zoom,
  });

  @override
  Widget build(BuildContext context) {
    final left = zoom.secToPx(subtitle.startTime, containerWidth);
    final width = zoom.durToPx(subtitle.duration, containerWidth);

    return Positioned(
      left: left,
      top: 0,
      child: Container(
        width: width.clamp(20, double.infinity),
        height: 32,
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
        decoration: BoxDecoration(
          color: AppColors.subtitleBlock,
          borderRadius: BorderRadius.circular(4),
          border: Border.all(color: AppColors.border),
        ),
        child: Text(
          subtitle.text,
          style: const TextStyle(
            color: AppColors.textSecondary,
            fontSize: 9,
          ),
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
      ),
    );
  }
}
