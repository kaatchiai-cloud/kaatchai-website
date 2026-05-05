class LanguageTrack {
  String lang; // full language name e.g., 'Spanish'
  String langCode; // e.g., 'es', 'fr', 'hi'
  String audioFilePath; // path to translated audio file
  String translatedText; // full transcript in target language
  String subtitleLang; // 'none' or language code
  List<String> subtitleTexts; // per-scene translated subtitles

  LanguageTrack({
    required this.lang,
    required this.langCode,
    required this.audioFilePath,
    this.translatedText = '',
    this.subtitleLang = 'none',
    this.subtitleTexts = const [],
  });

  Map<String, dynamic> toJson() => {
        'lang': lang,
        'langCode': langCode,
        'audioFilePath': audioFilePath,
        'translatedText': translatedText,
        'subtitleLang': subtitleLang,
        'subtitleTexts': subtitleTexts,
      };

  factory LanguageTrack.fromJson(Map<String, dynamic> json) => LanguageTrack(
        lang: json['lang'] as String,
        langCode: json['langCode'] as String,
        audioFilePath: json['audioFilePath'] as String,
        translatedText: json['translatedText'] as String? ?? '',
        subtitleLang: json['subtitleLang'] as String? ?? 'none',
        subtitleTexts: (json['subtitleTexts'] as List<dynamic>?)
                ?.map((e) => e as String)
                .toList() ??
            [],
      );
}
