import 'package:dio/dio.dart';
import '../../core/constants/api_endpoints.dart';

/// Text-to-Speech service — ported from TTS functions in 17-create-content.js
/// Supports Gemini TTS (free) and Google Cloud TTS (paid)
class TtsService {
  final Dio _dio = Dio(BaseOptions(
    connectTimeout: const Duration(seconds: 30),
    receiveTimeout: const Duration(seconds: 60),
  ));

  /// Generate speech using Gemini Flash TTS (free tier)
  /// Returns base64 audio data
  Future<String?> generateWithGeminiTts({
    required String text,
    required String voiceName,
    required String apiKey,
  }) async {
    final url = ApiEndpoints.withKey(ApiEndpoints.geminiTts, apiKey);

    try {
      final response = await _dio.post(url, data: {
        'contents': [
          {
            'parts': [
              {'text': text}
            ]
          }
        ],
        'generationConfig': {
          'speechConfig': {
            'voiceConfig': {
              'prebuiltVoiceConfig': {'voiceName': voiceName}
            }
          },
          'responseModalities': ['AUDIO'],
        }
      });

      if (response.statusCode == 200) {
        return _extractAudioFromGeminiResponse(response.data);
      }
    } on DioException catch (e) {
      throw Exception(
          'Gemini TTS failed: ${e.response?.data?['error']?['message'] ?? e.message}');
    }
    return null;
  }

  /// Generate speech using Google Cloud TTS (paid tier)
  /// Returns base64 audio data
  Future<String?> generateWithGCloudTts({
    required String text,
    required String voiceName,
    required String languageCode,
    required String apiKey,
  }) async {
    final url = '${ApiEndpoints.googleCloudTts}?key=$apiKey';

    try {
      final response = await _dio.post(url, data: {
        'input': {'text': text},
        'voice': {
          'languageCode': languageCode,
          'name': voiceName,
        },
        'audioConfig': {
          'audioEncoding': 'LINEAR16',
          'sampleRateHertz': 44100,
        }
      });

      if (response.statusCode == 200) {
        return response.data['audioContent'] as String?;
      }
    } on DioException catch (e) {
      throw Exception(
          'Google Cloud TTS failed: ${e.response?.data?['error']?['message'] ?? e.message}');
    }
    return null;
  }

  /// Extract base64 audio from Gemini TTS response
  String? _extractAudioFromGeminiResponse(dynamic data) {
    try {
      final candidates = data['candidates'] as List;
      final parts = candidates[0]['content']['parts'] as List;
      for (final part in parts) {
        if (part['inlineData'] != null) {
          return part['inlineData']['data'] as String;
        }
      }
    } catch (_) {}
    return null;
  }

  /// Available voice names for Gemini TTS
  static const geminiVoices = [
    'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir',
    'Leda', 'Orus', 'Pegasus', 'Perseus', 'Vesta',
  ];
}
