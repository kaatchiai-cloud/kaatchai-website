import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/models.dart';

/// AI content creation pipeline state
/// Manages the 9-step wizard flow
class CreateState {
  final int currentStep; // 0-8
  final String inputMode; // 'voice', 'podcast', 'text'

  // API key state
  final String activeTier; // 'free' or 'paid'
  final bool hasApiKey;

  // Audio input
  final String? audioFilePath;
  final double audioDuration;

  // Text input (for text mode)
  final String inputText;

  // Template & style
  final String? selectedTemplate;
  final String imageSize;
  final String stylePrompt;
  final String stylePreset;

  // Transcript
  final List<TranscriptSegment> transcript;
  final bool isTranscribing;

  // Chapters (podcast mode)
  final List<Map<String, dynamic>> chapters;

  // Storyboard scenes
  final List<Scene> scenes;
  final bool isGeneratingStoryboard;

  // Image generation
  final bool isGeneratingImages;
  final int imagesGenerated;
  final int imagesToGenerate;
  final bool generatePaused;

  // Voiceover
  final List<LanguageTrack> generatedTracks;
  final bool isGeneratingVoiceover;

  // Recording session (from dual-camera)
  final RecordingSession? recordingSession;

  // Error
  final String? error;

  const CreateState({
    this.currentStep = 0,
    this.inputMode = 'voice',
    this.activeTier = 'free',
    this.hasApiKey = false,
    this.audioFilePath,
    this.audioDuration = 0,
    this.inputText = '',
    this.selectedTemplate,
    this.imageSize = '1280x720',
    this.stylePrompt = '',
    this.stylePreset = '',
    this.transcript = const [],
    this.isTranscribing = false,
    this.chapters = const [],
    this.scenes = const [],
    this.isGeneratingStoryboard = false,
    this.isGeneratingImages = false,
    this.imagesGenerated = 0,
    this.imagesToGenerate = 0,
    this.generatePaused = false,
    this.generatedTracks = const [],
    this.isGeneratingVoiceover = false,
    this.recordingSession,
    this.error,
  });

  bool get hasTranscript => transcript.isNotEmpty;
  bool get hasScenes => scenes.isNotEmpty;
  bool get allImagesGenerated =>
      scenes.isNotEmpty && scenes.every((s) => s.status == 'done');
  double get imageProgress =>
      imagesToGenerate > 0 ? imagesGenerated / imagesToGenerate : 0;

  CreateState copyWith({
    int? currentStep,
    String? inputMode,
    String? activeTier,
    bool? hasApiKey,
    String? audioFilePath,
    double? audioDuration,
    String? inputText,
    String? selectedTemplate,
    String? imageSize,
    String? stylePrompt,
    String? stylePreset,
    List<TranscriptSegment>? transcript,
    bool? isTranscribing,
    List<Map<String, dynamic>>? chapters,
    List<Scene>? scenes,
    bool? isGeneratingStoryboard,
    bool? isGeneratingImages,
    int? imagesGenerated,
    int? imagesToGenerate,
    bool? generatePaused,
    List<LanguageTrack>? generatedTracks,
    bool? isGeneratingVoiceover,
    RecordingSession? recordingSession,
    String? error,
    bool clearError = false,
    bool clearAudio = false,
    bool clearRecording = false,
  }) {
    return CreateState(
      currentStep: currentStep ?? this.currentStep,
      inputMode: inputMode ?? this.inputMode,
      activeTier: activeTier ?? this.activeTier,
      hasApiKey: hasApiKey ?? this.hasApiKey,
      audioFilePath: clearAudio ? null : (audioFilePath ?? this.audioFilePath),
      audioDuration: audioDuration ?? this.audioDuration,
      inputText: inputText ?? this.inputText,
      selectedTemplate: selectedTemplate ?? this.selectedTemplate,
      imageSize: imageSize ?? this.imageSize,
      stylePrompt: stylePrompt ?? this.stylePrompt,
      stylePreset: stylePreset ?? this.stylePreset,
      transcript: transcript ?? this.transcript,
      isTranscribing: isTranscribing ?? this.isTranscribing,
      chapters: chapters ?? this.chapters,
      scenes: scenes ?? this.scenes,
      isGeneratingStoryboard:
          isGeneratingStoryboard ?? this.isGeneratingStoryboard,
      isGeneratingImages: isGeneratingImages ?? this.isGeneratingImages,
      imagesGenerated: imagesGenerated ?? this.imagesGenerated,
      imagesToGenerate: imagesToGenerate ?? this.imagesToGenerate,
      generatePaused: generatePaused ?? this.generatePaused,
      generatedTracks: generatedTracks ?? this.generatedTracks,
      isGeneratingVoiceover:
          isGeneratingVoiceover ?? this.isGeneratingVoiceover,
      recordingSession:
          clearRecording ? null : (recordingSession ?? this.recordingSession),
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class CreateNotifier extends StateNotifier<CreateState> {
  CreateNotifier() : super(const CreateState());

  void setStep(int step) => state = state.copyWith(currentStep: step);
  void nextStep() => state = state.copyWith(currentStep: state.currentStep + 1);
  void prevStep() {
    if (state.currentStep > 0) {
      state = state.copyWith(currentStep: state.currentStep - 1);
    }
  }

  void setInputMode(String mode) => state = state.copyWith(inputMode: mode);
  void setActiveTier(String tier) => state = state.copyWith(activeTier: tier);
  void setHasApiKey(bool has) => state = state.copyWith(hasApiKey: has);

  void setAudio(String path, double duration) =>
      state = state.copyWith(audioFilePath: path, audioDuration: duration);
  void setInputText(String text) => state = state.copyWith(inputText: text);

  void setTemplate(String? id) => state = state.copyWith(selectedTemplate: id);
  void setImageSize(String size) => state = state.copyWith(imageSize: size);
  void setStyle(String prompt, String preset) =>
      state = state.copyWith(stylePrompt: prompt, stylePreset: preset);

  void setTranscribing(bool v) => state = state.copyWith(isTranscribing: v);
  void setTranscript(List<TranscriptSegment> t) =>
      state = state.copyWith(transcript: t, isTranscribing: false);

  void setChapters(List<Map<String, dynamic>> c) =>
      state = state.copyWith(chapters: c);

  void setGeneratingStoryboard(bool v) =>
      state = state.copyWith(isGeneratingStoryboard: v);
  void setScenes(List<Scene> s) =>
      state = state.copyWith(scenes: s, isGeneratingStoryboard: false);

  void updateScene(int index, Scene scene) {
    final updated = List<Scene>.from(state.scenes);
    updated[index] = scene;
    state = state.copyWith(scenes: updated);
  }

  void setGeneratingImages(bool v) =>
      state = state.copyWith(isGeneratingImages: v);
  void updateImageProgress(int generated, int total) =>
      state = state.copyWith(imagesGenerated: generated, imagesToGenerate: total);
  void setPaused(bool v) => state = state.copyWith(generatePaused: v);

  void setGeneratingVoiceover(bool v) =>
      state = state.copyWith(isGeneratingVoiceover: v);
  void setGeneratedTracks(List<LanguageTrack> tracks) =>
      state = state.copyWith(generatedTracks: tracks, isGeneratingVoiceover: false);

  void setRecordingSession(RecordingSession session) =>
      state = state.copyWith(recordingSession: session);

  void setError(String msg) => state = state.copyWith(error: msg);
  void clearError() => state = state.copyWith(clearError: true);

  void reset() => state = const CreateState();
}

final createProvider =
    StateNotifierProvider<CreateNotifier, CreateState>((ref) {
  return CreateNotifier();
});
