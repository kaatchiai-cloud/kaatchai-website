class TextItem {
  int id;
  String text;
  String font; // e.g., 'Poppins', 'Noto Sans Tamil'
  double fontSize; // pixels (12-96)
  String color; // hex #RRGGBB
  String strokeColor; // outline color hex
  double strokeWidth; // pixels
  String bgColor; // background hex
  double bgAlpha; // 0-1 opacity
  bool bold;
  String position; // 'top-left', 'top-center', etc. (9-point grid)
  double startTime; // seconds
  double duration; // seconds
  String animation; // 'none', 'fade', 'slide-up', 'slide-down', 'scale', 'blur-in', 'typewriter'
  double animDur; // animation duration in seconds

  TextItem({
    required this.id,
    this.text = 'Text',
    this.font = 'Poppins',
    this.fontSize = 48,
    this.color = '#ffffff',
    this.strokeColor = '#000000',
    this.strokeWidth = 0,
    this.bgColor = '#000000',
    this.bgAlpha = 0,
    this.bold = false,
    this.position = 'center',
    required this.startTime,
    this.duration = 3.0,
    this.animation = 'fade',
    this.animDur = 0.5,
  });

  double get endTime => startTime + duration;

  Map<String, dynamic> toJson() => {
        'id': id,
        'text': text,
        'font': font,
        'fontSize': fontSize,
        'color': color,
        'strokeColor': strokeColor,
        'strokeWidth': strokeWidth,
        'bgColor': bgColor,
        'bgAlpha': bgAlpha,
        'bold': bold,
        'position': position,
        'startTime': startTime,
        'duration': duration,
        'animation': animation,
        'animDur': animDur,
      };

  factory TextItem.fromJson(Map<String, dynamic> json) => TextItem(
        id: json['id'] as int,
        text: json['text'] as String? ?? 'Text',
        font: json['font'] as String? ?? 'Poppins',
        fontSize: (json['fontSize'] as num?)?.toDouble() ?? 48,
        color: json['color'] as String? ?? '#ffffff',
        strokeColor: json['strokeColor'] as String? ?? '#000000',
        strokeWidth: (json['strokeWidth'] as num?)?.toDouble() ?? 0,
        bgColor: json['bgColor'] as String? ?? '#000000',
        bgAlpha: (json['bgAlpha'] as num?)?.toDouble() ?? 0,
        bold: json['bold'] as bool? ?? false,
        position: json['position'] as String? ?? 'center',
        startTime: (json['startTime'] as num).toDouble(),
        duration: (json['duration'] as num?)?.toDouble() ?? 3.0,
        animation: json['animation'] as String? ?? 'fade',
        animDur: (json['animDur'] as num?)?.toDouble() ?? 0.5,
      );
}

class SubtitleItem extends TextItem {
  SubtitleItem({
    required super.id,
    super.text = '',
    super.font = 'Poppins',
    super.fontSize = 32,
    super.color = '#ffffff',
    super.strokeColor = '#000000',
    super.strokeWidth = 2,
    super.bgColor = '#000000',
    super.bgAlpha = 0.5,
    super.bold = true,
    super.position = 'bot-center',
    required super.startTime,
    super.duration = 3.0,
    super.animation = 'fade',
    super.animDur = 0.3,
  });

  factory SubtitleItem.fromJson(Map<String, dynamic> json) {
    final item = TextItem.fromJson(json);
    return SubtitleItem(
      id: item.id,
      text: item.text,
      font: item.font,
      fontSize: item.fontSize,
      color: item.color,
      strokeColor: item.strokeColor,
      strokeWidth: item.strokeWidth,
      bgColor: item.bgColor,
      bgAlpha: item.bgAlpha,
      bold: item.bold,
      position: item.position,
      startTime: item.startTime,
      duration: item.duration,
      animation: item.animation,
      animDur: item.animDur,
    );
  }
}
