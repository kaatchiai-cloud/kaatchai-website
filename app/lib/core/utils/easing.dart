import 'dart:math' as math;

/// Easing functions — ported from 09-transitions.js
class StoriEasing {
  /// Smooth start and end (most commonly used)
  static double easeInOutCubic(double t) {
    return t < 0.5 ? 4 * t * t * t : 1 - math.pow(-2 * t + 2, 3) / 2;
  }

  /// Fast deceleration
  static double easeOutQuart(double t) {
    return 1 - math.pow(1 - t, 4).toDouble();
  }

  /// Fast acceleration
  static double easeInQuart(double t) {
    return t * t * t * t;
  }

  /// Overshoot effect (for rotate transition)
  static double easeOutBack(double t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * math.pow(t - 1, 3) + c1 * math.pow(t - 1, 2);
  }

  /// Clamp value between 0 and 1
  static double clamp01(double t) {
    return t.clamp(0.0, 1.0);
  }
}
