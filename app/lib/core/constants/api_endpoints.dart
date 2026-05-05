/// Google Gemini & related API endpoints
/// Ported from 17-create-content.js
class ApiEndpoints {
  static const String geminiBase =
      'https://generativelanguage.googleapis.com/v1beta/models';

  // Text generation models
  static const String geminiFlash = '$geminiBase/gemini-2.5-flash:generateContent';
  static const String gemini3Flash = '$geminiBase/gemini-3-flash:generateContent';

  // Image generation models
  static const String geminiFlashImage =
      '$geminiBase/gemini-2.5-flash-image:generateContent';
  static const String imagen3Fast =
      '$geminiBase/imagen-3.0-generate-002:generateContent';
  static const String imagen4Ultra =
      '$geminiBase/imagen-4.0-ultra-generate-001:generateContent';

  // TTS models
  static const String geminiTts =
      '$geminiBase/gemini-2.5-flash-preview-tts:generateContent';

  // Google Cloud TTS
  static const String googleCloudTts =
      'https://texttospeech.googleapis.com/v1/text:synthesize';

  /// Build URL with API key
  static String withKey(String endpoint, String apiKey) {
    return '$endpoint?key=$apiKey';
  }
}

/// Export quality presets — ported from 11-export.js
class ExportQuality {
  final String key;
  final String label;
  final double bitrateMultiplier;

  const ExportQuality(this.key, this.label, this.bitrateMultiplier);

  static const fast = ExportQuality('fast', 'Fast', 0.5);
  static const balanced = ExportQuality('balanced', 'Balanced', 1.0);
  static const high = ExportQuality('high', 'High', 1.8);

  static const List<ExportQuality> all = [fast, balanced, high];

  /// Base bitrate by height (in bits per second)
  static int baseBitrate(int height) {
    if (height <= 480) return 1500000;
    if (height <= 720) return 4000000;
    return 8000000;
  }
}

/// Available FPS options
const List<int> exportFpsOptions = [15, 24, 30, 60];
