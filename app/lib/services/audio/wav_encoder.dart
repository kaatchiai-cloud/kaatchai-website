import 'dart:typed_data';

/// WAV file encoder — ported from audioBufferToWavBlob() in 12-buffer-ops.js
class WavEncoder {
  /// Encode PCM samples to WAV file bytes
  /// [samples] — interleaved Float64 samples (-1.0 to 1.0)
  /// [sampleRate] — e.g., 44100
  /// [channels] — 1 (mono) or 2 (stereo)
  static Uint8List encode(Float64List samples, int sampleRate, int channels) {
    final numSamples = samples.length;
    final bitsPerSample = 16;
    final bytesPerSample = bitsPerSample ~/ 8;
    final blockAlign = channels * bytesPerSample;
    final byteRate = sampleRate * blockAlign;
    final dataSize = numSamples * bytesPerSample;
    final fileSize = 44 + dataSize;

    final buffer = ByteData(fileSize);
    int offset = 0;

    // RIFF header
    _writeString(buffer, offset, 'RIFF');
    offset += 4;
    buffer.setUint32(offset, fileSize - 8, Endian.little);
    offset += 4;
    _writeString(buffer, offset, 'WAVE');
    offset += 4;

    // fmt chunk
    _writeString(buffer, offset, 'fmt ');
    offset += 4;
    buffer.setUint32(offset, 16, Endian.little); // fmt chunk size
    offset += 4;
    buffer.setUint16(offset, 1, Endian.little); // PCM format
    offset += 2;
    buffer.setUint16(offset, channels, Endian.little);
    offset += 2;
    buffer.setUint32(offset, sampleRate, Endian.little);
    offset += 4;
    buffer.setUint32(offset, byteRate, Endian.little);
    offset += 4;
    buffer.setUint16(offset, blockAlign, Endian.little);
    offset += 2;
    buffer.setUint16(offset, bitsPerSample, Endian.little);
    offset += 2;

    // data chunk
    _writeString(buffer, offset, 'data');
    offset += 4;
    buffer.setUint32(offset, dataSize, Endian.little);
    offset += 4;

    // Write samples as 16-bit PCM
    // Ported from JS: negative → s * 0x8000, positive → s * 0x7FFF
    for (int i = 0; i < numSamples; i++) {
      final s = samples[i].clamp(-1.0, 1.0);
      final int16 = s < 0
          ? (s * 0x8000).round().clamp(-32768, 32767)
          : (s * 0x7FFF).round().clamp(-32768, 32767);
      buffer.setInt16(offset, int16, Endian.little);
      offset += 2;
    }

    return buffer.buffer.asUint8List();
  }

  static void _writeString(ByteData data, int offset, String str) {
    for (int i = 0; i < str.length; i++) {
      data.setUint8(offset + i, str.codeUnitAt(i));
    }
  }
}
