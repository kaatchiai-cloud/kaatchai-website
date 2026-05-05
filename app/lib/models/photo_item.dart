import 'dart:ui' as ui;

class PhotoItem {
  int id;
  String imagePath; // file path or data URI
  ui.Image? imageCache; // decoded image for canvas rendering
  double startTime; // seconds
  double duration; // seconds
  String transition; // key from TransitionType
  double transDur; // transition duration in seconds
  String motion; // key from MotionType

  // Video-specific properties
  String type; // 'image' or 'video'
  String? videoPath; // file path for video
  double? videoDuration;
  double? inPoint; // trim start in source video
  double? outPoint; // trim end in source video

  PhotoItem({
    required this.id,
    required this.imagePath,
    this.imageCache,
    required this.startTime,
    required this.duration,
    this.transition = 'none',
    this.transDur = 0.5,
    this.motion = 'none',
    this.type = 'image',
    this.videoPath,
    this.videoDuration,
    this.inPoint,
    this.outPoint,
  });

  double get endTime => startTime + duration;

  Map<String, dynamic> toJson() => {
        'id': id,
        'imagePath': imagePath,
        'startTime': startTime,
        'duration': duration,
        'transition': transition,
        'transDur': transDur,
        'motion': motion,
        'type': type,
        'videoPath': videoPath,
        'videoDuration': videoDuration,
        'inPoint': inPoint,
        'outPoint': outPoint,
      };

  factory PhotoItem.fromJson(Map<String, dynamic> json) => PhotoItem(
        id: json['id'] as int,
        imagePath: json['imagePath'] as String,
        startTime: (json['startTime'] as num).toDouble(),
        duration: (json['duration'] as num).toDouble(),
        transition: json['transition'] as String? ?? 'none',
        transDur: (json['transDur'] as num?)?.toDouble() ?? 0.5,
        motion: json['motion'] as String? ?? 'none',
        type: json['type'] as String? ?? 'image',
        videoPath: json['videoPath'] as String?,
        videoDuration: (json['videoDuration'] as num?)?.toDouble(),
        inPoint: (json['inPoint'] as num?)?.toDouble(),
        outPoint: (json['outPoint'] as num?)?.toDouble(),
      );
}
