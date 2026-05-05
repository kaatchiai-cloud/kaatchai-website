import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import '../../../core/theme/colors.dart';
import '../../../models/scene.dart';
import '../../../providers/create_provider.dart';
import '../../../services/api/image_gen_service.dart';
import '../../../services/storage/secure_storage.dart';

class ImageGenStep extends ConsumerWidget {
  const ImageGenStep({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final create = ref.watch(createProvider);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Generate Images',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
          const SizedBox(height: 4),
          Text(
            create.scenes.isNotEmpty
                ? 'Generate ${create.scenes.length} images from scene prompts.'
                : 'Create a storyboard first (Step 6).',
            style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
          ),
          const SizedBox(height: 4),
          Text(
            create.activeTier == 'free'
                ? 'Free tier: Gemini Flash Image (2/min limit)'
                : 'Paid tier: Imagen 4 (faster, higher quality)',
            style: const TextStyle(color: AppColors.textMuted, fontSize: 11),
          ),
          const SizedBox(height: 16),

          // Progress bar
          if (create.isGeneratingImages || create.imagesGenerated > 0) ...[
            Row(
              children: [
                Text(
                  '${create.imagesGenerated} / ${create.imagesToGenerate}',
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 12,
                      fontFeatures: [FontFeature.tabularFigures()]),
                ),
                const Spacer(),
                Text(
                  '${(create.imageProgress * 100).round()}%',
                  style: const TextStyle(color: AppColors.accent, fontSize: 12, fontWeight: FontWeight.w600),
                ),
              ],
            ),
            const SizedBox(height: 6),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: create.imageProgress,
                backgroundColor: AppColors.bgElevated,
                valueColor: const AlwaysStoppedAnimation(AppColors.accent),
                minHeight: 6,
              ),
            ),
            const SizedBox(height: 16),
          ],

          // Action buttons
          if (!create.isGeneratingImages && !create.allImagesGenerated)
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: create.scenes.isNotEmpty
                    ? () => _startGeneration(context, ref, create)
                    : null,
                icon: const Icon(Icons.image_rounded),
                label: Text(create.imagesGenerated > 0
                    ? 'Continue Generation'
                    : 'Generate ${create.scenes.length} Images'),
              ),
            ),

          if (create.isGeneratingImages)
            Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: OutlinedButton.icon(
                  onPressed: () => ref.read(createProvider.notifier).setPaused(!create.generatePaused),
                  icon: Icon(create.generatePaused ? Icons.play_arrow : Icons.pause, size: 16),
                  label: Text(create.generatePaused ? 'Resume' : 'Pause',
                      style: const TextStyle(fontSize: 12)),
                ),
              ),
            ),

          if (create.allImagesGenerated)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.greenSoft,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Row(
                children: [
                  Icon(Icons.check_circle, color: AppColors.green, size: 18),
                  SizedBox(width: 8),
                  Text('All images generated!',
                      style: TextStyle(color: AppColors.green, fontSize: 13, fontWeight: FontWeight.w600)),
                ],
              ),
            ),

          const SizedBox(height: 16),

          // Scene image grid
          if (create.scenes.isNotEmpty)
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 8,
                crossAxisSpacing: 8,
                childAspectRatio: 16 / 9,
              ),
              itemCount: create.scenes.length,
              itemBuilder: (context, i) {
                final scene = create.scenes[i];
                return Container(
                  decoration: BoxDecoration(
                    color: AppColors.bgElevated,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: scene.status == 'done'
                          ? AppColors.green.withAlpha(77)
                          : scene.status == 'error'
                              ? AppColors.red.withAlpha(77)
                              : AppColors.border,
                    ),
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(7),
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        // Show generated image
                        if (scene.imagePath != null && scene.status == 'done')
                          Image.file(File(scene.imagePath!), fit: BoxFit.cover,
                              errorBuilder: (c, e, s) => _statusIcon(scene.status))
                        else
                          _statusIcon(scene.status),

                        // Scene number overlay
                        Positioned(
                          top: 4,
                          left: 4,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                            decoration: BoxDecoration(
                              color: Colors.black54,
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text('${i + 1}',
                                style: const TextStyle(color: Colors.white, fontSize: 9)),
                          ),
                        ),

                        // Retry button on error
                        if (scene.status == 'error')
                          Positioned(
                            bottom: 4,
                            right: 4,
                            child: GestureDetector(
                              onTap: () => _retrySingle(ref, create, i),
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                                decoration: BoxDecoration(
                                  color: AppColors.red,
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: const Text('Retry', style: TextStyle(color: Colors.white, fontSize: 9)),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                );
              },
            ),
        ],
      ),
    );
  }

  Widget _statusIcon(String status) {
    switch (status) {
      case 'done':
        return const Center(child: Icon(Icons.check, color: AppColors.green, size: 24));
      case 'error':
        return const Center(child: Icon(Icons.error_outline, color: AppColors.red, size: 24));
      default:
        return const Center(child: Icon(Icons.image_rounded, color: AppColors.textMuted, size: 24));
    }
  }

  Future<void> _startGeneration(BuildContext context, WidgetRef ref, CreateState create) async {
    final storage = SecureStorageService();
    final apiKey = await storage.getActiveKey();

    if (apiKey == null || apiKey.isEmpty) {
      ref.read(createProvider.notifier).setError('No API key. Go back to Step 1.');
      return;
    }

    ref.read(createProvider.notifier).setGeneratingImages(true);
    ref.read(createProvider.notifier).updateImageProgress(0, create.scenes.length);
    ref.read(createProvider.notifier).clearError();

    final imageService = ImageGenService();
    final dir = await getApplicationDocumentsDirectory();
    final imgDir = '${dir.path}/generated_images';
    await Directory(imgDir).create(recursive: true);

    // Parse dimensions from imageSize
    final parts = create.imageSize.split('x');
    final width = int.tryParse(parts[0]) ?? 1280;
    final height = int.tryParse(parts[1]) ?? 720;

    int generated = create.imagesGenerated;

    for (int i = 0; i < create.scenes.length; i++) {
      final scene = create.scenes[i];
      if (scene.status == 'done') {
        generated++;
        ref.read(createProvider.notifier).updateImageProgress(generated, create.scenes.length);
        continue;
      }

      // Check paused
      while (ref.read(createProvider).generatePaused) {
        await Future.delayed(const Duration(milliseconds: 500));
        if (!ref.read(createProvider).isGeneratingImages) return;
      }

      try {
        String? base64Image;

        if (create.activeTier == 'paid') {
          base64Image = await imageService.generateWithImagen(
            prompt: scene.prompt,
            apiKey: apiKey,
            width: width,
            height: height,
          );
        } else {
          base64Image = await imageService.generateWithGeminiFlash(
            prompt: scene.prompt,
            apiKey: apiKey,
            width: width,
            height: height,
          );
        }

        if (base64Image != null) {
          // Save image to file
          final imgPath = '$imgDir/scene_${i}_${DateTime.now().millisecondsSinceEpoch}.png';
          final imgBytes = base64Decode(base64Image);
          await File(imgPath).writeAsBytes(imgBytes);

          ref.read(createProvider.notifier).updateScene(i, Scene(
            prompt: scene.prompt,
            startTime: scene.startTime,
            endTime: scene.endTime,
            text: scene.text,
            imagePath: imgPath,
            status: 'done',
          ));
        } else {
          ref.read(createProvider.notifier).updateScene(i, Scene(
            prompt: scene.prompt,
            startTime: scene.startTime,
            endTime: scene.endTime,
            text: scene.text,
            status: 'error',
          ));
        }
      } catch (e) {
        ref.read(createProvider.notifier).updateScene(i, Scene(
          prompt: scene.prompt,
          startTime: scene.startTime,
          endTime: scene.endTime,
          text: scene.text,
          status: 'error',
        ));
      }

      generated++;
      ref.read(createProvider.notifier).updateImageProgress(generated, create.scenes.length);

      // Rate limiting for free tier (2 per minute)
      if (create.activeTier == 'free' && i < create.scenes.length - 1) {
        await Future.delayed(const Duration(seconds: 32));
      }
    }

    ref.read(createProvider.notifier).setGeneratingImages(false);
  }

  Future<void> _retrySingle(WidgetRef ref, CreateState create, int index) async {
    final storage = SecureStorageService();
    final apiKey = await storage.getActiveKey();
    if (apiKey == null || apiKey.isEmpty) return;

    final scene = create.scenes[index];
    ref.read(createProvider.notifier).updateScene(index, Scene(
      prompt: scene.prompt,
      startTime: scene.startTime,
      endTime: scene.endTime,
      text: scene.text,
      status: 'pending',
    ));

    try {
      final imageService = ImageGenService();
      final parts = create.imageSize.split('x');
      final width = int.tryParse(parts[0]) ?? 1280;
      final height = int.tryParse(parts[1]) ?? 720;

      String? base64Image;
      if (create.activeTier == 'paid') {
        base64Image = await imageService.generateWithImagen(
          prompt: scene.prompt, apiKey: apiKey, width: width, height: height);
      } else {
        base64Image = await imageService.generateWithGeminiFlash(
          prompt: scene.prompt, apiKey: apiKey, width: width, height: height);
      }

      if (base64Image != null) {
        final dir = await getApplicationDocumentsDirectory();
        final imgPath = '${dir.path}/generated_images/scene_${index}_retry.png';
        await File(imgPath).writeAsBytes(base64Decode(base64Image));

        ref.read(createProvider.notifier).updateScene(index, Scene(
          prompt: scene.prompt, startTime: scene.startTime,
          endTime: scene.endTime, text: scene.text,
          imagePath: imgPath, status: 'done',
        ));
      } else {
        ref.read(createProvider.notifier).updateScene(index, Scene(
          prompt: scene.prompt, startTime: scene.startTime,
          endTime: scene.endTime, text: scene.text, status: 'error',
        ));
      }
    } catch (e) {
      ref.read(createProvider.notifier).updateScene(index, Scene(
        prompt: scene.prompt, startTime: scene.startTime,
        endTime: scene.endTime, text: scene.text, status: 'error',
      ));
    }
  }
}
