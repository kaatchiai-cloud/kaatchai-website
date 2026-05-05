import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Audio playback and editing state
class AudioState {
  final String? audioFilePath;
  final double duration; // total audio duration in seconds
  final double currentTime; // current playback position
  final bool isPlaying;
  final double? regionStart; // selected region start
  final double? regionEnd; // selected region end

  // Background music
  final String? bgmFilePath;
  final double bgmVolume;
  final bool bgmLoop;

  const AudioState({
    this.audioFilePath,
    this.duration = 0,
    this.currentTime = 0,
    this.isPlaying = false,
    this.regionStart,
    this.regionEnd,
    this.bgmFilePath,
    this.bgmVolume = 0.3,
    this.bgmLoop = true,
  });

  bool get hasAudio => audioFilePath != null;
  bool get hasRegion => regionStart != null && regionEnd != null;
  bool get hasBgm => bgmFilePath != null;

  AudioState copyWith({
    String? audioFilePath,
    double? duration,
    double? currentTime,
    bool? isPlaying,
    double? regionStart,
    double? regionEnd,
    String? bgmFilePath,
    double? bgmVolume,
    bool? bgmLoop,
    bool clearRegion = false,
    bool clearBgm = false,
    bool clearAudio = false,
  }) {
    return AudioState(
      audioFilePath: clearAudio ? null : (audioFilePath ?? this.audioFilePath),
      duration: duration ?? this.duration,
      currentTime: currentTime ?? this.currentTime,
      isPlaying: isPlaying ?? this.isPlaying,
      regionStart: clearRegion ? null : (regionStart ?? this.regionStart),
      regionEnd: clearRegion ? null : (regionEnd ?? this.regionEnd),
      bgmFilePath: clearBgm ? null : (bgmFilePath ?? this.bgmFilePath),
      bgmVolume: bgmVolume ?? this.bgmVolume,
      bgmLoop: bgmLoop ?? this.bgmLoop,
    );
  }
}

class AudioNotifier extends StateNotifier<AudioState> {
  AudioNotifier() : super(const AudioState());

  void setAudio(String filePath, double duration) {
    state = state.copyWith(audioFilePath: filePath, duration: duration);
  }

  void updateCurrentTime(double time) {
    state = state.copyWith(currentTime: time);
  }

  void setPlaying(bool playing) {
    state = state.copyWith(isPlaying: playing);
  }

  void setRegion(double start, double end) {
    state = state.copyWith(regionStart: start, regionEnd: end);
  }

  void clearRegion() {
    state = state.copyWith(clearRegion: true);
  }

  void setBgm(String filePath) {
    state = state.copyWith(bgmFilePath: filePath);
  }

  void setBgmVolume(double volume) {
    state = state.copyWith(bgmVolume: volume);
  }

  void setBgmLoop(bool loop) {
    state = state.copyWith(bgmLoop: loop);
  }

  void removeBgm() {
    state = state.copyWith(clearBgm: true);
  }

  void clear() {
    state = const AudioState();
  }
}

final audioProvider =
    StateNotifierProvider<AudioNotifier, AudioState>((ref) {
  return AudioNotifier();
});
