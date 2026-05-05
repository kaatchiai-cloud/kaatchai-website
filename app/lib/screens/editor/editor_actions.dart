import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:file_picker/file_picker.dart';
import '../../core/theme/colors.dart';
import '../../models/models.dart';
import '../../providers/audio_provider.dart';
import '../../providers/timeline_provider.dart';
import '../../providers/project_provider.dart';
import '../../providers/export_provider.dart';
import '../../services/storage/file_service.dart';
import '../../services/export/video_exporter.dart';
import 'widgets/export/export_dialog.dart';

/// Editor save/load/export action handlers
class EditorActions {
  static final _fileService = FileService();
  static final _exporter = VideoExporter();

  /// Save current project to gallery
  static Future<void> saveProject(
    BuildContext context,
    WidgetRef ref, {
    Map<int, ui.Image> photoImages = const {},
  }) async {
    final project = ref.read(projectProvider);
    final timeline = ref.read(timelineProvider);
    final audio = ref.read(audioProvider);

    try {
      // Generate thumbnail
      final thumbPath = await _fileService.generateThumbnail(
        photos: timeline.photos,
        texts: timeline.texts,
        subtitles: timeline.subtitles,
        photoImages: photoImages,
        projectId: project.projectId ?? 'new_${DateTime.now().millisecondsSinceEpoch}',
      );

      final id = await _fileService.saveProject(
        name: project.projectName,
        audioFilePath: audio.audioFilePath,
        audioDuration: audio.duration,
        sampleRate: 44100,
        channels: 1,
        photos: timeline.photos,
        texts: timeline.texts,
        subtitles: timeline.subtitles,
        pipItems: timeline.pipItems,
        nextPhotoId: timeline.nextPhotoId,
        nextTextId: timeline.nextTextId,
        imageSize: project.imageSize,
        exportQuality: project.exportQuality,
        exportFps: project.exportFps,
        stylePrompt: project.stylePrompt,
        stylePreset: project.stylePreset,
        selectedTemplate: project.selectedTemplate,
        bgmFilePath: audio.bgmFilePath,
        bgmVolume: audio.bgmVolume,
        bgmLoop: audio.bgmLoop,
        languageTracks: project.languageTracks,
        seriesName: project.seriesName,
        episodeNumber: project.episodeNumber,
        recordingSession: project.recordingSession,
        existingId: project.projectId,
        thumbnailPath: thumbPath,
      );

      ref.read(projectProvider.notifier).loadFromProject(
        Project(id: id, name: project.projectName),
      );

      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Project saved'),
            backgroundColor: AppColors.green,
            duration: Duration(seconds: 2),
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Save failed: $e'),
            backgroundColor: AppColors.red,
          ),
        );
      }
    }
  }

  /// Load project from gallery by ID
  static Future<void> loadProject(
    BuildContext context,
    WidgetRef ref,
    String projectId,
  ) async {
    try {
      final project = await _fileService.loadProject(projectId);
      if (project == null) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Project not found'),
              backgroundColor: AppColors.red,
            ),
          );
        }
        return;
      }

      // Restore state
      ref.read(projectProvider.notifier).loadFromProject(project);
      ref.read(timelineProvider.notifier).loadFromProject(project);

      if (project.audioFilePath != null) {
        ref.read(audioProvider.notifier).setAudio(
              project.audioFilePath!,
              project.audioDuration,
            );
      }
      if (project.bgmFilePath != null) {
        ref.read(audioProvider.notifier).setBgm(project.bgmFilePath!);
        ref.read(audioProvider.notifier).setBgmVolume(project.bgmVolume);
        ref.read(audioProvider.notifier).setBgmLoop(project.bgmLoop);
      }

      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Loaded: ${project.name}'),
            backgroundColor: AppColors.green,
            duration: const Duration(seconds: 2),
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Load failed: $e'),
            backgroundColor: AppColors.red,
          ),
        );
      }
    }
  }

  /// Import project from .aptproj file
  static Future<void> importProjectFile(
    BuildContext context,
    WidgetRef ref,
  ) async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.any,
      allowMultiple: false,
    );
    if (result == null || result.files.isEmpty) return;

    final path = result.files.first.path;
    if (path == null) return;

    final project = await _fileService.importProjectFile(path);
    if (project != null) {
      ref.read(projectProvider.notifier).loadFromProject(project);
      ref.read(timelineProvider.notifier).loadFromProject(project);
      if (project.audioFilePath != null) {
        ref.read(audioProvider.notifier).setAudio(
              project.audioFilePath!,
              project.audioDuration,
            );
      }
    }
  }

  /// Show export dialog and start export
  static void showExportDialog(
    BuildContext context,
    WidgetRef ref, {
    Map<int, ui.Image> photoImages = const {},
    Map<int, ui.Image> pipFrames = const {},
  }) {
    showDialog(
      context: context,
      builder: (_) => ExportDialog(
        onExport: () => _startExport(context, ref,
            photoImages: photoImages, pipFrames: pipFrames),
      ),
    );
  }

  /// Execute the export pipeline
  static Future<void> _startExport(
    BuildContext context,
    WidgetRef ref, {
    Map<int, ui.Image> photoImages = const {},
    Map<int, ui.Image> pipFrames = const {},
  }) async {
    final project = ref.read(projectProvider);
    final timeline = ref.read(timelineProvider);
    final audio = ref.read(audioProvider);
    final exportNotifier = ref.read(exportProvider.notifier);

    exportNotifier.startExport();

    _exporter.onProgress = (progress, status) {
      exportNotifier.updateProgress(progress, status);
    };

    try {
      final outputPath = await _exporter.export(
        width: project.width,
        height: project.height,
        duration: audio.duration,
        fps: project.exportFps,
        quality: project.exportQuality,
        sortedPhotos: List.from(timeline.photos)
          ..sort((a, b) => a.startTime.compareTo(b.startTime)),
        sortedTexts: List.from(timeline.texts)
          ..sort((a, b) => a.startTime.compareTo(b.startTime)),
        sortedSubtitles: List.from(timeline.subtitles)
          ..sort((a, b) => a.startTime.compareTo(b.startTime)),
        pipItems: timeline.pipItems,
        photoImages: photoImages,
        pipFrames: pipFrames,
        audioFilePath: audio.audioFilePath,
        bgmFilePath: audio.bgmFilePath,
        bgmVolume: audio.bgmVolume,
      );

      exportNotifier.completeExport(outputPath);
    } catch (e) {
      exportNotifier.failExport(e.toString());
    }
  }

  /// Cancel in-progress export
  static void cancelExport(WidgetRef ref) {
    _exporter.cancel();
    ref.read(exportProvider.notifier).failExport('Export cancelled');
  }
}
