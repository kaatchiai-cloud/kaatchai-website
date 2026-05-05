import 'dart:ui';

/// Parse hex color string to Color
Color hexToColor(String hex) {
  hex = hex.replaceFirst('#', '');
  if (hex.length == 6) {
    hex = 'FF$hex'; // add full opacity
  }
  return Color(int.parse(hex, radix: 16));
}

/// Convert Color to hex string
String colorToHex(Color color) {
  final r = (color.r * 255.0).round().clamp(0, 255);
  final g = (color.g * 255.0).round().clamp(0, 255);
  final b = (color.b * 255.0).round().clamp(0, 255);
  return '#${r.toRadixString(16).padLeft(2, '0')}'
      '${g.toRadixString(16).padLeft(2, '0')}'
      '${b.toRadixString(16).padLeft(2, '0')}';
}

/// Parse CSS gradient string to list of colors (for template cards)
/// Input: 'linear-gradient(135deg, #667eea, #764ba2)'
/// Returns: [Color(#667eea), Color(#764ba2)]
List<Color> parseGradient(String gradientStr) {
  final regex = RegExp(r'#[0-9a-fA-F]{6}');
  final matches = regex.allMatches(gradientStr);
  if (matches.isEmpty) {
    return [const Color(0xFF2a2a3e), const Color(0xFF1a1a2e)];
  }
  return matches.map((m) => hexToColor(m.group(0)!)).toList();
}
