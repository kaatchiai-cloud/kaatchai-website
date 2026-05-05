import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/colors.dart';
import '../../../core/utils/time_format.dart';
import '../../../models/scene.dart';
import '../../../providers/create_provider.dart';
import '../../../services/api/gemini_service.dart';
import '../../../services/storage/secure_storage.dart';

/// Step 4: Transcribe / Generate Storyboard
///
/// Web app flow:
/// - Audio mode: Gemini transcribes audio → segments with text + timing + sceneDescription (all in one call)
/// - Text mode: Segment text by sentences using TTS audio duration → Gemini generates sceneDescriptions
///
/// This is THE step that produces createScenes. The "Storyboard" step (6) just displays/edits them.
class TranscribeStep extends ConsumerWidget {
  const TranscribeStep({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final create = ref.watch(createProvider);
    final isTextMode = create.inputText.isNotEmpty;
    final hasAudio = create.audioFilePath != null && create.audioFilePath!.isNotEmpty;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            isTextMode ? 'Generate Storyboard' : 'Transcribe Audio',
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
          ),
          const SizedBox(height: 4),
          Text(
            isTextMode
                ? 'AI will segment your text and create visual scene descriptions.'
                : 'AI will transcribe audio into timed scenes with image prompts.',
            style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
          ),
          const SizedBox(height: 16),

          // Pre-requisite check
          if (!hasAudio)
            _chip(Icons.warning_amber,
              isTextMode ? 'Generate audio first in Step 2' : 'Upload audio in Step 2',
              AppColors.amber)
          else if (create.hasScenes)
            _chip(Icons.check_circle, '${create.scenes.length} scenes ready', AppColors.green)
          else if (!create.isTranscribing)
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () => _run(context, ref, create, isTextMode),
                icon: const Icon(Icons.auto_awesome),
                label: Text(isTextMode ? 'Generate Storyboard' : 'Transcribe & Generate Scenes'),
              ),
            ),

          // Loading
          if (create.isTranscribing)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: Column(
                  children: [
                    CircularProgressIndicator(color: AppColors.accent),
                    SizedBox(height: 12),
                    Text('Generating scenes...', style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                    SizedBox(height: 4),
                    Text('This may take a moment', style: TextStyle(color: AppColors.textMuted, fontSize: 11)),
                  ],
                ),
              ),
            ),

          // Show scenes
          if (create.hasScenes) ...[
            const SizedBox(height: 4),
            Row(
              children: [
                const Spacer(),
                GestureDetector(
                  onTap: () {
                    ref.read(createProvider.notifier).setScenes([]);
                    ref.read(createProvider.notifier).setTranscript([]);
                  },
                  child: const Text('Redo', style: TextStyle(color: AppColors.textMuted, fontSize: 11)),
                ),
              ],
            ),
            const SizedBox(height: 8),
            ...List.generate(create.scenes.length, (i) {
              final scene = create.scenes[i];
              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.bgCard,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppColors.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(color: AppColors.accentSoft, borderRadius: BorderRadius.circular(6)),
                          child: Text('Scene ${i + 1}', style: const TextStyle(color: AppColors.accent, fontSize: 10, fontWeight: FontWeight.w600)),
                        ),
                        const SizedBox(width: 8),
                        Text('${fmtShort(scene.startTime)} – ${fmtShort(scene.endTime)}',
                            style: const TextStyle(color: AppColors.textMuted, fontSize: 10,
                                fontFeatures: [FontFeature.tabularFigures()])),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(scene.text, style: const TextStyle(color: AppColors.textPrimary, fontSize: 12, height: 1.4)),
                    const SizedBox(height: 4),
                    Text(scene.prompt, style: const TextStyle(color: AppColors.textMuted, fontSize: 10, fontStyle: FontStyle.italic, height: 1.3)),
                  ],
                ),
              );
            }),
          ],
        ],
      ),
    );
  }

  Widget _chip(IconData icon, String label, Color color) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: color.withAlpha(26), borderRadius: BorderRadius.circular(8)),
      child: Row(children: [
        Icon(icon, size: 14, color: color), const SizedBox(width: 8),
        Expanded(child: Text(label, style: TextStyle(color: color, fontSize: 12))),
      ]),
    );
  }

  Future<void> _run(BuildContext context, WidgetRef ref, CreateState create, bool isTextMode) async {
    ref.read(createProvider.notifier).setTranscribing(true);
    ref.read(createProvider.notifier).clearError();

    try {
      final storage = SecureStorageService();
      final apiKey = await storage.getActiveKey();
      if (apiKey == null || apiKey.isEmpty) {
        throw Exception('No API key. Go back to Step 1.');
      }

      List<Scene> scenes;
      if (isTextMode) {
        scenes = await _textModeGenerate(create, apiKey);
      } else {
        scenes = await _audioModeTranscribe(create, apiKey);
      }

      if (scenes.isEmpty) throw Exception('No scenes generated. Try again.');

      ref.read(createProvider.notifier).setScenes(scenes);
      // Also store as transcript for compatibility
      ref.read(createProvider.notifier).setTranscript(
        scenes.map((s) => TranscriptSegment(
          startTime: s.startTime, endTime: s.endTime,
          text: s.text, sceneDescription: s.prompt,
        )).toList(),
      );
    } catch (e) {
      ref.read(createProvider.notifier).setError('$e');
    } finally {
      ref.read(createProvider.notifier).setTranscribing(false);
    }
  }

  /// Text mode: segment text + generate scene descriptions in one step
  Future<List<Scene>> _textModeGenerate(CreateState create, String apiKey) async {
    final text = create.inputText;
    final audioDuration = create.audioDuration;
    final stylePrompt = create.stylePrompt.isNotEmpty ? create.stylePrompt : 'cinematic photography';

    // 1. Segment text by sentences proportional to audio duration
    final sentences = text.split(RegExp(r'(?<=[.!?।\n])\s*'))
        .where((s) => s.trim().isNotEmpty).map((s) => s.trim()).toList();
    if (sentences.isEmpty) throw Exception('No text to process');

    final totalChars = sentences.fold<int>(0, (sum, s) => sum + s.length);
    final segments = <_TextSegment>[];
    double currentTime = 0;

    for (final s in sentences) {
      double dur = (s.length / totalChars) * audioDuration;
      dur = dur.clamp(2.0, 15.0);
      segments.add(_TextSegment(s, currentTime, currentTime + dur));
      currentTime += dur;
    }

    // Merge short segments
    final merged = <_TextSegment>[];
    for (final seg in segments) {
      if (merged.isNotEmpty && (seg.end - seg.start) < 3) {
        merged[merged.length - 1] = _TextSegment(
          '${merged.last.text} ${seg.text}', merged.last.start, seg.end);
      } else {
        merged.add(seg);
      }
    }
    if (merged.isNotEmpty) {
      merged[merged.length - 1] = _TextSegment(merged.last.text, merged.last.start, audioDuration);
    }

    // 2. Call Gemini for scene descriptions
    final segTexts = List.generate(merged.length, (i) =>
      'Segment ${i + 1} [${merged[i].start.toStringAsFixed(1)}s – ${merged[i].end.toStringAsFixed(1)}s]: "${merged[i].text}"'
    ).join('\n');

    final gemini = GeminiService();
    final result = await gemini.generateSceneDescriptions(
      segmentedText: segTexts,
      stylePrompt: stylePrompt,
      apiKey: apiKey,
    );

    // 3. Parse and combine
    List<Map<String, dynamic>> descriptions = [];
    try {
      final jsonMatch = RegExp(r'\[[\s\S]*\]').firstMatch(result);
      if (jsonMatch != null) {
        descriptions = (jsonDecode(jsonMatch.group(0)!) as List).cast<Map<String, dynamic>>();
      }
    } catch (_) {}

    return List.generate(merged.length, (i) {
      final desc = i < descriptions.length
          ? (descriptions[i]['sceneDescription'] as String? ?? '')
          : '';
      return Scene(
        prompt: desc.isNotEmpty ? '$stylePrompt. $desc' : '$stylePrompt. Visual scene for: ${merged[i].text}',
        startTime: merged[i].start,
        endTime: merged[i].end,
        text: merged[i].text,
      );
    });
  }

  /// Audio mode: Gemini transcribes + generates scene descriptions
  Future<List<Scene>> _audioModeTranscribe(CreateState create, String apiKey) async {
    final file = File(create.audioFilePath!);
    final bytes = await file.readAsBytes();
    final base64Audio = base64Encode(bytes);
    final ext = create.audioFilePath!.split('.').last.toLowerCase();
    final mimeType = _getMimeType(ext);
    final stylePrompt = create.stylePrompt.isNotEmpty ? create.stylePrompt : 'cinematic photography';

    final gemini = GeminiService();
    final result = await gemini.transcribe(
      audioBase64: base64Audio, mimeType: mimeType, apiKey: apiKey);

    // Parse JSON response
    try {
      final jsonMatch = RegExp(r'\[[\s\S]*\]').firstMatch(result);
      if (jsonMatch != null) {
        final list = jsonDecode(jsonMatch.group(0)!) as List;
        return list.map((item) => Scene(
          prompt: '$stylePrompt. ${item['sceneDescription'] ?? 'Visual scene for: ${item['text']}'}',
          startTime: (item['startTime'] as num?)?.toDouble() ?? 0,
          endTime: (item['endTime'] as num?)?.toDouble() ?? 0,
          text: (item['text'] as String?) ?? '',
        )).where((s) => s.text.isNotEmpty).toList();
      }
    } catch (_) {}

    throw Exception('Could not parse transcription result');
  }

  String _getMimeType(String ext) {
    switch (ext) {
      case 'mp3': return 'audio/mpeg';
      case 'wav': return 'audio/wav';
      case 'm4a': return 'audio/mp4';
      case 'ogg': return 'audio/ogg';
      default: return 'audio/mpeg';
    }
  }
}

class _TextSegment {
  final String text;
  final double start;
  final double end;
  _TextSegment(this.text, this.start, this.end);
}
