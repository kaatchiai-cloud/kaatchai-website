import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:file_picker/file_picker.dart';
import 'package:path_provider/path_provider.dart';
import '../../../core/theme/colors.dart';
import '../../../core/utils/time_format.dart';
import '../../../providers/create_provider.dart';
import '../../../services/api/tts_service.dart';
import '../../../services/storage/secure_storage.dart';

class InputStep extends ConsumerWidget {
  const InputStep({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final create = ref.watch(createProvider);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Input',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
          const SizedBox(height: 4),
          const Text('Choose how to provide content for your video.',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
          const SizedBox(height: 16),

          // Mode tabs
          Row(
            children: [
              _ModeTab(
                icon: Icons.mic_rounded,
                label: 'Voice',
                isActive: create.inputMode == 'voice',
                onTap: () => ref.read(createProvider.notifier).setInputMode('voice'),
              ),
              const SizedBox(width: 8),
              _ModeTab(
                icon: Icons.podcasts_rounded,
                label: 'Podcast',
                isActive: create.inputMode == 'podcast',
                onTap: () => ref.read(createProvider.notifier).setInputMode('podcast'),
              ),
              const SizedBox(width: 8),
              _ModeTab(
                icon: Icons.text_fields_rounded,
                label: 'Text',
                isActive: create.inputMode == 'text',
                onTap: () => ref.read(createProvider.notifier).setInputMode('text'),
              ),
            ],
          ),
          const SizedBox(height: 20),

          // Mode-specific content
          if (create.inputMode == 'text')
            _TextInput()
          else
            _AudioInput(isPodcast: create.inputMode == 'podcast'),

          // Show loaded audio info
          if (create.audioFilePath != null && create.audioFilePath!.isNotEmpty) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.greenSoft,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  const Icon(Icons.check_circle, color: AppColors.green, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Audio ready (${fmtLong(create.audioDuration)})',
                      style: const TextStyle(color: AppColors.green, fontSize: 13),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _ModeTab extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool isActive;
  final VoidCallback onTap;

  const _ModeTab({
    required this.icon,
    required this.label,
    required this.isActive,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            color: isActive ? AppColors.accent : AppColors.bgCard,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: isActive ? AppColors.accent : AppColors.border,
            ),
          ),
          child: Column(
            children: [
              Icon(icon, size: 22, color: isActive ? Colors.white : AppColors.textMuted),
              const SizedBox(height: 4),
              Text(label, style: TextStyle(
                color: isActive ? Colors.white : AppColors.textSecondary,
                fontSize: 12, fontWeight: isActive ? FontWeight.w600 : FontWeight.w400)),
            ],
          ),
        ),
      ),
    );
  }
}

class _AudioInput extends ConsumerWidget {
  final bool isPodcast;
  const _AudioInput({this.isPodcast = false});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      children: [
        GestureDetector(
          onTap: () => _pickAudio(ref),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 32),
            decoration: BoxDecoration(
              color: AppColors.bgCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.border),
            ),
            child: Column(
              children: [
                Icon(isPodcast ? Icons.podcasts : Icons.audio_file_rounded,
                    size: 40, color: AppColors.accent),
                const SizedBox(height: 8),
                Text(isPodcast ? 'Upload Podcast Audio' : 'Upload Audio File',
                    style: const TextStyle(color: AppColors.textPrimary, fontSize: 14, fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                const Text('MP3, WAV, M4A, OGG',
                    style: TextStyle(color: AppColors.textMuted, fontSize: 11)),
              ],
            ),
          ),
        ),
        if (isPodcast) ...[
          const SizedBox(height: 12),
          const Text(
            'Podcast mode enables chapter splitting and speaker PiP overlay.',
            style: TextStyle(color: AppColors.textMuted, fontSize: 11),
          ),
        ],
      ],
    );
  }

  Future<void> _pickAudio(WidgetRef ref) async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: isPodcast
            ? ['mp3', 'wav', 'm4a', 'ogg', 'aac', 'mp4', 'mov', 'webm']
            : ['mp3', 'wav', 'm4a', 'ogg', 'aac', 'flac'],
        allowMultiple: false,
      );
      if (result != null && result.files.isNotEmpty) {
        final file = result.files.first;
        final path = file.path;
        if (path != null) {
          final sizeBytes = file.size;
          final estimatedDuration = sizeBytes / (128 * 1024 / 8);
          ref.read(createProvider.notifier).setAudio(
            path, estimatedDuration.clamp(1.0, 7200.0));
        }
      }
    } catch (e) {
      debugPrint('File picker error: $e');
    }
  }
}

/// Text input with TTS generation
/// In the web app, TTS is generated HERE in Step 2 before proceeding
class _TextInput extends ConsumerStatefulWidget {
  @override
  ConsumerState<_TextInput> createState() => _TextInputState();
}

class _TextInputState extends ConsumerState<_TextInput> {
  bool _generating = false;
  String _selectedVoice = 'Kore';
  String? _error;

  @override
  Widget build(BuildContext context) {
    final create = ref.watch(createProvider);
    final hasAudio = create.audioFilePath != null && create.audioFilePath!.isNotEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Type or paste your script:',
            style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
        const SizedBox(height: 8),
        TextField(
          maxLines: 6,
          style: const TextStyle(color: AppColors.textPrimary, fontSize: 14, height: 1.5),
          decoration: const InputDecoration(
            hintText: 'Enter your script here...',
          ),
          onChanged: (v) => ref.read(createProvider.notifier).setInputText(v),
        ),
        const SizedBox(height: 8),
        Text(
          '${create.inputText.split(RegExp(r'\s+')).where((w) => w.isNotEmpty).length} words',
          style: const TextStyle(color: AppColors.textMuted, fontSize: 11),
        ),

        if (create.inputText.isNotEmpty && !hasAudio) ...[
          const SizedBox(height: 16),

          // Voice selection
          const Text('Voice', style: TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: TtsService.geminiVoices.map((voice) {
              final isSelected = voice == _selectedVoice;
              return GestureDetector(
                onTap: () => setState(() => _selectedVoice = voice),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: isSelected ? AppColors.accent : AppColors.bgElevated,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: isSelected ? AppColors.accent : AppColors.border),
                  ),
                  child: Text(voice, style: TextStyle(
                    color: isSelected ? Colors.white : AppColors.textSecondary,
                    fontSize: 11, fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400)),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 12),

          // Generate TTS button
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _generating ? null : () => _generateTts(ref, create),
              icon: _generating
                  ? const SizedBox(width: 16, height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.record_voice_over),
              label: Text(_generating ? 'Generating audio...' : 'Generate Audio'),
            ),
          ),

          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!, style: const TextStyle(color: AppColors.red, fontSize: 11)),
          ],

          const SizedBox(height: 6),
          const Text(
            'Generates speech from your text using Gemini TTS. Audio duration determines scene timing.',
            style: TextStyle(color: AppColors.textMuted, fontSize: 10),
          ),
        ],
      ],
    );
  }

  Future<void> _generateTts(WidgetRef ref, CreateState create) async {
    setState(() { _generating = true; _error = null; });

    try {
      final storage = SecureStorageService();
      final apiKey = await storage.getActiveKey();
      if (apiKey == null || apiKey.isEmpty) {
        setState(() { _generating = false; _error = 'No API key. Set it in Step 1.'; });
        return;
      }

      final tts = TtsService();
      final base64Audio = await tts.generateWithGeminiTts(
        text: create.inputText,
        voiceName: _selectedVoice,
        apiKey: apiKey,
      );

      if (base64Audio == null) {
        setState(() { _generating = false; _error = 'No audio returned from TTS.'; });
        return;
      }

      // Save audio to file
      final dir = await _getTempDir();
      final audioPath = '$dir/tts_${DateTime.now().millisecondsSinceEpoch}.wav';
      final bytes = _base64ToBytes(base64Audio);
      await _writeFile(audioPath, bytes);

      // Estimate duration from file size (24kHz 16-bit mono PCM)
      // Gemini TTS returns raw PCM at 24kHz
      final durationSec = bytes.length / (24000 * 2); // 24kHz, 16-bit

      ref.read(createProvider.notifier).setAudio(audioPath, durationSec.clamp(1.0, 7200.0));
      setState(() { _generating = false; });
    } catch (e) {
      setState(() { _generating = false; _error = 'TTS failed: $e'; });
    }
  }

  Future<String> _getTempDir() async {
    final dir = await getApplicationDocumentsDirectory();
    final ttsDir = '${dir.path}/tts_audio';
    await Directory(ttsDir).create(recursive: true);
    return ttsDir;
  }

  List<int> _base64ToBytes(String base64) {
    return base64Decode(base64);
  }

  Future<void> _writeFile(String path, List<int> bytes) async {
    await File(path).writeAsBytes(bytes);
  }
}

