/// All available transition types (23 total)
/// Keys match the web app's TRANSITIONS map in 01-core.js
enum TransitionType {
  none('none', 'Cut', ''),
  fade('fade', 'Fade', ''),
  crossfade('crossfade', 'X-Fade', ''),
  slideLeft('slide-left', 'Slide Left', ''),
  slideRight('slide-right', 'Slide Right', ''),
  slideUp('slide-up', 'Slide Up', ''),
  slideDown('slide-down', 'Slide Down', ''),
  whipPan('whip-pan', 'Whip Pan', ''),
  zoomIn('zoom-in', 'Zoom In', ''),
  zoomOut('zoom-out', 'Zoom Out', ''),
  rotate('rotate', 'Rotate', ''),
  parallax('parallax', 'Parallax', ''),
  iris('iris', 'Iris', ''),
  wipeRight('wipe-right', 'Wipe Right', ''),
  wipeDiagonal('wipe-diagonal', 'Wipe Diagonal', ''),
  splitH('split-h', 'Split H', ''),
  splitV('split-v', 'Split V', ''),
  dissolve('dissolve', 'Dissolve', ''),
  blur('blur', 'Blur', ''),
  flash('flash', 'Flash', ''),
  lightLeak('light-leak', 'Light Leak', ''),
  glitch('glitch', 'Glitch', ''),
  filmGrain('film-grain', 'Film Grain', '');

  final String key;
  final String label;
  final String icon;

  const TransitionType(this.key, this.label, this.icon);

  static TransitionType fromKey(String key) {
    return TransitionType.values.firstWhere(
      (t) => t.key == key,
      orElse: () => TransitionType.none,
    );
  }
}

/// All available motion types (8 total)
/// Keys match the web app's MOTIONS map in 01-core.js
enum MotionType {
  none('none', 'None'),
  kenBurns('ken-burns', 'Ken Burns'),
  slowZoomIn('slow-zoom-in', 'Slow Zoom In'),
  slowZoomOut('slow-zoom-out', 'Slow Zoom Out'),
  panLeft('pan-left', 'Pan Left'),
  panRight('pan-right', 'Pan Right'),
  panUp('pan-up', 'Pan Up'),
  panDown('pan-down', 'Pan Down');

  final String key;
  final String label;

  const MotionType(this.key, this.label);

  static MotionType fromKey(String key) {
    return MotionType.values.firstWhere(
      (m) => m.key == key,
      orElse: () => MotionType.none,
    );
  }
}

/// Text animation types (7 total)
enum TextAnimation {
  none('none', 'None'),
  fade('fade', 'Fade'),
  slideUp('slide-up', 'Slide Up'),
  slideDown('slide-down', 'Slide Down'),
  scale('scale', 'Scale'),
  blurIn('blur-in', 'Blur In'),
  typewriter('typewriter', 'Typewriter');

  final String key;
  final String label;

  const TextAnimation(this.key, this.label);

  static TextAnimation fromKey(String key) {
    return TextAnimation.values.firstWhere(
      (a) => a.key == key,
      orElse: () => TextAnimation.none,
    );
  }
}

/// Text position on the 9-point grid
enum TextPosition {
  topLeft('top-left', 'Top Left'),
  topCenter('top-center', 'Top Center'),
  topRight('top-right', 'Top Right'),
  midLeft('mid-left', 'Mid Left'),
  center('center', 'Center'),
  midRight('mid-right', 'Mid Right'),
  botLeft('bot-left', 'Bottom Left'),
  botCenter('bot-center', 'Bottom Center'),
  botRight('bot-right', 'Bottom Right');

  final String key;
  final String label;

  const TextPosition(this.key, this.label);

  static TextPosition fromKey(String key) {
    return TextPosition.values.firstWhere(
      (p) => p.key == key,
      orElse: () => TextPosition.center,
    );
  }
}

/// PiP shape types
enum PipShape {
  circle('circle', 'Circle'),
  rounded('rounded', 'Rounded'),
  rect('rect', 'Rectangle');

  final String key;
  final String label;

  const PipShape(this.key, this.label);

  static PipShape fromKey(String key) {
    return PipShape.values.firstWhere(
      (s) => s.key == key,
      orElse: () => PipShape.circle,
    );
  }
}
