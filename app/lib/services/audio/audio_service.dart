import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'package:just_audio/just_audio.dart';
import 'package:path_provider/path_provider.dart';
import 'wav_encoder.dart';

/// Audio playback and buffer management service
/// Replaces WaveSurfer.js + Web Audio API from the web app
class AudioService {
  final AudioPlayer _player = AudioPlayer();
  final AudioPlayer _bgmPlayer = AudioPlayer();

  // Raw PCM data for waveform rendering and editing
  Float64List? _samples; // interleaved or mono samples
  int _sampleRate = 44100;
  int _channels = 1;

  // Undo stack
  final List<_AudioSnapshot> _undoStack = [];
  static const int _maxUndo = 20;

  // Current time stream
  Stream<double> get positionStream =>
      _player.positionStream.map((d) => d.inMilliseconds / 1000.0);

  Stream<bool> get playingStream => _player.playingStream;

  double get duration => _player.duration?.inMilliseconds.toDouble() ?? 0 / 1000.0;

  bool get isPlaying => _player.playing;

  Float64List? get samples => _samples;
  int get sampleRate => _sampleRate;
  int get channels => _channels;
  int get totalSamples => _samples?.length ?? 0;

  /// Duration computed from samples (more accurate than player)
  double get sampleDuration {
    if (_samples == null || _sampleRate == 0) return 0;
    return _samples!.length / (_sampleRate * _channels);
  }

  /// Load audio from file path
  Future<double> loadFile(String filePath) async {
    // Load into player
    final audioDuration = await _player.setFilePath(filePath);

    // Decode PCM samples for waveform and editing
    await _decodePcm(filePath);

    return audioDuration?.inMilliseconds.toDouble() ?? 0 / 1000.0;
  }

  /// Load audio from raw PCM samples
  Future<void> loadFromSamples(
      Float64List samples, int sampleRate, int channels) async {
    _samples = samples;
    _sampleRate = sampleRate;
    _channels = channels;

    // Write to temp WAV file for player
    final path = await _samplesToTempFile();
    await _player.setFilePath(path);
  }

  /// Decode PCM from file using raw byte reading (WAV format)
  Future<void> _decodePcm(String filePath) async {
    final file = File(filePath);
    final bytes = await file.readAsBytes();

    // Check if WAV
    if (bytes.length > 44 &&
        bytes[0] == 0x52 && // R
        bytes[1] == 0x49 && // I
        bytes[2] == 0x46 && // F
        bytes[3] == 0x46) {
      // F
      _decodeWav(bytes);
    } else {
      // For non-WAV files, generate placeholder peaks
      // Full decoding would use FFmpeg
      _samples = Float64List(44100); // 1 second of silence as placeholder
      _sampleRate = 44100;
      _channels = 1;
    }
  }

  /// Parse WAV file bytes into PCM samples
  void _decodeWav(Uint8List bytes) {
    final data = ByteData.sublistView(bytes);

    // Read fmt chunk
    _channels = data.getUint16(22, Endian.little);
    _sampleRate = data.getUint32(24, Endian.little);
    final bitsPerSample = data.getUint16(34, Endian.little);

    // Find data chunk
    int dataOffset = 36;
    while (dataOffset < bytes.length - 8) {
      final chunkId = String.fromCharCodes(bytes.sublist(dataOffset, dataOffset + 4));
      final chunkSize = data.getUint32(dataOffset + 4, Endian.little);
      if (chunkId == 'data') {
        dataOffset += 8;
        final numSamples = chunkSize ~/ (bitsPerSample ~/ 8);
        _samples = Float64List(numSamples);

        if (bitsPerSample == 16) {
          for (int i = 0; i < numSamples; i++) {
            final bytePos = dataOffset + i * 2;
            if (bytePos + 1 >= bytes.length) break;
            final sample = data.getInt16(bytePos, Endian.little);
            _samples![i] = sample / 32768.0;
          }
        } else if (bitsPerSample == 32) {
          for (int i = 0; i < numSamples; i++) {
            final bytePos = dataOffset + i * 4;
            if (bytePos + 3 >= bytes.length) break;
            _samples![i] = data.getFloat32(bytePos, Endian.little);
          }
        }
        return;
      }
      dataOffset += 8 + chunkSize;
      if (chunkSize.isOdd) dataOffset++; // padding
    }

    // Fallback
    _samples = Float64List(0);
  }

  /// Write current samples to temp WAV file and return path
  Future<String> _samplesToTempFile() async {
    final dir = await getTemporaryDirectory();
    final path = '${dir.path}/stori_audio_${DateTime.now().millisecondsSinceEpoch}.wav';
    final wavBytes = WavEncoder.encode(_samples!, _sampleRate, _channels);
    await File(path).writeAsBytes(wavBytes);
    return path;
  }

  // ── Playback ──

  Future<void> play() async => await _player.play();
  Future<void> pause() async => await _player.pause();
  Future<void> stop() async {
    await _player.pause();
    await _player.seek(Duration.zero);
  }

  Future<void> seekTo(double seconds) async {
    await _player.seek(Duration(milliseconds: (seconds * 1000).round()));
  }

  /// Play a specific region
  Future<void> playRegion(double startSec, double endSec) async {
    await seekTo(startSec);
    await play();

    // Auto-stop at end of region
    _player.positionStream.listen((pos) {
      if (pos.inMilliseconds / 1000.0 >= endSec && _player.playing) {
        pause();
      }
    });
  }

  // ── Buffer Operations (ported from 12-buffer-ops.js) ──

  /// Save current state to undo stack
  void _pushUndo() {
    if (_samples == null) return;
    _undoStack.add(_AudioSnapshot(
      samples: Float64List.fromList(_samples!),
      sampleRate: _sampleRate,
      channels: _channels,
    ));
    if (_undoStack.length > _maxUndo) {
      _undoStack.removeAt(0);
    }
  }

  /// Undo last edit
  Future<bool> undo() async {
    if (_undoStack.isEmpty) return false;
    final snapshot = _undoStack.removeLast();
    _samples = snapshot.samples;
    _sampleRate = snapshot.sampleRate;
    _channels = snapshot.channels;
    final path = await _samplesToTempFile();
    await _player.setFilePath(path);
    return true;
  }

  bool get canUndo => _undoStack.isNotEmpty;

  /// Extract region — keep only the selected portion
  /// Ported from extractRegion(b, s, e) in 12-buffer-ops.js
  Future<void> extractRegion(double startSec, double endSec) async {
    if (_samples == null) return;
    _pushUndo();

    final sr = _sampleRate;
    final nc = _channels;
    final s0 = (startSec * sr * nc).round().clamp(0, _samples!.length);
    final s1 = (endSec * sr * nc).round().clamp(0, _samples!.length);
    final len = s1 - s0;
    if (len <= 0) return;

    _samples = Float64List.fromList(_samples!.sublist(s0, s1));

    final path = await _samplesToTempFile();
    await _player.setFilePath(path);
  }

  /// Delete region — remove the selected portion
  /// Ported from deleteRegion(b, s, e) in 12-buffer-ops.js
  Future<void> deleteRegion(double startSec, double endSec) async {
    if (_samples == null) return;
    _pushUndo();

    final sr = _sampleRate;
    final nc = _channels;
    final s0 = (startSec * sr * nc).round().clamp(0, _samples!.length);
    final s1 = (endSec * sr * nc).round().clamp(0, _samples!.length);
    final removeLen = s1 - s0;
    if (removeLen <= 0) return;

    final newLen = _samples!.length - removeLen;
    if (newLen <= 0) return;

    final result = Float64List(newLen);
    // Copy [0, s0)
    for (int i = 0; i < s0; i++) {
      result[i] = _samples![i];
    }
    // Copy [s1, end)
    for (int i = s1; i < _samples!.length; i++) {
      result[i - removeLen] = _samples![i];
    }

    _samples = result;
    final path = await _samplesToTempFile();
    await _player.setFilePath(path);
  }

  /// Insert audio at position
  /// Ported from insertAudioAt(mb, ib, at) in 12-buffer-ops.js
  Future<void> insertAudioAt(
      Float64List insertSamples, double atSec) async {
    if (_samples == null) return;
    _pushUndo();

    final sr = _sampleRate;
    final nc = _channels;
    final insertPos = (atSec * sr * nc).round().clamp(0, _samples!.length);

    final newLen = _samples!.length + insertSamples.length;
    final result = Float64List(newLen);

    // Copy [0, insertPos) from main
    for (int i = 0; i < insertPos; i++) {
      result[i] = _samples![i];
    }
    // Copy insert samples
    for (int i = 0; i < insertSamples.length; i++) {
      result[insertPos + i] = insertSamples[i];
    }
    // Copy [insertPos, end) from main
    for (int i = insertPos; i < _samples!.length; i++) {
      result[i + insertSamples.length] = _samples![i];
    }

    _samples = result;
    final path = await _samplesToTempFile();
    await _player.setFilePath(path);
  }

  // ── BGM ──

  Future<void> loadBgm(String filePath) async {
    await _bgmPlayer.setFilePath(filePath);
    await _bgmPlayer.setLoopMode(LoopMode.one);
  }

  Future<void> setBgmVolume(double volume) async {
    await _bgmPlayer.setVolume(volume);
  }

  Future<void> setBgmLoop(bool loop) async {
    await _bgmPlayer.setLoopMode(loop ? LoopMode.one : LoopMode.off);
  }

  Future<void> playBgm() async => await _bgmPlayer.play();
  Future<void> stopBgm() async => await _bgmPlayer.stop();
  Future<void> removeBgm() async {
    await _bgmPlayer.stop();
  }

  // ── Cleanup ──

  Future<void> dispose() async {
    await _player.dispose();
    await _bgmPlayer.dispose();
  }
}

class _AudioSnapshot {
  final Float64List samples;
  final int sampleRate;
  final int channels;

  _AudioSnapshot({
    required this.samples,
    required this.sampleRate,
    required this.channels,
  });
}
