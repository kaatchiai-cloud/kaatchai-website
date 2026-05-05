import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/colors.dart';
import '../../../core/utils/time_format.dart';
import '../../../models/scene.dart';
import '../../../providers/create_provider.dart';
import '../../../services/api/gemini_service.dart';
import '../../../services/storage/secure_storage.dart';

class StoryboardStep extends ConsumerWidget {
  const StoryboardStep({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final create = ref.watch(createProvider);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Storyboard',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
          const SizedBox(height: 4),
          const Text('AI generates scene descriptions for image creation.',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
          const SizedBox(height: 16),

          // Generate button
          if (!create.hasScenes && !create.isGeneratingStoryboard)
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: create.hasTranscript
                    ? () => _generateStoryboard(context, ref, create)
                    : null,
                icon: const Icon(Icons.auto_stories),
                label: Text(create.hasTranscript
                    ? 'Generate Storyboard'
                    : 'Transcribe first (Step 4)'),
              ),
            ),

          // No transcript warning
          if (!create.hasTranscript && !create.isGeneratingStoryboard)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.amberSoft,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.info_outline, size: 14, color: AppColors.amber),
                    SizedBox(width: 8),
                    Text('Go to Step 4 to transcribe first',
                        style: TextStyle(color: AppColors.amber, fontSize: 11)),
                  ],
                ),
              ),
            ),

          if (create.isGeneratingStoryboard)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: Column(
                  children: [
                    CircularProgressIndicator(color: AppColors.accent),
                    SizedBox(height: 12),
                    Text('Generating scenes...', style: TextStyle(color: AppColors.textSecondary)),
                    SizedBox(height: 4),
                    Text('AI is creating image prompts from your transcript',
                        style: TextStyle(color: AppColors.textMuted, fontSize: 11)),
                  ],
                ),
              ),
            ),

          // Scene cards
          if (create.hasScenes) ...[
            Row(
              children: [
                Text('${create.scenes.length} scenes',
                    style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                const Spacer(),
                TextButton.icon(
                  onPressed: () => _generateStoryboard(context, ref, create),
                  icon: const Icon(Icons.refresh, size: 14),
                  label: const Text('Regenerate', style: TextStyle(fontSize: 12)),
                ),
              ],
            ),
            const SizedBox(height: 8),

            ...List.generate(create.scenes.length, (i) {
              final scene = create.scenes[i];
              return Container(
                margin: const EdgeInsets.only(bottom: 10),
                decoration: BoxDecoration(
                  color: AppColors.bgCard,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppColors.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Scene header
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: const BoxDecoration(
                        border: Border(bottom: BorderSide(color: AppColors.border)),
                      ),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppColors.accentSoft,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text('Scene ${i + 1}',
                                style: const TextStyle(color: AppColors.accent, fontSize: 10, fontWeight: FontWeight.w600)),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            '${fmtShort(scene.startTime)} - ${fmtShort(scene.endTime)}',
                            style: const TextStyle(color: AppColors.textMuted, fontSize: 10,
                                fontFeatures: [FontFeature.tabularFigures()]),
                          ),
                        ],
                      ),
                    ),

                    // Prompt + narration
                    Padding(
                      padding: const EdgeInsets.all(10),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Image Prompt:',
                              style: TextStyle(color: AppColors.textMuted, fontSize: 10)),
                          const SizedBox(height: 4),
                          Text(scene.prompt,
                              style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, height: 1.4)),
                          if (scene.text.isNotEmpty) ...[
                            const SizedBox(height: 8),
                            const Text('Narration:',
                                style: TextStyle(color: AppColors.textMuted, fontSize: 10)),
                            const SizedBox(height: 2),
                            Text(scene.text,
                                style: const TextStyle(color: AppColors.textPrimary, fontSize: 11, height: 1.4)),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              );
            }),
          ],
        ],
      ),
    );
  }

  Future<void> _generateStoryboard(BuildContext context, WidgetRef ref, CreateState create) async {
    ref.read(createProvider.notifier).setGeneratingStoryboard(true);
    ref.read(createProvider.notifier).clearError();

    try {
      final storage = SecureStorageService();
      final apiKey = await storage.getActiveKey();

      if (apiKey == null || apiKey.isEmpty) {
        ref.read(createProvider.notifier).setGeneratingStoryboard(false);
        ref.read(createProvider.notifier).setError('No API key. Go back to Step 1.');
        return;
      }

      final isTextMode = create.audioFilePath == null;

      if (isTextMode) {
        // Text mode: segments already exist from Step 4
        // Call Gemini to generate scene descriptions for each
        final segTexts = List.generate(create.transcript.length, (i) =>
          'Segment ${i + 1}: "${create.transcript[i].text}"'
        ).join('\n');

        final gemini = GeminiService();
        final result = await gemini.generateSceneDescriptions(
          segmentedText: segTexts,
          stylePrompt: create.stylePrompt.isNotEmpty ? create.stylePrompt : 'cinematic photography',
          apiKey: apiKey,
        );

        // Parse scene descriptions and create scenes
        final scenes = _parseTextModeScenes(result, create);
        ref.read(createProvider.notifier).setScenes(scenes);
      } else {
        // Audio mode: segments already have sceneDescriptions from transcription
        // Convert transcript segments to scenes
        final scenes = create.transcript.map((seg) => Scene(
          prompt: seg.sceneDescription?.isNotEmpty == true
              ? '${create.stylePrompt.isNotEmpty ? '${create.stylePrompt}. ' : ''}${seg.sceneDescription}'
              : '${create.stylePrompt.isNotEmpty ? '${create.stylePrompt}. ' : ''}Visual scene for: ${seg.text}',
          startTime: seg.startTime,
          endTime: seg.endTime,
          text: seg.text,
        )).toList();
        ref.read(createProvider.notifier).setScenes(scenes);
      }
    } catch (e) {
      ref.read(createProvider.notifier).setGeneratingStoryboard(false);
      ref.read(createProvider.notifier).setError('Storyboard failed: $e');
    }
  }

  /// Parse scene descriptions returned by Gemini for text-mode segments
  List<Scene> _parseTextModeScenes(String result, CreateState create) {
    final stylePrefix = create.stylePrompt.isNotEmpty ? '${create.stylePrompt}. ' : '';

    try {
      final jsonMatch = RegExp(r'\[[\s\S]*\]').firstMatch(result);
      if (jsonMatch != null) {
        final list = jsonDecode(jsonMatch.group(0)!) as List;
        // Match descriptions to original segments
        return List.generate(create.transcript.length, (i) {
          final desc = i < list.length
              ? (list[i]['sceneDescription'] as String? ?? '')
              : '';
          return Scene(
            prompt: desc.isNotEmpty ? '$stylePrefix$desc' : '${stylePrefix}Visual scene for: ${create.transcript[i].text}',
            startTime: 0,
            endTime: 0,
            text: create.transcript[i].text,
          );
        });
      }
    } catch (_) {}

    // Fallback: use transcript text as prompt basis
    return create.transcript.map((seg) => Scene(
      prompt: '${stylePrefix}Visual scene for: ${seg.text}',
      startTime: 0,
      endTime: 0,
      text: seg.text,
    )).toList();
  }
}
