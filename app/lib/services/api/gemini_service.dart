import 'package:dio/dio.dart';
import '../../core/constants/api_endpoints.dart';

/// Gemini API service — ported from callGeminiAPI() and related functions
/// in 17-create-content.js
class GeminiService {
  final Dio _dio = Dio(BaseOptions(
    connectTimeout: const Duration(seconds: 30),
    receiveTimeout: const Duration(seconds: 120),
  ));

  /// Call Gemini API with model fallback
  /// Tries each model in order, skips on 429/403/quota errors
  Future<Map<String, dynamic>> callGeminiAPI({
    required List<String> models,
    required Map<String, dynamic> body,
    required String apiKey,
  }) async {
    for (final model in models) {
      try {
        final url =
            '${ApiEndpoints.geminiBase}/$model:generateContent?key=$apiKey';
        final response = await _dio.post(url, data: body);
        if (response.statusCode == 200) {
          return response.data as Map<String, dynamic>;
        }
      } on DioException catch (e) {
        final status = e.response?.statusCode;
        if (status == 429 || status == 403) continue;
        final errorMsg = e.response?.data?['error']?['message'] as String?;
        if (errorMsg != null &&
            (errorMsg.contains('quota') || errorMsg.contains('rate'))) {
          continue;
        }
        if (model == models.last) {
          throw Exception(errorMsg ?? 'API error $status');
        }
      }
    }
    throw Exception('All models failed');
  }

  /// Extract text from Gemini response
  static String extractText(Map<String, dynamic> response) {
    try {
      final candidates = response['candidates'] as List;
      final content = candidates[0]['content'] as Map<String, dynamic>;
      final parts = content['parts'] as List;
      return parts[0]['text'] as String;
    } catch (_) {
      return '';
    }
  }

  /// Transcribe audio to text with timestamps
  Future<String> transcribe({
    required String audioBase64,
    required String mimeType,
    required String apiKey,
  }) async {
    final body = {
      'contents': [
        {
          'parts': [
            {'inlineData': {'mimeType': mimeType, 'data': audioBase64}},
            {
              'text':
                  '''Transcribe this audio. Break it into segments of roughly 5-15 seconds each. The segments MUST cover the ENTIRE audio with NO gaps.

For each segment, provide the transcribed text AND a detailed visual scene description suitable for generating an illustration image.

Return ONLY a valid JSON array with no markdown formatting:
[{"startTime": 0, "endTime": 10, "text": "transcribed words here", "sceneDescription": "A detailed visual description for image generation: subject, style, mood, colors, composition"}]

Important: sceneDescription should be a vivid, specific image generation prompt — describe what should be SEEN, not just what is said. Make it artistic and visually compelling.'''
            },
          ]
        }
      ]
    };

    final response = await callGeminiAPI(
      models: ['gemini-2.5-flash', 'gemini-3-flash'],
      body: body,
      apiKey: apiKey,
    );

    return extractText(response);
  }

  /// Generate scene descriptions for text segments (text mode)
  /// Ported from the text-mode storyboard prompt in 17-create-content.js
  Future<String> generateSceneDescriptions({
    required String segmentedText,
    required String stylePrompt,
    required String apiKey,
  }) async {
    final styleHint = stylePrompt.isNotEmpty ? ' Visual style: $stylePrompt.' : '';
    final body = {
      'contents': [
        {
          'parts': [
            {
              'text': '''Given these text segments from a script, generate a vivid visual scene description for each segment suitable for AI image generation.$styleHint

$segmentedText

Return ONLY a valid JSON array with no markdown formatting:
[{"segmentIndex": 0, "sceneDescription": "A detailed visual description: subject, style, mood, colors, composition"}]

Important: sceneDescription should describe what should be SEEN, not just what is said. Make it artistic and visually compelling. One entry per segment, in order.'''
            }
          ]
        }
      ]
    };

    final response = await callGeminiAPI(
      models: ['gemini-2.5-flash', 'gemini-3-flash'],
      body: body,
      apiKey: apiKey,
    );

    return extractText(response);
  }

  /// Translate text to target language
  Future<String> translateText({
    required String text,
    required String targetLanguage,
    required String apiKey,
  }) async {
    final body = {
      'contents': [
        {
          'parts': [
            {
              'text':
                  'Translate the following text to $targetLanguage. Return only the translated text, no explanations.\n\n$text'
            }
          ]
        }
      ]
    };

    final response = await callGeminiAPI(
      models: ['gemini-2.5-flash', 'gemini-3-flash'],
      body: body,
      apiKey: apiKey,
    );

    return extractText(response);
  }

  /// Split podcast transcript into chapters
  Future<String> splitChapters({
    required String transcript,
    required String apiKey,
  }) async {
    final body = {
      'contents': [
        {
          'parts': [
            {
              'text': '''Analyze this podcast transcript and split it into logical chapters/topics.
For each chapter provide:
- title: short chapter title
- startTime: when this chapter starts (seconds)
- endTime: when this chapter ends (seconds)
- summary: one-line summary

Transcript:
$transcript

Return as JSON array: [{"title": "...", "startTime": 0.0, "endTime": 60.0, "summary": "..."}]'''
            }
          ]
        }
      ]
    };

    final response = await callGeminiAPI(
      models: ['gemini-2.5-flash', 'gemini-3-flash'],
      body: body,
      apiKey: apiKey,
    );

    return extractText(response);
  }
}
