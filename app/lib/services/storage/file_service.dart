import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import '../../models/models.dart';
import '../../painters/frame_painter.dart';
import 'project_storage.dart';

/// File service for project save/load and thumbnail generation
/// Ported from 15-project.js save/load logic
class FileService {
  final ProjectStorage _storage = ProjectStorage();
  bool _initialized = false;

  Future<void> _ensureInit() async {
    if (!_initialized) {
      await _storage.init();
      _initialized = true;
    }
  }

  /// Save complete project to gallery and optionally to a file
  Future<String> saveProject({
    required String name,
    required String? audioFilePath,
    required double audioDuration,
    required int sampleRate,
    required int channels,
    required List<PhotoItem> photos,
    required List<TextItem> texts,
    required List<SubtitleItem> subtitles,
    required List<PipItem> pipItems,
    required int nextPhotoId,
    required int nextTextId,
    required String imageSize,
    required String exportQuality,
    required int exportFps,
    String? stylePrompt,
    String? stylePreset,
    String? selectedTemplate,
    String? bgmFilePath,
    double bgmVolume = 0.3,
    bool bgmLoop = true,
    List<LanguageTrack> languageTracks = const [],
    String seriesName = '',
    int episodeNumber = 0,
    List<TranscriptSegment>? transcript,
    List<Scene>? scenes,
    RecordingSession? recordingSession,
    String? existingId,
    String? thumbnailPath,
  }) async {
    await _ensureInit();

    final id = existingId ?? '${name}_${DateTime.now().millisecondsSinceEpoch}';

    final project = Project(
      id: id,
      name: name,
      audioFilePath: audioFilePath,
      audioDuration: audioDuration,
      sampleRate: sampleRate,
      channels: channels,
      photos: photos,
      texts: texts,
      subtitles: subtitles,
      pipItems: pipItems,
      nextPhotoId: nextPhotoId,
      nextTextId: nextTextId,
      imageSize: imageSize,
      exportQuality: exportQuality,
      exportFps: exportFps.toString(),
      stylePrompt: stylePrompt,
      stylePreset: stylePreset,
      selectedTemplate: selectedTemplate,
      bgmFilePath: bgmFilePath,
      bgmVolume: bgmVolume,
      bgmLoop: bgmLoop,
      languageTracks: languageTracks,
      seriesName: seriesName,
      episodeNumber: episodeNumber,
      transcript: transcript,
      scenes: scenes,
      recordingSession: recordingSession,
      thumbnailPath: thumbnailPath,
    );

    await _storage.saveProject(project);
    return id;
  }

  /// Load project from gallery by ID
  Future<Project?> loadProject(String id) async {
    await _ensureInit();
    return _storage.loadProject(id);
  }

  /// Get all project metadata for gallery display
  Future<List<ProjectMeta>> getGalleryProjects() async {
    await _ensureInit();
    return _storage.getProjectMetas();
  }

  /// Delete project from gallery
  Future<void> deleteProject(String id) async {
    await _ensureInit();
    await _storage.deleteProject(id);
  }

  /// Clear all projects
  Future<void> clearAll() async {
    await _ensureInit();
    await _storage.clearAll();
  }

  /// Save project to .aptproj file for sharing/backup
  Future<String> exportProjectFile(Project project) async {
    final dir = await getApplicationDocumentsDirectory();
    final safeName = project.name.replaceAll(RegExp(r'[^\w\s-]'), '').trim();
    final path = '${dir.path}/${safeName}_${DateTime.now().millisecondsSinceEpoch}.aptproj';

    final jsonStr = jsonEncode(project.toJson());
    await File(path).writeAsString(jsonStr);
    return path;
  }

  /// Load project from .aptproj file
  Future<Project?> importProjectFile(String filePath) async {
    try {
      final file = File(filePath);
      if (!await file.exists()) return null;

      final jsonStr = await file.readAsString();
      final json = jsonDecode(jsonStr) as Map<String, dynamic>;
      return Project.fromJson(json);
    } catch (e) {
      return null;
    }
  }

  /// Generate thumbnail for project gallery
  /// Renders frame at t=0.5s to a 320x180 image
  Future<String?> generateThumbnail({
    required List<PhotoItem> photos,
    required List<TextItem> texts,
    required List<SubtitleItem> subtitles,
    required Map<int, ui.Image> photoImages,
    required String projectId,
  }) async {
    if (photos.isEmpty) return null;

    try {
      final width = 320;
      final height = 180;

      // Find a good time to capture (0.5s or first photo's midpoint)
      final captureTime = photos.isNotEmpty
          ? photos.first.startTime + photos.first.duration / 2
          : 0.5;

      final recorder = ui.PictureRecorder();
      final canvas = Canvas(recorder);

      final painter = FramePainter(
        elapsed: captureTime,
        sortedPhotos: photos,
        sortedTexts: texts,
        sortedSubtitles: subtitles,
        photoImages: photoImages,
      );

      painter.paint(canvas, Size(width.toDouble(), height.toDouble()));

      final picture = recorder.endRecording();
      final image = await picture.toImage(width, height);
      final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
      image.dispose();
      picture.dispose();

      if (byteData == null) return null;

      // Save thumbnail to app directory
      final dir = await getApplicationDocumentsDirectory();
      final thumbDir = '${dir.path}/thumbnails';
      await Directory(thumbDir).create(recursive: true);

      final thumbPath = '$thumbDir/$projectId.png';
      await File(thumbPath).writeAsBytes(byteData.buffer.asUint8List());

      return thumbPath;
    } catch (e) {
      return null;
    }
  }
}
