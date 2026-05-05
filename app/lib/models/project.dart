import 'photo_item.dart';
import 'text_item.dart';
import 'pip_item.dart';
import 'language_track.dart';
import 'scene.dart';
import 'recording_session.dart';

class Project {
  static const int currentVersion = 1;

  String id;
  String name;
  DateTime savedAt;
  int version;

  // Audio
  String? audioFilePath;
  double audioDuration;
  int sampleRate;
  int channels;

  // Timeline items
  List<PhotoItem> photos;
  List<TextItem> texts;
  List<SubtitleItem> subtitles;
  List<PipItem> pipItems;
  int nextPhotoId;
  int nextTextId;

  // Export settings
  String imageSize; // e.g., '1280x720'
  String exportQuality; // 'fast', 'balanced', 'high'
  String exportFps; // '24', '30', '60'

  // Create wizard state (optional)
  List<TranscriptSegment>? transcript;
  List<Scene>? scenes;
  String? stylePrompt;
  String? stylePreset;
  String? selectedTemplate;

  // Background music
  String? bgmFilePath;
  double bgmVolume;
  bool bgmLoop;

  // Language tracks
  List<LanguageTrack> languageTracks;

  // Series metadata
  String seriesName;
  int episodeNumber;

  // Recording session (dual-camera podcast)
  RecordingSession? recordingSession;

  // Gallery metadata
  String? thumbnailPath;

  Project({
    required this.id,
    required this.name,
    DateTime? savedAt,
    this.version = 1,
    this.audioFilePath,
    this.audioDuration = 0,
    this.sampleRate = 44100,
    this.channels = 1,
    List<PhotoItem>? photos,
    List<TextItem>? texts,
    List<SubtitleItem>? subtitles,
    List<PipItem>? pipItems,
    this.nextPhotoId = 1,
    this.nextTextId = 1,
    this.imageSize = '1280x720',
    this.exportQuality = 'balanced',
    this.exportFps = '24',
    this.transcript,
    this.scenes,
    this.stylePrompt,
    this.stylePreset,
    this.selectedTemplate,
    this.bgmFilePath,
    this.bgmVolume = 0.3,
    this.bgmLoop = true,
    List<LanguageTrack>? languageTracks,
    this.seriesName = '',
    this.episodeNumber = 0,
    this.recordingSession,
    this.thumbnailPath,
  })  : savedAt = savedAt ?? DateTime.now(),
        photos = photos ?? [],
        texts = texts ?? [],
        subtitles = subtitles ?? [],
        pipItems = pipItems ?? [],
        languageTracks = languageTracks ?? [];

  int get width => int.parse(imageSize.split('x')[0]);
  int get height => int.parse(imageSize.split('x')[1]);

  Map<String, dynamic> toJson() => {
        'version': version,
        'type': 'audio-photo-timeline',
        'id': id,
        'name': name,
        'savedAt': savedAt.toIso8601String(),
        'audioFilePath': audioFilePath,
        'audioDuration': audioDuration,
        'sampleRate': sampleRate,
        'channels': channels,
        'photos': photos.map((p) => p.toJson()).toList(),
        'texts': texts.map((t) => t.toJson()).toList(),
        'subtitles': subtitles.map((s) => s.toJson()).toList(),
        'pipItems': pipItems.map((p) => p.toJson()).toList(),
        'nextPhotoId': nextPhotoId,
        'nextTextId': nextTextId,
        'imageSize': imageSize,
        'exportQuality': exportQuality,
        'exportFps': exportFps,
        'transcript': transcript?.map((t) => t.toJson()).toList(),
        'scenes': scenes?.map((s) => s.toJson()).toList(),
        'stylePrompt': stylePrompt,
        'stylePreset': stylePreset,
        'selectedTemplate': selectedTemplate,
        'bgmFilePath': bgmFilePath,
        'bgmVolume': bgmVolume,
        'bgmLoop': bgmLoop,
        'languageTracks': languageTracks.map((l) => l.toJson()).toList(),
        'seriesName': seriesName,
        'episodeNumber': episodeNumber,
        'recordingSession': recordingSession?.toJson(),
        'thumbnailPath': thumbnailPath,
      };

  factory Project.fromJson(Map<String, dynamic> json) => Project(
        id: json['id'] as String,
        name: json['name'] as String,
        savedAt: DateTime.parse(json['savedAt'] as String),
        version: json['version'] as int? ?? 1,
        audioFilePath: json['audioFilePath'] as String?,
        audioDuration: (json['audioDuration'] as num?)?.toDouble() ?? 0,
        sampleRate: json['sampleRate'] as int? ?? 44100,
        channels: json['channels'] as int? ?? 1,
        photos: (json['photos'] as List<dynamic>?)
                ?.map((e) => PhotoItem.fromJson(e as Map<String, dynamic>))
                .toList() ??
            [],
        texts: (json['texts'] as List<dynamic>?)
                ?.map((e) => TextItem.fromJson(e as Map<String, dynamic>))
                .toList() ??
            [],
        subtitles: (json['subtitles'] as List<dynamic>?)
                ?.map(
                    (e) => SubtitleItem.fromJson(e as Map<String, dynamic>))
                .toList() ??
            [],
        pipItems: (json['pipItems'] as List<dynamic>?)
                ?.map((e) => PipItem.fromJson(e as Map<String, dynamic>))
                .toList() ??
            [],
        nextPhotoId: json['nextPhotoId'] as int? ?? 1,
        nextTextId: json['nextTextId'] as int? ?? 1,
        imageSize: json['imageSize'] as String? ?? '1280x720',
        exportQuality: json['exportQuality'] as String? ?? 'balanced',
        exportFps: json['exportFps'] as String? ?? '24',
        transcript: (json['transcript'] as List<dynamic>?)
            ?.map(
                (e) => TranscriptSegment.fromJson(e as Map<String, dynamic>))
            .toList(),
        scenes: (json['scenes'] as List<dynamic>?)
            ?.map((e) => Scene.fromJson(e as Map<String, dynamic>))
            .toList(),
        stylePrompt: json['stylePrompt'] as String?,
        stylePreset: json['stylePreset'] as String?,
        selectedTemplate: json['selectedTemplate'] as String?,
        bgmFilePath: json['bgmFilePath'] as String?,
        bgmVolume: (json['bgmVolume'] as num?)?.toDouble() ?? 0.3,
        bgmLoop: json['bgmLoop'] as bool? ?? true,
        languageTracks: (json['languageTracks'] as List<dynamic>?)
                ?.map((e) =>
                    LanguageTrack.fromJson(e as Map<String, dynamic>))
                .toList() ??
            [],
        seriesName: json['seriesName'] as String? ?? '',
        episodeNumber: json['episodeNumber'] as int? ?? 0,
        recordingSession: json['recordingSession'] != null
            ? RecordingSession.fromJson(
                json['recordingSession'] as Map<String, dynamic>)
            : null,
        thumbnailPath: json['thumbnailPath'] as String?,
      );
}
