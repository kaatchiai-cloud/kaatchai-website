import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/models.dart';

/// Timeline state holding all items on the timeline
class TimelineState {
  final List<PhotoItem> photos;
  final List<TextItem> texts;
  final List<SubtitleItem> subtitles;
  final List<PipItem> pipItems;
  final int nextPhotoId;
  final int nextTextId;
  final int nextSubtitleId;
  final int nextPipId;

  const TimelineState({
    this.photos = const [],
    this.texts = const [],
    this.subtitles = const [],
    this.pipItems = const [],
    this.nextPhotoId = 1,
    this.nextTextId = 1,
    this.nextSubtitleId = 1,
    this.nextPipId = 1,
  });

  TimelineState copyWith({
    List<PhotoItem>? photos,
    List<TextItem>? texts,
    List<SubtitleItem>? subtitles,
    List<PipItem>? pipItems,
    int? nextPhotoId,
    int? nextTextId,
    int? nextSubtitleId,
    int? nextPipId,
  }) {
    return TimelineState(
      photos: photos ?? this.photos,
      texts: texts ?? this.texts,
      subtitles: subtitles ?? this.subtitles,
      pipItems: pipItems ?? this.pipItems,
      nextPhotoId: nextPhotoId ?? this.nextPhotoId,
      nextTextId: nextTextId ?? this.nextTextId,
      nextSubtitleId: nextSubtitleId ?? this.nextSubtitleId,
      nextPipId: nextPipId ?? this.nextPipId,
    );
  }
}

class TimelineNotifier extends StateNotifier<TimelineState> {
  TimelineNotifier() : super(const TimelineState());

  // ── Photos ──

  void addPhoto(PhotoItem item) {
    state = state.copyWith(
      photos: [...state.photos, item],
      nextPhotoId: state.nextPhotoId + 1,
    );
  }

  void updatePhoto(int id, PhotoItem Function(PhotoItem) updater) {
    state = state.copyWith(
      photos: state.photos.map((p) => p.id == id ? updater(p) : p).toList(),
    );
  }

  void removePhoto(int id) {
    state = state.copyWith(
      photos: state.photos.where((p) => p.id != id).toList(),
    );
  }

  void removePhotos(Set<int> ids) {
    state = state.copyWith(
      photos: state.photos.where((p) => !ids.contains(p.id)).toList(),
    );
  }

  // ── Texts ──

  void addText(TextItem item) {
    state = state.copyWith(
      texts: [...state.texts, item],
      nextTextId: state.nextTextId + 1,
    );
  }

  void updateText(int id, TextItem Function(TextItem) updater) {
    state = state.copyWith(
      texts: state.texts.map((t) => t.id == id ? updater(t) : t).toList(),
    );
  }

  void removeText(int id) {
    state = state.copyWith(
      texts: state.texts.where((t) => t.id != id).toList(),
    );
  }

  // ── Subtitles ──

  void addSubtitle(SubtitleItem item) {
    state = state.copyWith(
      subtitles: [...state.subtitles, item],
      nextSubtitleId: state.nextSubtitleId + 1,
    );
  }

  void updateSubtitle(int id, SubtitleItem Function(SubtitleItem) updater) {
    state = state.copyWith(
      subtitles:
          state.subtitles.map((s) => s.id == id ? updater(s) : s).toList(),
    );
  }

  void removeSubtitle(int id) {
    state = state.copyWith(
      subtitles: state.subtitles.where((s) => s.id != id).toList(),
    );
  }

  void setSubtitles(List<SubtitleItem> subtitles) {
    state = state.copyWith(subtitles: subtitles);
  }

  // ── PiP ──

  void addPip(PipItem item) {
    state = state.copyWith(
      pipItems: [...state.pipItems, item],
      nextPipId: state.nextPipId + 1,
    );
  }

  void updatePip(int id, PipItem Function(PipItem) updater) {
    state = state.copyWith(
      pipItems:
          state.pipItems.map((p) => p.id == id ? updater(p) : p).toList(),
    );
  }

  void removePip(int id) {
    state = state.copyWith(
      pipItems: state.pipItems.where((p) => p.id != id).toList(),
    );
  }

  // ── Bulk operations ──

  void loadFromProject(Project project) {
    state = TimelineState(
      photos: project.photos,
      texts: project.texts,
      subtitles: project.subtitles,
      pipItems: project.pipItems,
      nextPhotoId: project.nextPhotoId,
      nextTextId: project.nextTextId,
    );
  }

  void clear() {
    state = const TimelineState();
  }
}

final timelineProvider =
    StateNotifierProvider<TimelineNotifier, TimelineState>((ref) {
  return TimelineNotifier();
});

/// Sorted photos by start time (for rendering)
final sortedPhotosProvider = Provider<List<PhotoItem>>((ref) {
  final photos = ref.watch(timelineProvider).photos;
  return List<PhotoItem>.from(photos)
    ..sort((a, b) => a.startTime.compareTo(b.startTime));
});

/// Sorted texts by start time
final sortedTextsProvider = Provider<List<TextItem>>((ref) {
  final texts = ref.watch(timelineProvider).texts;
  return List<TextItem>.from(texts)
    ..sort((a, b) => a.startTime.compareTo(b.startTime));
});

/// Sorted subtitles by start time
final sortedSubtitlesProvider = Provider<List<SubtitleItem>>((ref) {
  final subs = ref.watch(timelineProvider).subtitles;
  return List<SubtitleItem>.from(subs)
    ..sort((a, b) => a.startTime.compareTo(b.startTime));
});
