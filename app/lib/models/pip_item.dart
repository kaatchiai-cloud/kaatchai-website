class PipItem {
  int id;
  String videoPath; // file path
  double videoDuration;
  double inPoint; // where PiP starts in timeline
  double outPoint; // where PiP ends in timeline
  String position; // 'top-left', 'bot-right', etc. or 'custom'
  double? customX; // custom X position (0-1 normalized)
  double? customY; // custom Y position (0-1 normalized)
  double size; // percentage of canvas width (10-50)
  String shape; // 'circle', 'rounded', 'rect'
  double border; // border width in pixels
  String borderColor; // hex color
  bool shadow;
  String name; // display name

  PipItem({
    required this.id,
    required this.videoPath,
    required this.videoDuration,
    required this.inPoint,
    required this.outPoint,
    this.position = 'bot-right',
    this.customX,
    this.customY,
    this.size = 25,
    this.shape = 'circle',
    this.border = 3,
    this.borderColor = '#ffffff',
    this.shadow = true,
    this.name = 'Speaker',
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'videoPath': videoPath,
        'videoDuration': videoDuration,
        'inPoint': inPoint,
        'outPoint': outPoint,
        'position': position,
        'customX': customX,
        'customY': customY,
        'size': size,
        'shape': shape,
        'border': border,
        'borderColor': borderColor,
        'shadow': shadow,
        'name': name,
      };

  factory PipItem.fromJson(Map<String, dynamic> json) => PipItem(
        id: json['id'] as int,
        videoPath: json['videoPath'] as String,
        videoDuration: (json['videoDuration'] as num).toDouble(),
        inPoint: (json['inPoint'] as num).toDouble(),
        outPoint: (json['outPoint'] as num).toDouble(),
        position: json['position'] as String? ?? 'bot-right',
        customX: (json['customX'] as num?)?.toDouble(),
        customY: (json['customY'] as num?)?.toDouble(),
        size: (json['size'] as num?)?.toDouble() ?? 25,
        shape: json['shape'] as String? ?? 'circle',
        border: (json['border'] as num?)?.toDouble() ?? 3,
        borderColor: json['borderColor'] as String? ?? '#ffffff',
        shadow: json['shadow'] as bool? ?? true,
        name: json['name'] as String? ?? 'Speaker',
      );
}
