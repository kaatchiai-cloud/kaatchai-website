/// App-wide constants
class AppConstants {
  // Timeline defaults
  static const double defaultPhotoDuration = 5.0;
  static const double defaultTransDuration = 0.5;
  static const double defaultTextDuration = 3.0;
  static const double defaultAnimDuration = 0.5;
  static const double pixelsPerSecond = 40.0;
  static const double minZoom = 1.0;
  static const double maxZoom = 10.0;

  // Audio
  static const int defaultSampleRate = 44100;
  static const int maxUndoStack = 20;
  static const double defaultBgmVolume = 0.3;

  // PiP defaults
  static const String defaultPipPosition = 'bot-right';
  static const double defaultPipSize = 25.0;
  static const String defaultPipShape = 'circle';
  static const double defaultPipBorder = 3.0;
  static const String defaultPipBorderColor = '#ffffff';
  static const bool defaultPipShadow = true;

  // Export
  static const String defaultImageSize = '1280x720';
  static const String defaultExportQuality = 'balanced';
  static const int defaultExportFps = 24;

  // Preview
  static const double inlinePreviewMaxWidth = 480.0;
  static const int previewFps = 30;

  // Silence detection defaults
  static const double defaultSilenceThreshold = -35.0; // dB
  static const double defaultMinSilenceDuration = 0.5; // seconds

  // Image cache
  static const int maxImageCacheSize = 50;

  // Project gallery
  static const int maxRecentProjects = 20;
  static const double thumbnailWidth = 320.0;
  static const double thumbnailHeight = 180.0;

  // Recording
  static const double speakerDetectionWindowMs = 200.0;
  static const double speakerSilenceThresholdDb = -40.0;

  // API rate limits
  static const int freeImageGenPerMin = 2;
  static const double paidImageCostPerImage = 0.04;
}
