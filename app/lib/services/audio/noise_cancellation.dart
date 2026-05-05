import 'dart:io';
import '../ffmpeg_stub.dart';
import 'package:path_provider/path_provider.dart';
import '../../models/recording_session.dart';

/// 3-layer noise cancellation pipeline
///
/// Layer 1: OS-level (handled by platform channel during recording)
/// Layer 2: RNNoise via FFI (real-time during recording — future phase)
/// Layer 3: FFmpeg post-processing (this class)
class NoiseCancellationService {
  /// Progress callback: 0.0 to 1.0
  void Function(double progress)? onProgress;

  /// Process stereo audio from dual-camera recording
  /// Splits channels, denoises each, normalizes, and cross-gates
  ///
  /// Returns paths to:
  /// - host_clean.wav (isolated host audio)
  /// - guest_clean.wav (isolated guest audio)
  /// - mixed_clean.wav (balanced mix for AI pipeline)
  Future<NoiseCancellationResult> process({
    required String stereoAudioPath,
    required List<SpeakerSegment> speakerTimeline,
    double noiseFloor = -25, // dB for afftdn
    int highpassFreq = 200, // Hz
    int lowpassFreq = 3400, // Hz — voice range
  }) async {
    final dir = await getApplicationDocumentsDirectory();
    final tempDir = '${dir.path}/temp_audio';
    await Directory(tempDir).create(recursive: true);

    final hostPath = '$tempDir/host_clean.wav';
    final guestPath = '$tempDir/guest_clean.wav';
    final mixedPath = '$tempDir/mixed_clean.wav';

    onProgress?.call(0.1);

    // Step 1: Split stereo to mono channels + denoise + filter + normalize
    final splitCmd = _buildSplitAndCleanCommand(
      input: stereoAudioPath,
      hostOutput: hostPath,
      guestOutput: guestPath,
      noiseFloor: noiseFloor,
      highpassFreq: highpassFreq,
      lowpassFreq: lowpassFreq,
    );

    final splitResult = await FFmpegKit.execute(splitCmd);
    final splitCode = await splitResult.getReturnCode();

    if (!ReturnCode.isSuccess(splitCode)) {
      final logs = await splitResult.getLogsAsString();
      throw Exception('FFmpeg split failed: $logs');
    }

    onProgress?.call(0.5);

    // Step 2: Apply cross-gate using speaker timeline
    // When host speaks, suppress guest's channel and vice versa
    final hostGated = '$tempDir/host_gated.wav';
    final guestGated = '$tempDir/guest_gated.wav';

    await _applyCrossGate(
      hostInput: hostPath,
      guestInput: guestPath,
      hostOutput: hostGated,
      guestOutput: guestGated,
      speakerTimeline: speakerTimeline,
    );

    onProgress?.call(0.75);

    // Step 3: Mix both channels to balanced mono/stereo output
    final mixCmd = '-y -i "$hostGated" -i "$guestGated" '
        '-filter_complex "[0:a][1:a]amix=inputs=2:duration=longest:dropout_transition=0.5,loudnorm=I=-16:TP=-1.5:LRA=11[out]" '
        '-map "[out]" "$mixedPath"';

    final mixResult = await FFmpegKit.execute(mixCmd);
    final mixCode = await mixResult.getReturnCode();

    if (!ReturnCode.isSuccess(mixCode)) {
      final logs = await mixResult.getLogsAsString();
      throw Exception('FFmpeg mix failed: $logs');
    }

    onProgress?.call(1.0);

    // Use gated versions as final clean outputs
    return NoiseCancellationResult(
      hostCleanPath: hostGated,
      guestCleanPath: guestGated,
      mixedCleanPath: mixedPath,
    );
  }

  /// Build FFmpeg command to split stereo, denoise each channel, and normalize
  String _buildSplitAndCleanCommand({
    required String input,
    required String hostOutput,
    required String guestOutput,
    required double noiseFloor,
    required int highpassFreq,
    required int lowpassFreq,
  }) {
    // filter_complex:
    // 1. Split stereo into left (host) and right (guest)
    // 2. Each channel: afftdn → highpass → lowpass → loudnorm
    return '-y -i "$input" -filter_complex "'
        '[0:a]channelsplit=channel_layout=stereo[left][right];'
        '[left]afftdn=nf=$noiseFloor,highpass=f=$highpassFreq,lowpass=f=$lowpassFreq,loudnorm=I=-16:TP=-1.5:LRA=11[host];'
        '[right]afftdn=nf=$noiseFloor,highpass=f=$highpassFreq,lowpass=f=$lowpassFreq,loudnorm=I=-16:TP=-1.5:LRA=11[guest]'
        '" -map "[host]" "$hostOutput" -map "[guest]" "$guestOutput"';
  }

  /// Apply cross-gating: suppress inactive speaker's channel
  /// Uses volume filter with enable expressions based on speaker timeline
  Future<void> _applyCrossGate({
    required String hostInput,
    required String guestInput,
    required String hostOutput,
    required String guestOutput,
    required List<SpeakerSegment> speakerTimeline,
  }) async {
    // Build volume enable expressions
    // When host speaks: host volume = 1.0, guest volume = 0.15 (not zero — keeps ambient)
    // When guest speaks: guest volume = 1.0, host volume = 0.15
    // When both silent: both at 0.3

    final hostSegments =
        speakerTimeline.where((s) => s.speakerId == 'host').toList();
    final guestSegments =
        speakerTimeline.where((s) => s.speakerId == 'guest').toList();

    // If no speaker timeline, just copy files
    if (speakerTimeline.isEmpty) {
      await File(hostInput).copy(hostOutput);
      await File(guestInput).copy(guestOutput);
      return;
    }

    // Build FFmpeg volume filter for host channel
    // During guest segments, reduce host volume
    final hostFilter = _buildVolumeFilter(guestSegments, 0.15);
    final guestFilter = _buildVolumeFilter(hostSegments, 0.15);

    // Apply to host
    final hostCmd =
        '-y -i "$hostInput" -af "$hostFilter" "$hostOutput"';
    final hostResult = await FFmpegKit.execute(hostCmd);
    if (!ReturnCode.isSuccess(await hostResult.getReturnCode())) {
      // Fallback: just copy
      await File(hostInput).copy(hostOutput);
    }

    // Apply to guest
    final guestCmd =
        '-y -i "$guestInput" -af "$guestFilter" "$guestOutput"';
    final guestResult = await FFmpegKit.execute(guestCmd);
    if (!ReturnCode.isSuccess(await guestResult.getReturnCode())) {
      await File(guestInput).copy(guestOutput);
    }
  }

  /// Build a volume filter that reduces volume during specified segments
  String _buildVolumeFilter(
      List<SpeakerSegment> suppressDuring, double suppressLevel) {
    if (suppressDuring.isEmpty) return 'volume=1.0';

    // Use volume with enable expression
    // enable='between(t,start1,end1)+between(t,start2,end2)+...'
    final conditions = suppressDuring
        .map((s) =>
            'between(t,${s.startTime.toStringAsFixed(3)},${s.endTime.toStringAsFixed(3)})')
        .join('+');

    // When condition is true (other person speaking), reduce volume
    // volume=if(condition, suppressLevel, 1.0)
    return "volume='if($conditions,$suppressLevel,1.0)':eval=frame";
  }

  /// Quick single-file denoise (for non-dual-camera audio)
  Future<String> denoiseFile({
    required String inputPath,
    double noiseFloor = -25,
    int highpassFreq = 200,
    int lowpassFreq = 3400,
  }) async {
    final dir = await getApplicationDocumentsDirectory();
    final outputPath = '${dir.path}/temp_audio/denoised_${DateTime.now().millisecondsSinceEpoch}.wav';
    await Directory('${dir.path}/temp_audio').create(recursive: true);

    final cmd = '-y -i "$inputPath" '
        '-af "afftdn=nf=$noiseFloor,highpass=f=$highpassFreq,lowpass=f=$lowpassFreq,loudnorm=I=-16:TP=-1.5:LRA=11" '
        '"$outputPath"';

    final result = await FFmpegKit.execute(cmd);
    final code = await result.getReturnCode();

    if (!ReturnCode.isSuccess(code)) {
      final logs = await result.getLogsAsString();
      throw Exception('FFmpeg denoise failed: $logs');
    }

    return outputPath;
  }
}

class NoiseCancellationResult {
  final String hostCleanPath;
  final String guestCleanPath;
  final String mixedCleanPath;

  NoiseCancellationResult({
    required this.hostCleanPath,
    required this.guestCleanPath,
    required this.mixedCleanPath,
  });
}
