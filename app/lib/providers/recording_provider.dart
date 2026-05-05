import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/recording_session.dart';

/// Recording state for dual-camera podcast feature
class RecordingState {
  final bool isRecording;
  final bool isPaused;
  final double elapsedSeconds;
  final String activeSpeaker; // 'host', 'guest', or 'none'
  final double hostLevel; // 0-1 audio level from front mic
  final double guestLevel; // 0-1 audio level from back mic
  final bool isDualCameraSupported;
  final bool isProcessing; // post-recording noise cancellation
  final double processingProgress; // 0-1
  final RecordingSession? completedSession;

  const RecordingState({
    this.isRecording = false,
    this.isPaused = false,
    this.elapsedSeconds = 0,
    this.activeSpeaker = 'none',
    this.hostLevel = 0,
    this.guestLevel = 0,
    this.isDualCameraSupported = false,
    this.isProcessing = false,
    this.processingProgress = 0,
    this.completedSession,
  });

  RecordingState copyWith({
    bool? isRecording,
    bool? isPaused,
    double? elapsedSeconds,
    String? activeSpeaker,
    double? hostLevel,
    double? guestLevel,
    bool? isDualCameraSupported,
    bool? isProcessing,
    double? processingProgress,
    RecordingSession? completedSession,
    bool clearSession = false,
  }) {
    return RecordingState(
      isRecording: isRecording ?? this.isRecording,
      isPaused: isPaused ?? this.isPaused,
      elapsedSeconds: elapsedSeconds ?? this.elapsedSeconds,
      activeSpeaker: activeSpeaker ?? this.activeSpeaker,
      hostLevel: hostLevel ?? this.hostLevel,
      guestLevel: guestLevel ?? this.guestLevel,
      isDualCameraSupported:
          isDualCameraSupported ?? this.isDualCameraSupported,
      isProcessing: isProcessing ?? this.isProcessing,
      processingProgress: processingProgress ?? this.processingProgress,
      completedSession:
          clearSession ? null : (completedSession ?? this.completedSession),
    );
  }
}

class RecordingNotifier extends StateNotifier<RecordingState> {
  RecordingNotifier() : super(const RecordingState());

  void setDualCameraSupported(bool supported) {
    state = state.copyWith(isDualCameraSupported: supported);
  }

  void startRecording() {
    state = state.copyWith(
      isRecording: true,
      isPaused: false,
      elapsedSeconds: 0,
      clearSession: true,
    );
  }

  void pauseRecording() {
    state = state.copyWith(isPaused: true);
  }

  void resumeRecording() {
    state = state.copyWith(isPaused: false);
  }

  void stopRecording() {
    state = state.copyWith(isRecording: false, isPaused: false);
  }

  void updateElapsed(double seconds) {
    state = state.copyWith(elapsedSeconds: seconds);
  }

  void updateSpeakerLevels(double hostLevel, double guestLevel) {
    final active = hostLevel > guestLevel && hostLevel > 0.05
        ? 'host'
        : guestLevel > hostLevel && guestLevel > 0.05
            ? 'guest'
            : 'none';
    state = state.copyWith(
      hostLevel: hostLevel,
      guestLevel: guestLevel,
      activeSpeaker: active,
    );
  }

  void setProcessing(bool processing, {double progress = 0}) {
    state = state.copyWith(
      isProcessing: processing,
      processingProgress: progress,
    );
  }

  void updateProcessingProgress(double progress) {
    state = state.copyWith(processingProgress: progress);
  }

  void setCompletedSession(RecordingSession session) {
    state = state.copyWith(
      completedSession: session,
      isProcessing: false,
    );
  }

  void clear() {
    state = const RecordingState();
  }
}

final recordingProvider =
    StateNotifierProvider<RecordingNotifier, RecordingState>((ref) {
  return RecordingNotifier();
});
