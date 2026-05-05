import 'package:flutter/material.dart';
import '../../../../core/theme/colors.dart';

/// Toolbar for audio editing operations (keep, delete, insert, undo)
/// Ported from the editor toolbar buttons in index.html
class AudioEditorToolbar extends StatelessWidget {
  final bool hasRegion;
  final bool canUndo;
  final bool isPlaying;
  final VoidCallback? onPlay;
  final VoidCallback? onStop;
  final VoidCallback? onPlaySelection;
  final VoidCallback? onKeep;
  final VoidCallback? onDelete;
  final VoidCallback? onInsert;
  final VoidCallback? onUndo;
  final VoidCallback? onImportAudio;
  final VoidCallback? onToggleSilence;

  const AudioEditorToolbar({
    super.key,
    this.hasRegion = false,
    this.canUndo = false,
    this.isPlaying = false,
    this.onPlay,
    this.onStop,
    this.onPlaySelection,
    this.onKeep,
    this.onDelete,
    this.onInsert,
    this.onUndo,
    this.onImportAudio,
    this.onToggleSilence,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Row(
        children: [
          // Playback controls
          _ToolButton(
            icon: isPlaying ? Icons.pause_rounded : Icons.play_arrow_rounded,
            tooltip: isPlaying ? 'Pause' : 'Play',
            onTap: onPlay,
          ),
          _ToolButton(
            icon: Icons.stop_rounded,
            tooltip: 'Stop',
            onTap: onStop,
          ),
          if (hasRegion)
            _ToolButton(
              icon: Icons.play_circle_outline,
              tooltip: 'Play Selection',
              onTap: onPlaySelection,
              color: AppColors.accent,
            ),

          const SizedBox(width: 8),
          Container(width: 1, height: 20, color: AppColors.border),
          const SizedBox(width: 8),

          // Edit controls
          _ToolButton(
            icon: Icons.content_cut,
            tooltip: 'Keep Selection',
            onTap: hasRegion ? onKeep : null,
          ),
          _ToolButton(
            icon: Icons.delete_outline,
            tooltip: 'Delete Selection',
            onTap: hasRegion ? onDelete : null,
            color: hasRegion ? AppColors.red : null,
          ),
          _ToolButton(
            icon: Icons.add_circle_outline,
            tooltip: 'Insert Audio',
            onTap: onInsert,
          ),
          _ToolButton(
            icon: Icons.undo_rounded,
            tooltip: 'Undo',
            onTap: canUndo ? onUndo : null,
          ),

          const Spacer(),

          // Silence detection toggle
          _ToolButton(
            icon: Icons.volume_off_rounded,
            tooltip: 'Silence Detection',
            onTap: onToggleSilence,
            color: AppColors.amber,
          ),

          // Import audio
          _ToolButton(
            icon: Icons.file_open_rounded,
            tooltip: 'Import Audio',
            onTap: onImportAudio,
          ),
        ],
      ),
    );
  }
}

class _ToolButton extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback? onTap;
  final Color? color;

  const _ToolButton({
    required this.icon,
    required this.tooltip,
    this.onTap,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(6),
        child: Padding(
          padding: const EdgeInsets.all(6),
          child: Icon(
            icon,
            size: 20,
            color: enabled
                ? (color ?? AppColors.textPrimary)
                : AppColors.textMuted.withAlpha(77),
          ),
        ),
      ),
    );
  }
}
