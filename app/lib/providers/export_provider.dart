import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Export state management
class ExportState {
  final bool isExporting;
  final double progress; // 0-1
  final String status; // human-readable status
  final String? outputPath; // final exported file path
  final String? error;

  const ExportState({
    this.isExporting = false,
    this.progress = 0,
    this.status = '',
    this.outputPath,
    this.error,
  });

  String get eta {
    if (progress <= 0) return '';
    // Simple ETA based on elapsed time — would need a timer in real impl
    return '';
  }

  ExportState copyWith({
    bool? isExporting,
    double? progress,
    String? status,
    String? outputPath,
    String? error,
    bool clearOutput = false,
    bool clearError = false,
  }) {
    return ExportState(
      isExporting: isExporting ?? this.isExporting,
      progress: progress ?? this.progress,
      status: status ?? this.status,
      outputPath: clearOutput ? null : (outputPath ?? this.outputPath),
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class ExportNotifier extends StateNotifier<ExportState> {
  ExportNotifier() : super(const ExportState());

  void startExport() {
    state = state.copyWith(
      isExporting: true,
      progress: 0,
      status: 'Starting...',
      clearOutput: true,
      clearError: true,
    );
  }

  void updateProgress(double progress, String status) {
    state = state.copyWith(progress: progress, status: status);
  }

  void completeExport(String outputPath) {
    state = state.copyWith(
      isExporting: false,
      progress: 1.0,
      status: 'Done!',
      outputPath: outputPath,
    );
  }

  void failExport(String error) {
    state = state.copyWith(
      isExporting: false,
      status: 'Failed',
      error: error,
    );
  }

  void reset() {
    state = const ExportState();
  }
}

final exportProvider =
    StateNotifierProvider<ExportNotifier, ExportState>((ref) {
  return ExportNotifier();
});
