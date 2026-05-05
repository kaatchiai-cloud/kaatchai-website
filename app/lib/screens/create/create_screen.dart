import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/colors.dart';
import '../../models/models.dart';
import '../../providers/create_provider.dart';
import '../../providers/timeline_provider.dart';
import '../../providers/audio_provider.dart';
import '../../providers/project_provider.dart';
import '../../services/storage/file_service.dart';
import 'widgets/api_key_step.dart';
import 'widgets/input_step.dart';
import 'widgets/template_step.dart';
import 'widgets/transcribe_step.dart';
import 'widgets/storyboard_step.dart';
import 'widgets/image_gen_step.dart';
import 'widgets/review_step.dart';

class CreateScreen extends ConsumerWidget {
  const CreateScreen({super.key});

  static const _stepLabels = [
    'API Key',
    'Input',
    'Template',
    'Transcribe',
    'Chapters',
    'Storyboard',
    'Images',
    'Voiceover',
    'Review',
  ];

  static const _stepIcons = [
    Icons.key_rounded,
    Icons.mic_rounded,
    Icons.dashboard_rounded,
    Icons.subtitles_rounded,
    Icons.menu_book_rounded,
    Icons.auto_stories_rounded,
    Icons.image_rounded,
    Icons.record_voice_over_rounded,
    Icons.preview_rounded,
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final create = ref.watch(createProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Create Content'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () {
            if (create.currentStep > 0) {
              ref.read(createProvider.notifier).prevStep();
            } else {
              Navigator.pop(context);
            }
          },
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.save_outlined, size: 22),
            onPressed: () => _saveProject(context, ref, create),
            tooltip: 'Save Project',
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Step indicator
            _StepIndicator(
              steps: _stepLabels,
              icons: _stepIcons,
              currentStep: create.currentStep,
              onStepTap: (i) {
                if (i <= create.currentStep) {
                  ref.read(createProvider.notifier).setStep(i);
                }
              },
            ),

            // Error banner
            if (create.error != null)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                color: AppColors.redSoft,
                child: Row(
                  children: [
                    const Icon(Icons.error_outline, size: 16, color: AppColors.red),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(create.error!,
                          style: const TextStyle(color: AppColors.red, fontSize: 12)),
                    ),
                    GestureDetector(
                      onTap: () => ref.read(createProvider.notifier).clearError(),
                      child: const Icon(Icons.close, size: 14, color: AppColors.red),
                    ),
                  ],
                ),
              ),

            const Divider(height: 1),

            // Step content
            Expanded(
              child: _buildStepContent(context, ref, create),
            ),

            // Navigation buttons
            Container(
              padding: const EdgeInsets.all(16),
              decoration: const BoxDecoration(
                border: Border(top: BorderSide(color: AppColors.border)),
              ),
              child: Row(
                children: [
                  if (create.currentStep > 0)
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () =>
                            ref.read(createProvider.notifier).prevStep(),
                        child: const Text('Back'),
                      ),
                    ),
                  if (create.currentStep > 0) const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton(
                      onPressed: _canAdvance(create)
                          ? () => _handleNext(context, ref, create)
                          : null,
                      child: Text(
                        create.currentStep == 8 ? 'Open Editor' : 'Next',
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStepContent(BuildContext context, WidgetRef ref, CreateState create) {
    switch (create.currentStep) {
      case 0:
        return const ApiKeyStep();
      case 1:
        return const InputStep();
      case 2:
        return const TemplateStep();
      case 3:
        return const TranscribeStep();
      case 4:
        return _PlaceholderStep(title: 'Chapters', icon: Icons.menu_book_rounded,
            subtitle: 'Split podcast into chapters (podcast mode only)');
      case 5:
        return const StoryboardStep();
      case 6:
        return const ImageGenStep();
      case 7:
        return _PlaceholderStep(title: 'Voiceover', icon: Icons.record_voice_over_rounded,
            subtitle: 'Generate multi-language voiceover');
      case 8:
        return const ReviewStep();
      default:
        return const SizedBox();
    }
  }

  bool _canAdvance(CreateState create) {
    // Block during async operations
    if (create.isTranscribing || create.isGeneratingStoryboard || create.isGeneratingImages) {
      return false;
    }

    switch (create.currentStep) {
      case 0: // API Key — must have a key
        return create.hasApiKey;
      case 1: // Input — must have audio ready (TTS generated for text, or file uploaded for voice/podcast)
        return create.audioFilePath != null && create.audioFilePath!.isNotEmpty;
      case 2: // Template — always passable
        return true;
      case 3: // Transcribe — must have scenes generated
        return create.hasScenes;
      case 4: // Chapters — always passable (optional step)
        return true;
      case 5: // Storyboard — must have scenes
        return create.hasScenes;
      case 6: // Images — must have at least one image generated
        return create.scenes.any((s) => s.status == 'done');
      case 7: // Voiceover — always passable (optional)
        return true;
      case 8: // Review — must have scenes with images
        return create.scenes.any((s) => s.status == 'done');
      default:
        return true;
    }
  }

  void _handleNext(BuildContext context, WidgetRef ref, CreateState create) {
    if (create.currentStep < 8) {
      ref.read(createProvider.notifier).nextStep();
    } else {
      // Send to editor — transfer all create state to editor providers
      _sendToEditor(context, ref, create);
    }
  }

  Future<void> _saveProject(BuildContext context, WidgetRef ref, CreateState create) async {
    try {
      final fileService = FileService();
      await fileService.saveProject(
        name: 'Create - Step ${create.currentStep + 1}',
        audioFilePath: create.audioFilePath,
        audioDuration: create.audioDuration,
        sampleRate: 44100,
        channels: 1,
        photos: [],
        texts: [],
        subtitles: [],
        pipItems: [],
        nextPhotoId: 1,
        nextTextId: 1,
        imageSize: create.imageSize,
        exportQuality: 'balanced',
        exportFps: 24,
        stylePrompt: create.stylePrompt,
        stylePreset: create.stylePreset,
        selectedTemplate: create.selectedTemplate,
        transcript: create.transcript,
        scenes: create.scenes,
      );
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Project saved'),
            backgroundColor: Color(0xFF22c55e),
            duration: Duration(seconds: 2),
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Save failed: $e'),
            backgroundColor: const Color(0xFFef4444),
          ),
        );
      }
    }
  }

  void _sendToEditor(BuildContext context, WidgetRef ref, CreateState create) {
    // 1. Set audio
    if (create.audioFilePath != null && create.audioFilePath!.isNotEmpty) {
      ref.read(audioProvider.notifier).setAudio(create.audioFilePath!, create.audioDuration);
    }

    // 2. Add scenes as photo items on the timeline
    final timelineNotifier = ref.read(timelineProvider.notifier);
    timelineNotifier.clear();

    int photoId = 1;
    int subId = 1;
    for (final scene in create.scenes) {
      if (scene.imagePath != null && scene.status == 'done') {
        timelineNotifier.addPhoto(PhotoItem(
          id: photoId++,
          imagePath: scene.imagePath!,
          startTime: scene.startTime,
          duration: scene.endTime - scene.startTime,
          transition: 'fade',
          transDur: 0.5,
          motion: 'ken-burns',
        ));
      }

      // Add subtitle for each scene
      timelineNotifier.addSubtitle(SubtitleItem(
        id: subId++,
        text: scene.text,
        startTime: scene.startTime,
        duration: scene.endTime - scene.startTime,
      ));
    }

    // 3. Set project metadata
    ref.read(projectProvider.notifier).setImageSize(create.imageSize);
    ref.read(projectProvider.notifier).setStyle(create.stylePrompt, create.stylePreset);
    ref.read(projectProvider.notifier).setTemplate(create.selectedTemplate);

    // 4. Navigate to editor
    Navigator.pushReplacementNamed(context, '/editor');
  }
}

// ── Step Indicator ──

class _StepIndicator extends StatelessWidget {
  final List<String> steps;
  final List<IconData> icons;
  final int currentStep;
  final void Function(int) onStepTap;

  const _StepIndicator({
    required this.steps,
    required this.icons,
    required this.currentStep,
    required this.onStepTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: List.generate(steps.length, (i) {
            final isActive = i == currentStep;
            final isDone = i < currentStep;
            return Padding(
              padding: const EdgeInsets.only(right: 6),
              child: GestureDetector(
                onTap: isDone ? () => onStepTap(i) : null,
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: isActive
                        ? AppColors.accent
                        : isDone
                            ? AppColors.accentSoft
                            : AppColors.bgElevated,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (isDone)
                        const Padding(
                          padding: EdgeInsets.only(right: 3),
                          child: Icon(Icons.check, size: 12,
                              color: AppColors.accent),
                        )
                      else
                        Padding(
                          padding: const EdgeInsets.only(right: 3),
                          child: Icon(icons[i], size: 12,
                              color: isActive ? Colors.white : AppColors.textMuted),
                        ),
                      Text(
                        steps[i],
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: isActive ? FontWeight.w600 : FontWeight.w400,
                          color: isActive
                              ? Colors.white
                              : isDone
                                  ? AppColors.accent
                                  : AppColors.textMuted,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          }),
        ),
      ),
    );
  }
}

class _PlaceholderStep extends StatelessWidget {
  final String title;
  final IconData icon;
  final String subtitle;

  const _PlaceholderStep({
    required this.title,
    required this.icon,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 56, color: AppColors.accent),
          const SizedBox(height: 12),
          Text(title, style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: 6),
          Text(subtitle, style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
        ],
      ),
    );
  }
}
