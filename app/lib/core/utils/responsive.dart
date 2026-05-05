import 'package:flutter/material.dart';

/// Responsive layout helpers for phone vs tablet
enum DeviceType { phone, tablet }

class Responsive {
  static DeviceType getDeviceType(BuildContext context) {
    final shortestSide = MediaQuery.of(context).size.shortestSide;
    return shortestSide >= 600 ? DeviceType.tablet : DeviceType.phone;
  }

  static bool isTablet(BuildContext context) =>
      getDeviceType(context) == DeviceType.tablet;

  static bool isPhone(BuildContext context) =>
      getDeviceType(context) == DeviceType.phone;

  static bool isLandscape(BuildContext context) =>
      MediaQuery.of(context).orientation == Orientation.landscape;

  /// Get appropriate column count for grids
  static int gridColumns(BuildContext context, {int phonePortrait = 2, int phoneLandscape = 3, int tablet = 4}) {
    if (isTablet(context)) return tablet;
    if (isLandscape(context)) return phoneLandscape;
    return phonePortrait;
  }

  /// Get appropriate padding
  static EdgeInsets screenPadding(BuildContext context) {
    if (isTablet(context)) return const EdgeInsets.all(24);
    return const EdgeInsets.symmetric(horizontal: 16, vertical: 12);
  }
}

/// Widget that builds different layouts for phone/tablet
class ResponsiveLayout extends StatelessWidget {
  final Widget phone;
  final Widget? tablet;

  const ResponsiveLayout({
    super.key,
    required this.phone,
    this.tablet,
  });

  @override
  Widget build(BuildContext context) {
    if (Responsive.isTablet(context) && tablet != null) {
      return tablet!;
    }
    return phone;
  }
}
