import 'dart:async';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';
/// Service for dual-camera recording using platform channels
/// iOS: AVCaptureMultiCamSession (iPhone XS+, iOS 13+)
/// Android: CameraX concurrent camera (Android 11+)
class DualCameraService {
  static const _channel = MethodChannel('com.stori/dual_camera');
  static const _eventChannel = EventChannel('com.stori/dual_camera_events');

  StreamSubscription? _eventSub;

  // Callbacks
  void Function(double hostLevel, double guestLevel)? onAudioLevels;
  void Function(String error)? onError;

  /// Check if device supports simultaneous front + back camera
  Future<bool> isDualCameraSupported() async {
    try {
      final result = await _channel.invokeMethod<bool>('isDualCameraSupported');
      return result ?? false;
    } on PlatformException {
      return false;
    }
  }

  /// Initialize cameras and prepare for recording
  /// Returns texture IDs for front and back camera previews
  Future<CameraPreviewInfo> initialize({
    String quality = '720p', // '720p' or '1080p'
  }) async {
    final result = await _channel.invokeMethod<Map>('initialize', {
      'quality': quality,
    });

    return CameraPreviewInfo(
      frontTextureId: result!['frontTextureId'] as int,
      backTextureId: result['backTextureId'] as int,
      frontWidth: result['frontWidth'] as int,
      frontHeight: result['frontHeight'] as int,
      backWidth: result['backWidth'] as int,
      backHeight: result['backHeight'] as int,
    );
  }

  /// Start recording from both cameras + stereo audio
  Future<void> startRecording() async {
    final dir = await getApplicationDocumentsDirectory();
    final sessionId = const Uuid().v4();
    final sessionDir = '${dir.path}/recordings/$sessionId';

    await _channel.invokeMethod('startRecording', {
      'sessionDir': sessionDir,
      'sessionId': sessionId,
    });

    // Listen for audio level events
    _eventSub = _eventChannel.receiveBroadcastStream().listen((event) {
      if (event is Map) {
        final type = event['type'] as String?;
        if (type == 'audioLevels') {
          onAudioLevels?.call(
            (event['hostLevel'] as num).toDouble(),
            (event['guestLevel'] as num).toDouble(),
          );
        } else if (type == 'error') {
          onError?.call(event['message'] as String);
        }
      }
    });
  }

  /// Pause recording
  Future<void> pauseRecording() async {
    await _channel.invokeMethod('pauseRecording');
  }

  /// Resume recording
  Future<void> resumeRecording() async {
    await _channel.invokeMethod('resumeRecording');
  }

  /// Stop recording and return session info
  Future<RecordingSessionResult> stopRecording() async {
    _eventSub?.cancel();
    _eventSub = null;

    final result = await _channel.invokeMethod<Map>('stopRecording');

    return RecordingSessionResult(
      sessionId: result!['sessionId'] as String,
      frontVideoPath: result['frontVideoPath'] as String,
      backVideoPath: result['backVideoPath'] as String,
      stereoAudioPath: result['stereoAudioPath'] as String,
      duration: (result['duration'] as num).toDouble(),
    );
  }

  /// Swap which camera is considered "front" (host) vs "back" (guest)
  Future<void> swapCameras() async {
    await _channel.invokeMethod('swapCameras');
  }

  /// Release camera resources
  Future<void> dispose() async {
    _eventSub?.cancel();
    _eventSub = null;
    await _channel.invokeMethod('dispose');
  }
}

class CameraPreviewInfo {
  final int frontTextureId;
  final int backTextureId;
  final int frontWidth;
  final int frontHeight;
  final int backWidth;
  final int backHeight;

  CameraPreviewInfo({
    required this.frontTextureId,
    required this.backTextureId,
    required this.frontWidth,
    required this.frontHeight,
    required this.backWidth,
    required this.backHeight,
  });
}

class RecordingSessionResult {
  final String sessionId;
  final String frontVideoPath;
  final String backVideoPath;
  final String stereoAudioPath;
  final double duration;

  RecordingSessionResult({
    required this.sessionId,
    required this.frontVideoPath,
    required this.backVideoPath,
    required this.stereoAudioPath,
    required this.duration,
  });
}

/// Fallback service when dual-camera is not supported
/// Uses single camera + option to import second video
class SingleCameraFallback {
  static const _channel = MethodChannel('com.stori/single_camera');

  Future<int> initialize({bool useFrontCamera = true}) async {
    final result = await _channel.invokeMethod<Map>('initialize', {
      'useFrontCamera': useFrontCamera,
    });
    return result!['textureId'] as int;
  }

  Future<String> startRecording() async {
    final dir = await getApplicationDocumentsDirectory();
    final path = '${dir.path}/recordings/${const Uuid().v4()}.mp4';
    await _channel.invokeMethod('startRecording', {'path': path});
    return path;
  }

  Future<void> stopRecording() async {
    await _channel.invokeMethod('stopRecording');
  }

  Future<void> dispose() async {
    await _channel.invokeMethod('dispose');
  }
}
