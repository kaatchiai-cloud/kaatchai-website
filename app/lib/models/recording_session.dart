class RecordingSession {
  String id;
  String frontVideoPath; // host camera recording
  String backVideoPath; // guest camera recording
  String stereoAudioPath; // L=front mic, R=back mic
  List<SpeakerSegment> speakerTimeline; // who spoke when
  double duration; // total recording duration in seconds
  DateTime recordedAt;

  // Post-processing outputs
  String? hostCleanAudioPath;
  String? guestCleanAudioPath;
  String? mixedCleanAudioPath;

  RecordingSession({
    required this.id,
    required this.frontVideoPath,
    required this.backVideoPath,
    required this.stereoAudioPath,
    this.speakerTimeline = const [],
    required this.duration,
    DateTime? recordedAt,
    this.hostCleanAudioPath,
    this.guestCleanAudioPath,
    this.mixedCleanAudioPath,
  }) : recordedAt = recordedAt ?? DateTime.now();

  Map<String, dynamic> toJson() => {
        'id': id,
        'frontVideoPath': frontVideoPath,
        'backVideoPath': backVideoPath,
        'stereoAudioPath': stereoAudioPath,
        'speakerTimeline':
            speakerTimeline.map((s) => s.toJson()).toList(),
        'duration': duration,
        'recordedAt': recordedAt.toIso8601String(),
        'hostCleanAudioPath': hostCleanAudioPath,
        'guestCleanAudioPath': guestCleanAudioPath,
        'mixedCleanAudioPath': mixedCleanAudioPath,
      };

  factory RecordingSession.fromJson(Map<String, dynamic> json) =>
      RecordingSession(
        id: json['id'] as String,
        frontVideoPath: json['frontVideoPath'] as String,
        backVideoPath: json['backVideoPath'] as String,
        stereoAudioPath: json['stereoAudioPath'] as String,
        speakerTimeline: (json['speakerTimeline'] as List<dynamic>?)
                ?.map((e) =>
                    SpeakerSegment.fromJson(e as Map<String, dynamic>))
                .toList() ??
            [],
        duration: (json['duration'] as num).toDouble(),
        recordedAt: DateTime.parse(json['recordedAt'] as String),
        hostCleanAudioPath: json['hostCleanAudioPath'] as String?,
        guestCleanAudioPath: json['guestCleanAudioPath'] as String?,
        mixedCleanAudioPath: json['mixedCleanAudioPath'] as String?,
      );
}

class SpeakerSegment {
  String speakerId; // 'host' or 'guest'
  double startTime;
  double endTime;
  double confidence; // 0-1

  SpeakerSegment({
    required this.speakerId,
    required this.startTime,
    required this.endTime,
    this.confidence = 1.0,
  });

  double get duration => endTime - startTime;

  Map<String, dynamic> toJson() => {
        'speakerId': speakerId,
        'startTime': startTime,
        'endTime': endTime,
        'confidence': confidence,
      };

  factory SpeakerSegment.fromJson(Map<String, dynamic> json) =>
      SpeakerSegment(
        speakerId: json['speakerId'] as String,
        startTime: (json['startTime'] as num).toDouble(),
        endTime: (json['endTime'] as num).toDouble(),
        confidence: (json['confidence'] as num?)?.toDouble() ?? 1.0,
      );
}
