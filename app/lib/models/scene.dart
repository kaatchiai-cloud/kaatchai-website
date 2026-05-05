class Scene {
  String prompt; // image generation prompt
  double startTime;
  double endTime;
  double duration;
  String text; // voice-over text for this scene
  String? imagePath; // generated image path
  String status; // 'pending', 'done', 'error'
  String? sceneDescription;

  // Podcast mode
  int? chapterId;
  String? chapterTitle;

  Scene({
    required this.prompt,
    required this.startTime,
    required this.endTime,
    required this.text,
    this.imagePath,
    this.status = 'pending',
    this.sceneDescription,
    this.chapterId,
    this.chapterTitle,
  }) : duration = endTime - startTime;

  Map<String, dynamic> toJson() => {
        'prompt': prompt,
        'startTime': startTime,
        'endTime': endTime,
        'duration': duration,
        'text': text,
        'imagePath': imagePath,
        'status': status,
        'sceneDescription': sceneDescription,
        'chapterId': chapterId,
        'chapterTitle': chapterTitle,
      };

  factory Scene.fromJson(Map<String, dynamic> json) => Scene(
        prompt: json['prompt'] as String,
        startTime: (json['startTime'] as num).toDouble(),
        endTime: (json['endTime'] as num).toDouble(),
        text: json['text'] as String? ?? '',
        imagePath: json['imagePath'] as String?,
        status: json['status'] as String? ?? 'pending',
        sceneDescription: json['sceneDescription'] as String?,
        chapterId: json['chapterId'] as int?,
        chapterTitle: json['chapterTitle'] as String?,
      );
}

class TranscriptSegment {
  double startTime;
  double endTime;
  String text;
  String? sceneDescription;

  TranscriptSegment({
    required this.startTime,
    required this.endTime,
    required this.text,
    this.sceneDescription,
  });

  Map<String, dynamic> toJson() => {
        'startTime': startTime,
        'endTime': endTime,
        'text': text,
        'sceneDescription': sceneDescription,
      };

  factory TranscriptSegment.fromJson(Map<String, dynamic> json) =>
      TranscriptSegment(
        startTime: (json['startTime'] as num).toDouble(),
        endTime: (json['endTime'] as num).toDouble(),
        text: json['text'] as String,
        sceneDescription: json['sceneDescription'] as String?,
      );
}
