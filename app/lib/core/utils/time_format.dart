// Time formatting utilities — ported from 01-core.js fmt() and fmtShort()

/// Format seconds as M:SS.mmm (e.g., "1:23.456")
String fmt(double seconds) {
  final mins = (seconds / 60).floor();
  final secs = seconds % 60;
  return '$mins:${secs.toStringAsFixed(3).padLeft(6, '0')}';
}

/// Format seconds as M:SS (e.g., "1:23")
String fmtShort(double seconds) {
  final mins = (seconds / 60).floor();
  final secs = (seconds % 60).floor();
  return '$mins:${secs.toString().padLeft(2, '0')}';
}

/// Format seconds as HH:MM:SS for longer durations
String fmtLong(double seconds) {
  final hours = (seconds / 3600).floor();
  final mins = ((seconds % 3600) / 60).floor();
  final secs = (seconds % 60).floor();
  if (hours > 0) {
    return '$hours:${mins.toString().padLeft(2, '0')}:${secs.toString().padLeft(2, '0')}';
  }
  return '${mins.toString().padLeft(2, '0')}:${secs.toString().padLeft(2, '0')}';
}

/// Format duration for display in timeline blocks (e.g., "5.0s")
String fmtDuration(double seconds) {
  return '${seconds.toStringAsFixed(1)}s';
}
