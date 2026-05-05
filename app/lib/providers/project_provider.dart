import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/models.dart';

/// Current project metadata state
class ProjectState {
  final String? projectId;
  final String projectName;
  final String imageSize;
  final String exportQuality;
  final int exportFps;
  final String seriesName;
  final int episodeNumber;
  final String? stylePrompt;
  final String? stylePreset;
  final String? selectedTemplate;
  final List<LanguageTrack> languageTracks;
  final String currentLang; // 'original' or langCode
  final RecordingSession? recordingSession;

  const ProjectState({
    this.projectId,
    this.projectName = 'Untitled',
    this.imageSize = '1280x720',
    this.exportQuality = 'balanced',
    this.exportFps = 24,
    this.seriesName = '',
    this.episodeNumber = 0,
    this.stylePrompt,
    this.stylePreset,
    this.selectedTemplate,
    this.languageTracks = const [],
    this.currentLang = 'original',
    this.recordingSession,
  });

  int get width => int.parse(imageSize.split('x')[0]);
  int get height => int.parse(imageSize.split('x')[1]);

  ProjectState copyWith({
    String? projectId,
    String? projectName,
    String? imageSize,
    String? exportQuality,
    int? exportFps,
    String? seriesName,
    int? episodeNumber,
    String? stylePrompt,
    String? stylePreset,
    String? selectedTemplate,
    List<LanguageTrack>? languageTracks,
    String? currentLang,
    RecordingSession? recordingSession,
    bool clearRecording = false,
  }) {
    return ProjectState(
      projectId: projectId ?? this.projectId,
      projectName: projectName ?? this.projectName,
      imageSize: imageSize ?? this.imageSize,
      exportQuality: exportQuality ?? this.exportQuality,
      exportFps: exportFps ?? this.exportFps,
      seriesName: seriesName ?? this.seriesName,
      episodeNumber: episodeNumber ?? this.episodeNumber,
      stylePrompt: stylePrompt ?? this.stylePrompt,
      stylePreset: stylePreset ?? this.stylePreset,
      selectedTemplate: selectedTemplate ?? this.selectedTemplate,
      languageTracks: languageTracks ?? this.languageTracks,
      currentLang: currentLang ?? this.currentLang,
      recordingSession:
          clearRecording ? null : (recordingSession ?? this.recordingSession),
    );
  }
}

class ProjectNotifier extends StateNotifier<ProjectState> {
  ProjectNotifier() : super(const ProjectState());

  void setName(String name) {
    state = state.copyWith(projectName: name);
  }

  void setImageSize(String size) {
    state = state.copyWith(imageSize: size);
  }

  void setExportQuality(String quality) {
    state = state.copyWith(exportQuality: quality);
  }

  void setExportFps(int fps) {
    state = state.copyWith(exportFps: fps);
  }

  void setSeries(String name, int episode) {
    state = state.copyWith(seriesName: name, episodeNumber: episode);
  }

  void setStyle(String? prompt, String? preset) {
    state = state.copyWith(stylePrompt: prompt, stylePreset: preset);
  }

  void setTemplate(String? templateId) {
    state = state.copyWith(selectedTemplate: templateId);
  }

  void setLanguageTracks(List<LanguageTrack> tracks) {
    state = state.copyWith(languageTracks: tracks);
  }

  void setCurrentLang(String lang) {
    state = state.copyWith(currentLang: lang);
  }

  void setRecordingSession(RecordingSession session) {
    state = state.copyWith(recordingSession: session);
  }

  void loadFromProject(Project project) {
    state = ProjectState(
      projectId: project.id,
      projectName: project.name,
      imageSize: project.imageSize,
      exportQuality: project.exportQuality,
      exportFps: int.tryParse(project.exportFps) ?? 24,
      seriesName: project.seriesName,
      episodeNumber: project.episodeNumber,
      stylePrompt: project.stylePrompt,
      stylePreset: project.stylePreset,
      selectedTemplate: project.selectedTemplate,
      languageTracks: project.languageTracks,
      recordingSession: project.recordingSession,
    );
  }

  void clear() {
    state = const ProjectState();
  }
}

final projectProvider =
    StateNotifierProvider<ProjectNotifier, ProjectState>((ref) {
  return ProjectNotifier();
});
