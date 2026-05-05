import 'dart:ui';

/// App color palette — ported from CSS :root variables in styles.css
class AppColors {
  // Backgrounds
  static const Color bgPrimary = Color(0xFF0c0c14);
  static const Color bgSecondary = Color(0xFF12121f);
  static const Color bgCard = Color(0xFF161625);
  static const Color bgElevated = Color(0xFF1c1c30);
  static const Color bgInput = Color(0xFF1a1a2e);

  // Borders
  static const Color border = Color(0x0FFFFFFF); // rgba(255,255,255,0.06)
  static const Color borderHover = Color(0x1FFFFFFF); // rgba(255,255,255,0.12)
  static const Color borderActive = Color(0x808b5cf6); // rgba(139,92,246,0.5)

  // Accent (purple)
  static const Color accent = Color(0xFF8b5cf6);
  static const Color accentHover = Color(0xFF7c3aed);
  static const Color accentGlow = Color(0x408b5cf6); // rgba(139,92,246,0.25)
  static const Color accentSoft = Color(0x1F8b5cf6); // rgba(139,92,246,0.12)

  // Semantic colors
  static const Color red = Color(0xFFef4444);
  static const Color redSoft = Color(0x26ef4444); // rgba(239,68,68,0.15)
  static const Color green = Color(0xFF22c55e);
  static const Color greenSoft = Color(0x2622c55e); // rgba(34,197,94,0.15)
  static const Color amber = Color(0xFFf59e0b);
  static const Color amberSoft = Color(0x26f59e0b); // rgba(245,158,11,0.15)
  static const Color cyan = Color(0xFF06b6d4);
  static const Color cyanSoft = Color(0x2606b6d4); // rgba(6,182,212,0.15)

  // Text
  static const Color textPrimary = Color(0xFFf4f4f7);
  static const Color textSecondary = Color(0xFFb0b0c4);
  static const Color textMuted = Color(0xFF7a7a95);

  // Waveform
  static const Color waveform = Color(0xFF8b5cf6);
  static const Color waveformProgress = Color(0xFF6d3ede);
  static const Color waveformRegion = Color(0x408b5cf6);

  // Timeline
  static const Color photoBlock = Color(0xFF2a2a4a);
  static const Color textBlock = Color(0xFF2a3a2a);
  static const Color subtitleBlock = Color(0xFF3a2a2a);
  static const Color playhead = Color(0xFFef4444);
  static const Color ruler = Color(0xFF7a7a95);
}
