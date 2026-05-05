import 'package:dio/dio.dart';
import '../../core/constants/api_endpoints.dart';

/// AI image generation service — ported from generateImageGeminiFlash()
/// and generateImageImagen() in 17-create-content.js
class ImageGenService {
  final Dio _dio = Dio(BaseOptions(
    connectTimeout: const Duration(seconds: 30),
    receiveTimeout: const Duration(seconds: 120),
  ));

  /// Generate image using Gemini Flash Image (free tier)
  /// Returns base64 image data
  Future<String?> generateWithGeminiFlash({
    required String prompt,
    required String apiKey,
    int? width,
    int? height,
    String? refImageBase64,
    String? refImageMimeType,
    String? modelOverride,
  }) async {
    final sizeHint = (width != null && height != null)
        ? ' The image should be ${width}x$height pixels, ${width > height ? 'landscape' : width < height ? 'portrait' : 'square'} orientation.'
        : '';
    final cleanPrompt = prompt.trim();

    // Build content parts
    final parts = <Map<String, dynamic>>[];
    if (refImageBase64 != null && refImageMimeType != null) {
      parts.add({
        'inlineData': {'mimeType': refImageMimeType, 'data': refImageBase64}
      });
      parts.add({
        'text':
            'Generate a new image matching the visual style, color palette, and mood of the reference image above. Scene description: $cleanPrompt$sizeHint'
      });
    } else {
      parts.add({'text': 'Generate an image: $cleanPrompt$sizeHint'});
    }

    final model = modelOverride ?? 'gemini-2.5-flash-image';
    final url =
        '${ApiEndpoints.geminiBase}/$model:generateContent?key=$apiKey';

    // Retry up to 3 times with delay
    for (int attempt = 0; attempt < 3; attempt++) {
      try {
        final response = await _dio.post(url, data: {
          'contents': [
            {'parts': parts}
          ]
        });

        if (response.statusCode == 200) {
          return _extractImageFromResponse(response.data);
        }
      } on DioException catch (e) {
        if (attempt < 2 && (e.response?.statusCode == 429 || e.response?.statusCode == 503)) {
          await Future.delayed(Duration(seconds: 3 * (attempt + 1)));
          continue;
        }
        if (attempt == 2) rethrow;
      }
    }
    return null;
  }

  /// Generate image using Imagen API (paid tier)
  /// Returns base64 image data
  Future<String?> generateWithImagen({
    required String prompt,
    required String apiKey,
    int? width,
    int? height,
    String? modelOverride,
  }) async {
    final cleanPrompt =
        '${prompt.trim()} Do NOT include any text, words, letters, captions, or writing in any language in the image.';

    // Determine aspect ratio
    String aspectRatio = '16:9';
    if (width != null && height != null) {
      final r = width / height;
      if ((r - 1).abs() < 0.05) {
        aspectRatio = '1:1';
      } else if ((r - 16 / 9).abs() < 0.1) {
        aspectRatio = '16:9';
      } else if ((r - 9 / 16).abs() < 0.1) {
        aspectRatio = '9:16';
      } else if ((r - 4 / 3).abs() < 0.1) {
        aspectRatio = '4:3';
      } else if ((r - 3 / 4).abs() < 0.1) {
        aspectRatio = '3:4';
      } else if (r > 1) {
        aspectRatio = '16:9';
      } else {
        aspectRatio = '9:16';
      }
    }

    final imagenModel = modelOverride ?? 'imagen-4.0-fast-generate-001';
    final url =
        '${ApiEndpoints.geminiBase}/$imagenModel:predict?key=$apiKey';

    for (int attempt = 0; attempt < 3; attempt++) {
      try {
        final response = await _dio.post(url, data: {
          'instances': [
            {'prompt': cleanPrompt}
          ],
          'parameters': {
            'sampleCount': 1,
            'aspectRatio': aspectRatio,
          }
        });

        if (response.statusCode == 200) {
          return _extractImageFromImagenResponse(response.data);
        }
      } on DioException catch (e) {
        if (attempt < 2 && (e.response?.statusCode == 429 || e.response?.statusCode == 503)) {
          await Future.delayed(Duration(seconds: 3 * (attempt + 1)));
          continue;
        }
        if (attempt == 2) rethrow;
      }
    }
    return null;
  }

  /// Extract base64 image from Gemini response
  String? _extractImageFromResponse(dynamic data) {
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

  /// Extract base64 image from Imagen predict response
  String? _extractImageFromImagenResponse(dynamic data) {
    try {
      final predictions = data['predictions'] as List;
      return predictions[0]['bytesBase64Encoded'] as String;
    } catch (_) {}
    return null;
  }
}
