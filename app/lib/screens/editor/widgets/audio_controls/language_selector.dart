import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/colors.dart';
import '../../../../providers/project_provider.dart';

/// Language track selector in the editor
/// Switches audio buffer and subtitles when language changes
/// Ported from setupEditorLanguageSelector() in the web app
class LanguageSelector extends ConsumerWidget {
  const LanguageSelector({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final project = ref.watch(projectProvider);

    if (project.languageTracks.isEmpty) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.bgCard,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.language_rounded, size: 16, color: AppColors.green),
              SizedBox(width: 6),
              Text('Language',
                  style: TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 13,
                      fontWeight: FontWeight.w600)),
            ],
          ),
          const SizedBox(height: 8),

          // Language chips
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              // Original
              _LangChip(
                label: 'Original',
                isSelected: project.currentLang == 'original',
                onTap: () =>
                    ref.read(projectProvider.notifier).setCurrentLang('original'),
              ),

              // Translated tracks
              ...project.languageTracks.map((track) => _LangChip(
                    label: track.lang,
                    langCode: track.langCode,
                    isSelected: project.currentLang == track.langCode,
                    onTap: () => ref
                        .read(projectProvider.notifier)
                        .setCurrentLang(track.langCode),
                  )),
            ],
          ),
        ],
      ),
    );
  }
}

class _LangChip extends StatelessWidget {
  final String label;
  final String? langCode;
  final bool isSelected;
  final VoidCallback onTap;

  const _LangChip({
    required this.label,
    this.langCode,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.green : AppColors.bgElevated,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected ? AppColors.green : AppColors.border,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (isSelected)
              const Padding(
                padding: EdgeInsets.only(right: 4),
                child: Icon(Icons.check, size: 12, color: Colors.white),
              ),
            Text(
              label,
              style: TextStyle(
                color: isSelected ? Colors.white : AppColors.textSecondary,
                fontSize: 11,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
              ),
            ),
            if (langCode != null) ...[
              const SizedBox(width: 4),
              Text(
                langCode!.toUpperCase(),
                style: TextStyle(
                  color: isSelected ? Colors.white70 : AppColors.textMuted,
                  fontSize: 9,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
