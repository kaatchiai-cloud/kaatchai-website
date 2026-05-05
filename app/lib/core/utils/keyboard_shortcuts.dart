import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Keyboard shortcut handler for external keyboard support
/// Space=play/pause, Arrows=seek, Ctrl+S=save, Ctrl+Z=undo, Delete=delete selected
class KeyboardShortcutHandler extends StatelessWidget {
  final Widget child;
  final VoidCallback? onPlayPause;
  final VoidCallback? onSeekForward;
  final VoidCallback? onSeekBackward;
  final VoidCallback? onSave;
  final VoidCallback? onUndo;
  final VoidCallback? onDelete;
  final VoidCallback? onEscape;

  const KeyboardShortcutHandler({
    super.key,
    required this.child,
    this.onPlayPause,
    this.onSeekForward,
    this.onSeekBackward,
    this.onSave,
    this.onUndo,
    this.onDelete,
    this.onEscape,
  });

  @override
  Widget build(BuildContext context) {
    return Shortcuts(
      shortcuts: {
        // Space = play/pause
        const SingleActivator(LogicalKeyboardKey.space): const _PlayPauseIntent(),
        // Right arrow = seek forward
        const SingleActivator(LogicalKeyboardKey.arrowRight): const _SeekForwardIntent(),
        // Left arrow = seek backward
        const SingleActivator(LogicalKeyboardKey.arrowLeft): const _SeekBackwardIntent(),
        // Ctrl+S = save
        const SingleActivator(LogicalKeyboardKey.keyS, control: true): const _SaveIntent(),
        // Cmd+S = save (macOS)
        const SingleActivator(LogicalKeyboardKey.keyS, meta: true): const _SaveIntent(),
        // Ctrl+Z = undo
        const SingleActivator(LogicalKeyboardKey.keyZ, control: true): const _UndoIntent(),
        // Cmd+Z = undo (macOS)
        const SingleActivator(LogicalKeyboardKey.keyZ, meta: true): const _UndoIntent(),
        // Delete/Backspace = delete selected
        const SingleActivator(LogicalKeyboardKey.delete): const _DeleteIntent(),
        const SingleActivator(LogicalKeyboardKey.backspace): const _DeleteIntent(),
        // Escape = deselect/close
        const SingleActivator(LogicalKeyboardKey.escape): const _EscapeIntent(),
      },
      child: Actions(
        actions: {
          _PlayPauseIntent: CallbackAction<_PlayPauseIntent>(
            onInvoke: (_) { onPlayPause?.call(); return null; },
          ),
          _SeekForwardIntent: CallbackAction<_SeekForwardIntent>(
            onInvoke: (_) { onSeekForward?.call(); return null; },
          ),
          _SeekBackwardIntent: CallbackAction<_SeekBackwardIntent>(
            onInvoke: (_) { onSeekBackward?.call(); return null; },
          ),
          _SaveIntent: CallbackAction<_SaveIntent>(
            onInvoke: (_) { onSave?.call(); return null; },
          ),
          _UndoIntent: CallbackAction<_UndoIntent>(
            onInvoke: (_) { onUndo?.call(); return null; },
          ),
          _DeleteIntent: CallbackAction<_DeleteIntent>(
            onInvoke: (_) { onDelete?.call(); return null; },
          ),
          _EscapeIntent: CallbackAction<_EscapeIntent>(
            onInvoke: (_) { onEscape?.call(); return null; },
          ),
        },
        child: Focus(
          autofocus: true,
          child: child,
        ),
      ),
    );
  }
}

class _PlayPauseIntent extends Intent {
  const _PlayPauseIntent();
}

class _SeekForwardIntent extends Intent {
  const _SeekForwardIntent();
}

class _SeekBackwardIntent extends Intent {
  const _SeekBackwardIntent();
}

class _SaveIntent extends Intent {
  const _SaveIntent();
}

class _UndoIntent extends Intent {
  const _UndoIntent();
}

class _DeleteIntent extends Intent {
  const _DeleteIntent();
}

class _EscapeIntent extends Intent {
  const _EscapeIntent();
}
