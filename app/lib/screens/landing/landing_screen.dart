import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/colors.dart';
import '../../services/storage/project_storage.dart';
import 'widgets/project_gallery.dart';
import 'widgets/how_it_works.dart';
import 'widgets/features_grid.dart';
import 'widgets/pricing_cards.dart';

/// Gallery projects provider
final galleryProvider = FutureProvider<List<ProjectMeta>>((ref) async {
  final storage = ProjectStorage();
  await storage.init();
  return storage.getProjectMetas();
});

class LandingScreen extends ConsumerWidget {
  const LandingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Column(
            children: [
              const SizedBox(height: 48),

              // ── Hero ──
              const _HeroSection(),
              const SizedBox(height: 40),

              // ── Action Buttons ──
              _ActionButton(
                icon: Icons.videocam_rounded,
                label: 'Record Podcast',
                description: 'Dual-camera recording with AI speaker detection',
                gradient: const [Color(0xFF8b5cf6), Color(0xFF6d28d9)],
                onTap: () => Navigator.pushNamed(context, '/record'),
              ),
              const SizedBox(height: 12),
              _ActionButton(
                icon: Icons.auto_awesome,
                label: 'Create Content',
                description: 'Audio, text, or podcast to AI video',
                gradient: const [Color(0xFF06b6d4), Color(0xFF0891b2)],
                onTap: () => Navigator.pushNamed(context, '/create'),
              ),
              const SizedBox(height: 12),
              _ActionButton(
                icon: Icons.edit_rounded,
                label: 'Edit Content',
                description: 'Open empty timeline editor',
                gradient: const [Color(0xFF22c55e), Color(0xFF16a34a)],
                onTap: () => Navigator.pushNamed(context, '/editor'),
              ),
              const SizedBox(height: 40),

              // ── Project Gallery ──
              const ProjectGallery(),
              const SizedBox(height: 40),

              // ── How It Works ──
              const HowItWorks(),
              const SizedBox(height: 40),

              // ── Features ──
              const FeaturesGrid(),
              const SizedBox(height: 40),

              // ── Pricing ──
              const PricingCards(),
              const SizedBox(height: 48),
            ],
          ),
        ),
      ),
    );
  }
}

class _HeroSection extends StatelessWidget {
  const _HeroSection();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // App logo / name
        ShaderMask(
          shaderCallback: (bounds) => const LinearGradient(
            colors: [Color(0xFF8b5cf6), Color(0xFF06b6d4)],
          ).createShader(bounds),
          child: const Text(
            'Stori',
            style: TextStyle(
              fontSize: 52,
              fontWeight: FontWeight.w800,
              color: Colors.white,
              letterSpacing: -1,
            ),
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'AI-Powered Video Creation',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w600,
            color: AppColors.textPrimary,
          ),
        ),
        const SizedBox(height: 8),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 16),
          child: Text(
            'Turn audio, text, or podcasts into beautiful videos with AI-generated visuals. No editing skills needed.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 14,
              color: AppColors.textSecondary,
              height: 1.5,
            ),
          ),
        ),
      ],
    );
  }
}

class _ActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final String description;
  final List<Color> gradient;
  final VoidCallback onTap;

  const _ActionButton({
    required this.icon,
    required this.label,
    required this.description,
    required this.gradient,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: gradient,
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(14),
          boxShadow: [
            BoxShadow(
              color: gradient[0].withAlpha(51),
              blurRadius: 16,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: Colors.white.withAlpha(26),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, size: 24, color: Colors.white),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    description,
                    style: TextStyle(
                      color: Colors.white.withAlpha(179),
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            Icon(Icons.arrow_forward_ios,
                color: Colors.white.withAlpha(128), size: 16),
          ],
        ),
      ),
    );
  }
}
