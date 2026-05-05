import 'package:flutter/material.dart';
import '../../../core/theme/colors.dart';

class FeaturesGrid extends StatelessWidget {
  const FeaturesGrid({super.key});

  static const _features = [
    _Feature(Icons.dashboard_rounded, '40+ Templates', 'Story, education, podcast, marketing & more'),
    _Feature(Icons.palette_rounded, '20 Visual Styles', 'Watercolor, cinematic, anime, pixel art, noir...'),
    _Feature(Icons.podcasts_rounded, 'Podcast Pipeline', 'Dual-camera, chapter splitting, PiP speaker overlay'),
    _Feature(Icons.language_rounded, 'Multi-Language', 'AI voiceover in 7+ languages with synced subtitles'),
    _Feature(Icons.phone_android_rounded, 'All Platforms', 'YouTube, Instagram, TikTok, Shorts — any size'),
    _Feature(Icons.lock_rounded, '100% Private', 'Everything runs on your device. No uploads, no servers.'),
    _Feature(Icons.music_note_rounded, 'Audio Editor', 'Cut, trim, insert, silence removal built in'),
    _Feature(Icons.animation_rounded, 'Transitions & Motion', 'Ken Burns, zoom, crossfade, 20+ effects'),
  ];

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const Align(
          alignment: Alignment.centerLeft,
          child: Text(
            'Features',
            style: TextStyle(
              color: AppColors.textPrimary,
              fontSize: 18,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        const SizedBox(height: 16),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.6,
          ),
          itemCount: _features.length,
          itemBuilder: (context, i) {
            final f = _features[i];
            return Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.bgCard,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(f.icon, color: AppColors.accent, size: 22),
                  const SizedBox(height: 8),
                  Text(
                    f.title,
                    style: const TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    f.description,
                    style: const TextStyle(
                      color: AppColors.textMuted,
                      fontSize: 10,
                      height: 1.3,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            );
          },
        ),
      ],
    );
  }
}

class _Feature {
  final IconData icon;
  final String title;
  final String description;
  const _Feature(this.icon, this.title, this.description);
}
