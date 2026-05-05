import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/constants/transitions.dart';
import '../../../../core/utils/time_format.dart';
import '../../../../models/photo_item.dart';
import '../../../../providers/timeline_provider.dart';
import '../../../../providers/zoom_provider.dart';
import '../../../../providers/selection_provider.dart';
import 'timeline_block.dart';

/// Photo timeline row — displays photo blocks with drag/resize
class PhotoTimeline extends ConsumerWidget {
  const PhotoTimeline({super.key});

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
          height: 56,
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: SizedBox(
              width: totalWidth,
              height: 56,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  // Empty state
                  if (timeline.photos.isEmpty)
                    const Center(
                      child: Text(
                        'Tap + to add photos',
                        style: TextStyle(color: AppColors.textMuted, fontSize: 11),
                      ),
                    ),

                  // Photo blocks
                  for (final photo in timeline.photos)
                    _PhotoBlock(
                      photo: photo,
                      containerWidth: containerWidth,
                      zoom: zoom,
                      isSelected: selection.selectedPhotoIds.contains(photo.id),
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

class _PhotoBlock extends ConsumerWidget {
  final PhotoItem photo;
  final double containerWidth;
  final ZoomState zoom;
  final bool isSelected;

  const _PhotoBlock({
    required this.photo,
    required this.containerWidth,
    required this.zoom,
    required this.isSelected,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final left = zoom.secToPx(photo.startTime, containerWidth);
    final width = zoom.durToPx(photo.duration, containerWidth);

    final transLabel = TransitionType.fromKey(photo.transition).label;
    final durationLabel =
        '${fmtDuration(photo.duration)} · ${fmtShort(photo.startTime)}–${fmtShort(photo.endTime)}';

    return TimelineBlock(
      left: left,
      width: width,
      height: 52,
      color: AppColors.photoBlock,
      isSelected: isSelected,
      durationLabel: durationLabel,
      transitionIcon: transLabel != 'Cut' ? transLabel : null,
      onTap: () {
        ref.read(selectionProvider.notifier).selectPhoto(photo.id);
      },
      onDragUpdate: (deltaPx) {
        final deltaSec = zoom.pxToDur(deltaPx, containerWidth);
        ref.read(timelineProvider.notifier).updatePhoto(photo.id, (p) {
          p.startTime = (p.startTime + deltaSec).clamp(0, double.infinity);
          return p;
        });
      },
      onResizeUpdate: (deltaPx, fromLeft) {
        final deltaSec = zoom.pxToDur(deltaPx, containerWidth);
        ref.read(timelineProvider.notifier).updatePhoto(photo.id, (p) {
          if (fromLeft) {
            final newStart = (p.startTime + deltaSec).clamp(0.0, p.endTime - 0.1);
            p.duration = p.endTime - newStart;
            p.startTime = newStart;
          } else {
            p.duration = (p.duration + deltaSec).clamp(0.1, double.infinity);
          }
          return p;
        });
      },
      onDelete: () {
        ref.read(timelineProvider.notifier).removePhoto(photo.id);
        ref.read(selectionProvider.notifier).clearPhotoSelection();
      },
      child: ClipRect(
        child: Row(
          children: [
            // Thumbnail
            ClipRRect(
              borderRadius: BorderRadius.circular(3),
              child: SizedBox(
                width: 32,
                height: 32,
                child: photo.imagePath.startsWith('/')
                    ? Image.file(
                        File(photo.imagePath),
                        fit: BoxFit.cover,
                        errorBuilder: (c, e, s) => _placeholder(),
                      )
                    : _placeholder(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _placeholder() {
    return Container(
      color: AppColors.bgElevated,
      child: const Icon(Icons.image, size: 16, color: AppColors.textMuted),
    );
  }
}
