import 'package:flutter/material.dart';
import '../theme/colors.dart';

/// Centralized error handling utilities
class ErrorHandler {
  /// Show error snackbar
  static void showError(BuildContext context, String message) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(Icons.error_outline, color: Colors.white, size: 18),
            const SizedBox(width: 8),
            Expanded(child: Text(message, style: const TextStyle(fontSize: 13))),
          ],
        ),
        backgroundColor: AppColors.red,
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 4),
      ),
    );
  }

  /// Show success snackbar
  static void showSuccess(BuildContext context, String message) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(Icons.check_circle, color: Colors.white, size: 18),
            const SizedBox(width: 8),
            Expanded(child: Text(message, style: const TextStyle(fontSize: 13))),
          ],
        ),
        backgroundColor: AppColors.green,
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 2),
      ),
    );
  }

  /// Show warning snackbar
  static void showWarning(BuildContext context, String message) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(Icons.warning_amber_rounded, color: Colors.white, size: 18),
            const SizedBox(width: 8),
            Expanded(child: Text(message, style: const TextStyle(fontSize: 13))),
          ],
        ),
        backgroundColor: AppColors.amber,
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 3),
      ),
    );
  }

  /// Parse API error message from various formats
  static String parseApiError(dynamic error) {
    if (error is String) return error;
    try {
      if (error is Map) {
        if (error['error'] is Map) {
          return error['error']['message'] as String? ?? 'Unknown API error';
        }
        return error['message'] as String? ?? error.toString();
      }
    } catch (_) {}
    return error.toString();
  }

  /// Check if error is a rate limit error
  static bool isRateLimitError(dynamic error) {
    final msg = error.toString().toLowerCase();
    return msg.contains('429') ||
        msg.contains('quota') ||
        msg.contains('rate') ||
        msg.contains('resource exhausted');
  }

  /// Check if error is a network error
  static bool isNetworkError(dynamic error) {
    final msg = error.toString().toLowerCase();
    return msg.contains('socketexception') ||
        msg.contains('connection') ||
        msg.contains('timeout') ||
        msg.contains('network');
  }

  /// Get user-friendly message for common errors
  static String friendlyMessage(dynamic error) {
    if (isRateLimitError(error)) {
      return 'Rate limit reached. Please wait a moment and try again.';
    }
    if (isNetworkError(error)) {
      return 'Network error. Check your internet connection.';
    }
    return parseApiError(error);
  }
}
