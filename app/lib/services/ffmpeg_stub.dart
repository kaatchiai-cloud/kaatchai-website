/// Stub for FFmpeg functionality until ffmpeg_kit_flutter_new or
/// native FFmpeg integration is added.
///
/// The ffmpeg_kit_flutter package was discontinued. This stub provides
/// the same API surface so the app compiles and runs.
/// Export and noise cancellation will show "FFmpeg not available" until
/// a replacement is integrated.

class FFmpegKit {
  static Future<FFmpegSession> execute(String command) async {
    return FFmpegSession._stub();
  }

  static void cancel() {}
}

class FFmpegSession {
  FFmpegSession._stub();

  Future<ReturnCode?> getReturnCode() async {
    return ReturnCode._error();
  }

  Future<String?> getLogsAsString() async {
    return 'FFmpeg not available — ffmpeg_kit_flutter is discontinued. '
        'Integration with native FFmpeg or ffmpeg_kit_flutter_new pending.';
  }
}

class ReturnCode {
  final int _value;
  ReturnCode._error() : _value = 1;

  static bool isSuccess(ReturnCode? code) {
    return code != null && code._value == 0;
  }
}
