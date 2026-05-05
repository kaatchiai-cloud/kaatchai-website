import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/colors.dart';
import '../../providers/recording_provider.dart';
import '../../services/camera/dual_camera_service.dart';
import '../../services/camera/speaker_detector.dart';
import '../../services/audio/noise_cancellation.dart';
import '../../models/recording_session.dart';

class RecordScreen extends ConsumerStatefulWidget {
  const RecordScreen({super.key});

  @override
  ConsumerState<RecordScreen> createState() => _RecordScreenState();
}

class _RecordScreenState extends ConsumerState<RecordScreen> {
  final _cameraService = DualCameraService();
  final _speakerDetector = SpeakerDetector();
  final _noiseCancellation = NoiseCancellationService();

  bool _initialized = false;
  bool _dualSupported = false;
  Timer? _elapsedTimer;
  String _quality = '720p';

  @override
  void initState() {
    super.initState();
    _checkSupport();
  }

  Future<void> _checkSupport() async {
    try {
      final supported = await _cameraService.isDualCameraSupported();
      setState(() => _dualSupported = supported);
      ref.read(recordingProvider.notifier).setDualCameraSupported(supported);
    } catch (_) {
      setState(() => _dualSupported = false);
    }
  }

  Future<void> _initializeCameras() async {
    try {
      await _cameraService.initialize(quality: _quality);

      // Set up audio level callbacks for speaker detection
      _cameraService.onAudioLevels = (hostLevel, guestLevel) {
        final recording = ref.read(recordingProvider);
        if (!recording.isRecording) return;

        _speakerDetector.processFrame(
          hostLevel,
          guestLevel,
          recording.elapsedSeconds,
        );

        ref.read(recordingProvider.notifier)
            .updateSpeakerLevels(hostLevel, guestLevel);
      };

      _cameraService.onError = (error) {
        _showError(error);
      };

      setState(() => _initialized = true);
    } catch (e) {
      _showError('Failed to initialize cameras: $e');
    }
  }

  Future<void> _startRecording() async {
    if (!_initialized) await _initializeCameras();

    try {
      await _cameraService.startRecording();
      _speakerDetector.reset();

      ref.read(recordingProvider.notifier).startRecording();

      // Start elapsed timer
      _elapsedTimer = Timer.periodic(const Duration(seconds: 1), (_) {
        final state = ref.read(recordingProvider);
        if (state.isRecording && !state.isPaused) {
          ref.read(recordingProvider.notifier)
              .updateElapsed(state.elapsedSeconds + 1);
        }
      });
    } catch (e) {
      _showError('Failed to start recording: $e');
    }
  }

  Future<void> _stopRecording() async {
    _elapsedTimer?.cancel();
    _elapsedTimer = null;

    try {
      final result = await _cameraService.stopRecording();
      ref.read(recordingProvider.notifier).stopRecording();

      // Get speaker timeline
      final speakerTimeline = _speakerDetector.finalize(result.duration);
      final smoothed = PostRecordingSpeakerAnalyzer.smooth(speakerTimeline);

      // Start noise cancellation processing
      ref.read(recordingProvider.notifier).setProcessing(true);

      _noiseCancellation.onProgress = (progress) {
        ref.read(recordingProvider.notifier).updateProcessingProgress(progress);
      };

      final ncResult = await _noiseCancellation.process(
        stereoAudioPath: result.stereoAudioPath,
        speakerTimeline: smoothed,
      );

      // Create completed session
      final session = RecordingSession(
        id: result.sessionId,
        frontVideoPath: result.frontVideoPath,
        backVideoPath: result.backVideoPath,
        stereoAudioPath: result.stereoAudioPath,
        speakerTimeline: smoothed,
        duration: result.duration,
        hostCleanAudioPath: ncResult.hostCleanPath,
        guestCleanAudioPath: ncResult.guestCleanPath,
        mixedCleanAudioPath: ncResult.mixedCleanPath,
      );

      ref.read(recordingProvider.notifier).setCompletedSession(session);
    } catch (e) {
      ref.read(recordingProvider.notifier).setProcessing(false);
      _showError('Error processing recording: $e');
    }
  }

  Future<void> _pauseResume() async {
    final state = ref.read(recordingProvider);
    if (state.isPaused) {
      await _cameraService.resumeRecording();
      ref.read(recordingProvider.notifier).resumeRecording();
    } else {
      await _cameraService.pauseRecording();
      ref.read(recordingProvider.notifier).pauseRecording();
    }
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: AppColors.red,
      ),
    );
  }

  @override
  void dispose() {
    _elapsedTimer?.cancel();
    _cameraService.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final recording = ref.watch(recordingProvider);
    final screenHeight = MediaQuery.of(context).size.height;

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        title: const Text('Dual-Camera Podcast'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: recording.isRecording ? null : () => Navigator.pop(context),
        ),
        actions: [
          if (!recording.isRecording)
            PopupMenuButton<String>(
              icon: const Icon(Icons.settings_rounded),
              onSelected: (value) => setState(() => _quality = value),
              itemBuilder: (_) => [
                PopupMenuItem(
                  value: '720p',
                  child: Row(
                    children: [
                      if (_quality == '720p')
                        const Icon(Icons.check, size: 16, color: AppColors.accent),
                      if (_quality == '720p') const SizedBox(width: 8),
                      const Text('720p'),
                    ],
                  ),
                ),
                PopupMenuItem(
                  value: '1080p',
                  child: Row(
                    children: [
                      if (_quality == '1080p')
                        const Icon(Icons.check, size: 16, color: AppColors.accent),
                      if (_quality == '1080p') const SizedBox(width: 8),
                      const Text('1080p'),
                    ],
                  ),
                ),
              ],
            ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Dual camera support status
            if (!_dualSupported)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                color: AppColors.amberSoft,
                child: const Row(
                  children: [
                    Icon(Icons.info_outline, size: 16, color: AppColors.amber),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Dual-camera not supported. Using single camera mode.',
                        style: TextStyle(color: AppColors.amber, fontSize: 12),
                      ),
                    ),
                  ],
                ),
              ),

            // Camera previews
            Expanded(
              child: Stack(
                children: [
                  // Host camera (front) — top section
                  Positioned(
                    top: 0,
                    left: 0,
                    right: 0,
                    height: screenHeight * 0.32,
                    child: _CameraPreview(
                      label: 'Host',
                      icon: Icons.person,
                      isActive: recording.activeSpeaker == 'host',
                      audioLevel: recording.hostLevel,
                      isRecording: recording.isRecording,
                    ),
                  ),

                  // Divider between cameras
                  Positioned(
                    top: screenHeight * 0.32 - 1,
                    left: 0,
                    right: 0,
                    child: Container(
                      height: 2,
                      color: recording.isRecording ? AppColors.red : AppColors.border,
                    ),
                  ),

                  // Guest camera (back) — bottom section
                  Positioned(
                    top: screenHeight * 0.32,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    child: _CameraPreview(
                      label: 'Guest',
                      icon: Icons.person_outline,
                      isActive: recording.activeSpeaker == 'guest',
                      audioLevel: recording.guestLevel,
                      isRecording: recording.isRecording,
                    ),
                  ),

                  // Speaker indicator overlay
                  if (recording.isRecording)
                    Positioned(
                      top: 12,
                      left: 0,
                      right: 0,
                      child: Center(
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 5),
                          decoration: BoxDecoration(
                            color: Colors.black.withAlpha(153),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                width: 8,
                                height: 8,
                                decoration: const BoxDecoration(
                                  color: AppColors.red,
                                  shape: BoxShape.circle,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Text(
                                _formatTime(recording.elapsedSeconds),
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 16,
                                  fontWeight: FontWeight.w600,
                                  fontFeatures: [FontFeature.tabularFigures()],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),

            // Processing indicator
            if (recording.isProcessing)
              Container(
                padding: const EdgeInsets.all(16),
                color: AppColors.bgSecondary,
                child: Column(
                  children: [
                    Row(
                      children: [
                        const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: AppColors.accent,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Text(
                          _processingLabel(recording.processingProgress),
                          style: const TextStyle(
                              color: AppColors.textSecondary, fontSize: 13),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(
                        value: recording.processingProgress,
                        backgroundColor: AppColors.bgElevated,
                        valueColor:
                            const AlwaysStoppedAnimation(AppColors.accent),
                        minHeight: 4,
                      ),
                    ),
                  ],
                ),
              ),

            // Controls bar
            Container(
              padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 32),
              color: AppColors.bgPrimary,
              child: recording.completedSession != null && !recording.isRecording
                  ? _CompletedControls(
                      onReRecord: () {
                        ref.read(recordingProvider.notifier).clear();
                      },
                      onSendToCreate: () {
                        Navigator.pushReplacementNamed(context, '/create');
                      },
                      duration: recording.completedSession!.duration,
                      speakerCount:
                          recording.completedSession!.speakerTimeline.length,
                    )
                  : Row(
                      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                      children: [
                        // Swap cameras
                        _ControlButton(
                          icon: Icons.cameraswitch_rounded,
                          label: 'Swap',
                          onTap: recording.isRecording
                              ? null
                              : () => _cameraService.swapCameras(),
                        ),

                        // Record / Stop
                        _RecordButton(
                          isRecording: recording.isRecording,
                          onTap: recording.isRecording
                              ? _stopRecording
                              : _startRecording,
                        ),

                        // Pause / Resume (only while recording)
                        _ControlButton(
                          icon: recording.isPaused
                              ? Icons.play_arrow_rounded
                              : Icons.pause_rounded,
                          label: recording.isPaused ? 'Resume' : 'Pause',
                          onTap: recording.isRecording ? _pauseResume : null,
                        ),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatTime(double seconds) {
    final mins = (seconds / 60).floor();
    final secs = (seconds % 60).floor();
    return '${mins.toString().padLeft(2, '0')}:${secs.toString().padLeft(2, '0')}';
  }

  String _processingLabel(double progress) {
    if (progress < 0.3) return 'Splitting audio channels...';
    if (progress < 0.6) return 'Removing noise...';
    if (progress < 0.8) return 'Normalizing volume...';
    return 'Mixing final audio...';
  }
}

// ── Camera Preview Widget ──

class _CameraPreview extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool isActive;
  final double audioLevel;
  final bool isRecording;

  const _CameraPreview({
    required this.label,
    required this.icon,
    required this.isActive,
    required this.audioLevel,
    required this.isRecording,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.bgElevated,
        border: isActive && isRecording
            ? Border.all(color: AppColors.green, width: 3)
            : null,
      ),
      child: Stack(
        children: [
          // Camera preview placeholder (will be replaced with Texture widget)
          const Center(
            child: Icon(Icons.videocam, size: 48, color: AppColors.textMuted),
          ),

          // Label badge
          Positioned(
            bottom: 8,
            left: 8,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.black.withAlpha(153),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(icon, size: 14,
                      color: isActive ? AppColors.green : Colors.white70),
                  const SizedBox(width: 4),
                  Text(
                    label,
                    style: TextStyle(
                      color: isActive ? AppColors.green : Colors.white70,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Audio level bar
          if (isRecording)
            Positioned(
              right: 8,
              top: 8,
              bottom: 8,
              child: Container(
                width: 4,
                decoration: BoxDecoration(
                  color: AppColors.bgPrimary.withAlpha(128),
                  borderRadius: BorderRadius.circular(2),
                ),
                child: Align(
                  alignment: Alignment.bottomCenter,
                  child: FractionallySizedBox(
                    heightFactor: audioLevel.clamp(0.0, 1.0),
                    child: Container(
                      decoration: BoxDecoration(
                        color: isActive ? AppColors.green : AppColors.textMuted,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                ),
              ),
            ),

          // Speaking indicator
          if (isActive && isRecording)
            Positioned(
              top: 8,
              left: 8,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.green,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Text(
                  'SPEAKING',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ── Control Widgets ──

class _RecordButton extends StatelessWidget {
  final bool isRecording;
  final VoidCallback onTap;

  const _RecordButton({required this.isRecording, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 72,
        height: 72,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 4),
        ),
        child: Center(
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            width: isRecording ? 28 : 56,
            height: isRecording ? 28 : 56,
            decoration: BoxDecoration(
              color: AppColors.red,
              borderRadius:
                  BorderRadius.circular(isRecording ? 6 : 28),
            ),
          ),
        ),
      ),
    );
  }
}

class _ControlButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  const _ControlButton({
    required this.icon,
    required this.label,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: 28,
            color: enabled ? Colors.white : AppColors.textMuted,
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: TextStyle(
              color: enabled ? Colors.white70 : AppColors.textMuted,
              fontSize: 11,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Completed Recording Controls ──

class _CompletedControls extends StatelessWidget {
  final VoidCallback onReRecord;
  final VoidCallback onSendToCreate;
  final double duration;
  final int speakerCount;

  const _CompletedControls({
    required this.onReRecord,
    required this.onSendToCreate,
    required this.duration,
    required this.speakerCount,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Recording summary
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.greenSoft,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              const Icon(Icons.check_circle, color: AppColors.green, size: 20),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Recording complete',
                      style: TextStyle(
                        color: AppColors.green,
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                    ),
                    Text(
                      '${_fmtDuration(duration)} recorded, $speakerCount speaker segments detected',
                      style: const TextStyle(
                        color: AppColors.textSecondary,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),

        // Action buttons
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: onReRecord,
                icon: const Icon(Icons.refresh, size: 18),
                label: const Text('Re-record'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              flex: 2,
              child: ElevatedButton.icon(
                onPressed: onSendToCreate,
                icon: const Icon(Icons.auto_awesome, size: 18),
                label: const Text('Create Video'),
              ),
            ),
          ],
        ),
      ],
    );
  }

  String _fmtDuration(double seconds) {
    final mins = (seconds / 60).floor();
    final secs = (seconds % 60).floor();
    if (mins > 0) return '${mins}m ${secs}s';
    return '${secs}s';
  }
}
