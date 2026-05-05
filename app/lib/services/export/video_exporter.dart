import 'dart:io';
import 'dart:ui' as ui;
import '../ffmpeg_stub.dart';
import 'package:path_provider/path_provider.dart';
import '../../core/constants/api_endpoints.dart';
import '../../models/models.dart';
import 'frame_renderer.dart';

/// Video export pipeline via FFmpeg
/// Ported from 11-export.js — renders frames as PNGs then assembles with FFmpeg
class VideoExporter {
  void Function(double progress, String status)? onProgress;
  bool _cancelled = false;

  /// Export video to MP4
  /// Returns the output file path
  Future<String> export({
    required int width,
    required int height,
    required double duration,
    required int fps,
    required String quality, // 'fast', 'balanced', 'high'
    required List<PhotoItem> sortedPhotos,
    required List<TextItem> sortedTexts,
    required List<SubtitleItem> sortedSubtitles,
    required List<PipItem> pipItems,
    required Map<int, ui.Image> photoImages,
    Map<int, ui.Image> pipFrames = const {},
    String? audioFilePath,
    String? bgmFilePath,
    double bgmVolume = 0.3,
  }) async {
    _cancelled = false;

    final dir = await getTemporaryDirectory();
    final sessionDir = '${dir.path}/export_${DateTime.now().millisecondsSinceEpoch}';
    final framesDir = '$sessionDir/frames';
    await Directory(framesDir).create(recursive: true);

    final renderer = FrameRenderer(
      width: width,
      height: height,
      sortedPhotos: sortedPhotos,
      sortedTexts: sortedTexts,
      sortedSubtitles: sortedSubtitles,
      pipItems: pipItems,
      photoImages: photoImages,
      pipFrames: pipFrames,
    );

    // Step 1: Render all frames as PNG
    final totalFrames = (duration * fps).ceil();
    onProgress?.call(0, 'Rendering frames...');

    for (int i = 0; i < totalFrames; i++) {
      if (_cancelled) throw Exception('Export cancelled');

      final t = i / fps;
      final pngBytes = await renderer.renderFrame(t);
      final framePath = '$framesDir/frame_${i.toString().padLeft(6, '0')}.png';
      await File(framePath).writeAsBytes(pngBytes);

      final frameProgress = (i + 1) / totalFrames;
      onProgress?.call(frameProgress * 0.7, 'Rendering frame ${i + 1}/$totalFrames');
    }

    if (_cancelled) throw Exception('Export cancelled');

    // Step 2: Assemble frames into video with FFmpeg
    onProgress?.call(0.7, 'Encoding video...');

    final qualityPreset = ExportQuality.all.firstWhere(
      (q) => q.key == quality,
      orElse: () => ExportQuality.balanced,
    );
    final baseBr = ExportQuality.baseBitrate(height);
    final bitrate = (baseBr * qualityPreset.bitrateMultiplier).round();

    final videoPath = '$sessionDir/video.mp4';
    final videoCmd = '-y -framerate $fps '
        '-i "$framesDir/frame_%06d.png" '
        '-c:v libx264 -pix_fmt yuv420p '
        '-b:v ${bitrate} -maxrate ${bitrate * 2} -bufsize ${bitrate * 4} '
        '-preset ${quality == 'fast' ? 'ultrafast' : quality == 'high' ? 'slow' : 'medium'} '
        '"$videoPath"';

    final videoResult = await FFmpegKit.execute(videoCmd);
    if (!ReturnCode.isSuccess(await videoResult.getReturnCode())) {
      final logs = await videoResult.getLogsAsString();
      throw Exception('FFmpeg video encoding failed: $logs');
    }

    if (_cancelled) throw Exception('Export cancelled');

    // Step 3: Mix audio tracks
    String finalPath;

    if (audioFilePath != null) {
      onProgress?.call(0.85, 'Mixing audio...');

      final outputPath = '$sessionDir/output.mp4';

      if (bgmFilePath != null) {
        // Mix main audio + BGM
        final audioCmd = '-y -i "$videoPath" -i "$audioFilePath" -i "$bgmFilePath" '
            '-filter_complex "'
            '[1:a]volume=1.0[main];'
            '[2:a]volume=$bgmVolume[bgm];'
            '[main][bgm]amix=inputs=2:duration=first:dropout_transition=0.5[aout]'
            '" '
            '-map 0:v -map "[aout]" '
            '-c:v copy -c:a aac -b:a 192k '
            '-shortest "$outputPath"';

        final audioResult = await FFmpegKit.execute(audioCmd);
        if (!ReturnCode.isSuccess(await audioResult.getReturnCode())) {
          // Fallback: just mux main audio without BGM
          await _muxAudio(videoPath, audioFilePath, outputPath);
        }
      } else {
        // Just mux main audio
        await _muxAudio(videoPath, audioFilePath, outputPath);
      }

      finalPath = outputPath;
    } else {
      finalPath = videoPath;
    }

    onProgress?.call(0.95, 'Finalizing...');

    // Step 4: Move to a clean output path
    final outputDir = await getApplicationDocumentsDirectory();
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final cleanPath = '${outputDir.path}/stori_export_$timestamp.mp4';
    await File(finalPath).copy(cleanPath);

    // Cleanup temp files
    try {
      await Directory(sessionDir).delete(recursive: true);
    } catch (_) {}

    onProgress?.call(1.0, 'Done!');
    return cleanPath;
  }

  /// Mux video + audio into final MP4
  Future<void> _muxAudio(
      String videoPath, String audioPath, String outputPath) async {
    final cmd = '-y -i "$videoPath" -i "$audioPath" '
        '-c:v copy -c:a aac -b:a 192k -shortest "$outputPath"';

    final result = await FFmpegKit.execute(cmd);
    if (!ReturnCode.isSuccess(await result.getReturnCode())) {
      final logs = await result.getLogsAsString();
      throw Exception('FFmpeg audio mux failed: $logs');
    }
  }

  /// Export for a specific language track
  Future<String> exportLanguage({
    required int width,
    required int height,
    required double duration,
    required int fps,
    required String quality,
    required List<PhotoItem> sortedPhotos,
    required List<TextItem> sortedTexts,
    required List<SubtitleItem> translatedSubtitles,
    required List<PipItem> pipItems,
    required Map<int, ui.Image> photoImages,
    required String audioFilePath, // translated audio
    required String langCode,
    Map<int, ui.Image> pipFrames = const {},
  }) async {
    return export(
      width: width,
      height: height,
      duration: duration,
      fps: fps,
      quality: quality,
      sortedPhotos: sortedPhotos,
      sortedTexts: sortedTexts,
      sortedSubtitles: translatedSubtitles,
      pipItems: pipItems,
      photoImages: photoImages,
      pipFrames: pipFrames,
      audioFilePath: audioFilePath,
    );
  }

  /// Cancel an in-progress export
  void cancel() {
    _cancelled = true;
    FFmpegKit.cancel();
  }
}
