import 'package:flutter/material.dart';
import '../../../../core/theme/colors.dart';

/// Generic draggable, resizable timeline block
/// Ported from photo-block / text-block interaction in 04-photo-timeline.js
class TimelineBlock extends StatefulWidget {
  final double left; // pixel position from left
  final double width; // pixel width
  final double height;
  final Color color;
  final bool isSelected;
  final Widget child;
  final String? durationLabel;
  final String? transitionIcon;

  // Callbacks
  final void Function()? onTap;
  final void Function(bool toggle)? onSelect; // toggle = ctrl/cmd held
  final void Function(double deltaPx)? onDragUpdate;
  final void Function()? onDragEnd;
  final void Function(double deltaPx, bool fromLeft)? onResizeUpdate;
  final void Function()? onResizeEnd;
  final void Function()? onDelete;

  const TimelineBlock({
    super.key,
    required this.left,
    required this.width,
    this.height = 48,
    this.color = const Color(0xFF2a2a4a),
    this.isSelected = false,
    required this.child,
    this.durationLabel,
    this.transitionIcon,
    this.onTap,
    this.onSelect,
    this.onDragUpdate,
    this.onDragEnd,
    this.onResizeUpdate,
    this.onResizeEnd,
    this.onDelete,
  });

  @override
  State<TimelineBlock> createState() => _TimelineBlockState();
}

class _TimelineBlockState extends State<TimelineBlock> {
  bool _isDragging = false;
  bool _isResizing = false;

  @override
  Widget build(BuildContext context) {
    return Positioned(
      left: widget.left,
      top: 0,
      child: GestureDetector(
        onTap: widget.onTap,
        onPanStart: _onPanStart,
        onPanUpdate: _onPanUpdate,
        onPanEnd: _onPanEnd,
        child: Container(
          width: widget.width.clamp(20, double.infinity),
          height: widget.height,
          decoration: BoxDecoration(
            color: widget.color,
            borderRadius: BorderRadius.circular(6),
            border: Border.all(
              color: widget.isSelected
                  ? AppColors.accent
                  : AppColors.border,
              width: widget.isSelected ? 2 : 1,
            ),
          ),
          clipBehavior: Clip.hardEdge,
          child: Stack(
            clipBehavior: Clip.hardEdge,
            children: [
              // Main content
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                child: widget.child,
              ),

              // Duration label
              if (widget.durationLabel != null)
                Positioned(
                  bottom: 2,
                  left: 4,
                  child: Text(
                    widget.durationLabel!,
                    style: TextStyle(
                      color: Colors.white.withAlpha(128),
                      fontSize: 8,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                ),

              // Transition icon
              if (widget.transitionIcon != null)
                Positioned(
                  top: 2,
                  right: 4,
                  child: Text(
                    widget.transitionIcon!,
                    style: const TextStyle(fontSize: 10),
                  ),
                ),

              // Left resize handle
              Positioned(
                left: 0,
                top: 0,
                bottom: 0,
                child: GestureDetector(
                  onHorizontalDragStart: (_) {
                    _isResizing = true;
                  },
                  onHorizontalDragUpdate: (d) {
                    widget.onResizeUpdate?.call(d.delta.dx, true);
                  },
                  onHorizontalDragEnd: (_) {
                    _isResizing = false;
                    widget.onResizeEnd?.call();
                  },
                  child: Container(
                    width: 8,
                    decoration: BoxDecoration(
                      color: widget.isSelected
                          ? AppColors.accent.withAlpha(77)
                          : Colors.transparent,
                      borderRadius: const BorderRadius.horizontal(
                          left: Radius.circular(6)),
                    ),
                  ),
                ),
              ),

              // Right resize handle
              Positioned(
                right: 0,
                top: 0,
                bottom: 0,
                child: GestureDetector(
                  onHorizontalDragStart: (_) {
                    _isResizing = true;
                  },
                  onHorizontalDragUpdate: (d) {
                    widget.onResizeUpdate?.call(d.delta.dx, false);
                  },
                  onHorizontalDragEnd: (_) {
                    _isResizing = false;
                    widget.onResizeEnd?.call();
                  },
                  child: Container(
                    width: 8,
                    decoration: BoxDecoration(
                      color: widget.isSelected
                          ? AppColors.accent.withAlpha(77)
                          : Colors.transparent,
                      borderRadius: const BorderRadius.horizontal(
                          right: Radius.circular(6)),
                    ),
                  ),
                ),
              ),

              // Delete button (shown when selected)
              if (widget.isSelected && widget.onDelete != null)
                Positioned(
                  top: -6,
                  right: -6,
                  child: GestureDetector(
                    onTap: widget.onDelete,
                    child: Container(
                      width: 16,
                      height: 16,
                      decoration: const BoxDecoration(
                        color: AppColors.red,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.close, size: 10, color: Colors.white),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  void _onPanStart(DragStartDetails details) {
    if (!_isResizing) {
      _isDragging = true;
    }
  }

  void _onPanUpdate(DragUpdateDetails details) {
    if (_isDragging && !_isResizing) {
      widget.onDragUpdate?.call(details.delta.dx);
    }
  }

  void _onPanEnd(DragEndDetails details) {
    if (_isDragging) {
      _isDragging = false;
      widget.onDragEnd?.call();
    }
  }
}
