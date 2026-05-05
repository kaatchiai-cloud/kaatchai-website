import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Selection state for multi-select in timelines
class SelectionState {
  final Set<int> selectedPhotoIds;
  final Set<int> selectedTextIds;
  final Set<int> selectedSubtitleIds;
  final int? selectedPipId;

  const SelectionState({
    this.selectedPhotoIds = const {},
    this.selectedTextIds = const {},
    this.selectedSubtitleIds = const {},
    this.selectedPipId,
  });

  bool get hasPhotoSelection => selectedPhotoIds.isNotEmpty;
  bool get hasTextSelection => selectedTextIds.isNotEmpty;
  bool get hasSubtitleSelection => selectedSubtitleIds.isNotEmpty;
  bool get hasAnySelection =>
      hasPhotoSelection || hasTextSelection || hasSubtitleSelection;

  SelectionState copyWith({
    Set<int>? selectedPhotoIds,
    Set<int>? selectedTextIds,
    Set<int>? selectedSubtitleIds,
    int? selectedPipId,
    bool clearPip = false,
  }) {
    return SelectionState(
      selectedPhotoIds: selectedPhotoIds ?? this.selectedPhotoIds,
      selectedTextIds: selectedTextIds ?? this.selectedTextIds,
      selectedSubtitleIds: selectedSubtitleIds ?? this.selectedSubtitleIds,
      selectedPipId: clearPip ? null : (selectedPipId ?? this.selectedPipId),
    );
  }
}

class SelectionNotifier extends StateNotifier<SelectionState> {
  SelectionNotifier() : super(const SelectionState());

  // ── Photos ──

  void selectPhoto(int id, {bool toggle = false}) {
    if (toggle) {
      final ids = Set<int>.from(state.selectedPhotoIds);
      if (ids.contains(id)) {
        ids.remove(id);
      } else {
        ids.add(id);
      }
      state = state.copyWith(selectedPhotoIds: ids);
    } else {
      state = state.copyWith(selectedPhotoIds: {id});
    }
  }

  void selectPhotos(Set<int> ids) {
    state = state.copyWith(selectedPhotoIds: ids);
  }

  void clearPhotoSelection() {
    state = state.copyWith(selectedPhotoIds: {});
  }

  // ── Texts ──

  void selectText(int id, {bool toggle = false}) {
    if (toggle) {
      final ids = Set<int>.from(state.selectedTextIds);
      if (ids.contains(id)) {
        ids.remove(id);
      } else {
        ids.add(id);
      }
      state = state.copyWith(selectedTextIds: ids);
    } else {
      state = state.copyWith(selectedTextIds: {id});
    }
  }

  void clearTextSelection() {
    state = state.copyWith(selectedTextIds: {});
  }

  // ── Subtitles ──

  void selectSubtitle(int id) {
    state = state.copyWith(selectedSubtitleIds: {id});
  }

  void clearSubtitleSelection() {
    state = state.copyWith(selectedSubtitleIds: {});
  }

  // ── PiP ──

  void selectPip(int id) {
    state = state.copyWith(selectedPipId: id);
  }

  void clearPipSelection() {
    state = state.copyWith(clearPip: true);
  }

  // ── Clear all ──

  void clearAll() {
    state = const SelectionState();
  }
}

final selectionProvider =
    StateNotifierProvider<SelectionNotifier, SelectionState>((ref) {
  return SelectionNotifier();
});
