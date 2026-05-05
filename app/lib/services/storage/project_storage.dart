import 'dart:convert';
import 'package:hive_flutter/hive_flutter.dart';
import '../../models/models.dart';

/// Project gallery metadata stored in Hive
class ProjectMeta {
  final String id;
  final String name;
  final String savedAt;
  final double duration;
  final int photoCount;
  final int textCount;
  final String? thumbnailPath;
  final String seriesName;
  final int episodeNumber;
  final String? stylePreset;
  final String? selectedTemplate;

  ProjectMeta({
    required this.id,
    required this.name,
    required this.savedAt,
    required this.duration,
    required this.photoCount,
    required this.textCount,
    this.thumbnailPath,
    this.seriesName = '',
    this.episodeNumber = 0,
    this.stylePreset,
    this.selectedTemplate,
  });

  Map<String, dynamic> toMap() => {
        'id': id,
        'name': name,
        'savedAt': savedAt,
        'duration': duration,
        'photoCount': photoCount,
        'textCount': textCount,
        'thumbnailPath': thumbnailPath,
        'seriesName': seriesName,
        'episodeNumber': episodeNumber,
        'stylePreset': stylePreset,
        'selectedTemplate': selectedTemplate,
      };

  factory ProjectMeta.fromMap(Map<dynamic, dynamic> map) => ProjectMeta(
        id: map['id'] as String,
        name: map['name'] as String,
        savedAt: map['savedAt'] as String,
        duration: (map['duration'] as num).toDouble(),
        photoCount: map['photoCount'] as int,
        textCount: map['textCount'] as int,
        thumbnailPath: map['thumbnailPath'] as String?,
        seriesName: map['seriesName'] as String? ?? '',
        episodeNumber: map['episodeNumber'] as int? ?? 0,
        stylePreset: map['stylePreset'] as String?,
        selectedTemplate: map['selectedTemplate'] as String?,
      );
}

class ProjectStorage {
  static const String _metaBoxName = 'project_meta';
  static const String _dataBoxName = 'project_data';

  late Box<Map> _metaBox;
  late Box<String> _dataBox;

  Future<void> init() async {
    await Hive.initFlutter();
    _metaBox = await Hive.openBox<Map>(_metaBoxName);
    _dataBox = await Hive.openBox<String>(_dataBoxName);
  }

  /// Save project to gallery
  Future<void> saveProject(Project project) async {
    final meta = ProjectMeta(
      id: project.id,
      name: project.name,
      savedAt: project.savedAt.toIso8601String(),
      duration: project.audioDuration,
      photoCount: project.photos.length,
      textCount: project.texts.length,
      thumbnailPath: project.thumbnailPath,
      seriesName: project.seriesName,
      episodeNumber: project.episodeNumber,
      stylePreset: project.stylePreset,
      selectedTemplate: project.selectedTemplate,
    );

    // Save metadata
    await _metaBox.put(project.id, meta.toMap());

    // Save full project JSON
    final jsonStr = jsonEncode(project.toJson());
    await _dataBox.put(project.id, jsonStr);
  }

  /// Get all project metadata (for gallery display)
  List<ProjectMeta> getProjectMetas() {
    final metas = <ProjectMeta>[];
    for (final key in _metaBox.keys) {
      final map = _metaBox.get(key);
      if (map != null) {
        metas.add(ProjectMeta.fromMap(map));
      }
    }
    // Sort by savedAt descending (newest first)
    metas.sort((a, b) => b.savedAt.compareTo(a.savedAt));
    return metas;
  }

  /// Load full project by ID
  Future<Project?> loadProject(String id) async {
    final jsonStr = _dataBox.get(id);
    if (jsonStr == null) return null;
    final json = jsonDecode(jsonStr) as Map<String, dynamic>;
    return Project.fromJson(json);
  }

  /// Delete project by ID
  Future<void> deleteProject(String id) async {
    await _metaBox.delete(id);
    await _dataBox.delete(id);
  }

  /// Clear all projects
  Future<void> clearAll() async {
    await _metaBox.clear();
    await _dataBox.clear();
  }

  /// Get project count
  int get count => _metaBox.length;
}
