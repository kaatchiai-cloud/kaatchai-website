import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/colors.dart';
import '../../../services/storage/project_storage.dart';
import '../landing_screen.dart';
import 'gallery_card.dart';

class ProjectGallery extends ConsumerWidget {
  const ProjectGallery({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final galleryAsync = ref.watch(galleryProvider);

    return Column(
      children: [
        // Header
        Row(
          children: [
            const Text(
              'Recent Projects',
              style: TextStyle(
                color: AppColors.textPrimary,
                fontSize: 18,
                fontWeight: FontWeight.w600,
              ),
            ),
            const Spacer(),
            galleryAsync.when(
              data: (projects) {
                if (projects.isEmpty) return const SizedBox.shrink();
                return GestureDetector(
                  onTap: () => _showClearDialog(context, ref),
                  child: const Text(
                    'Clear All',
                    style: TextStyle(
                      color: AppColors.red,
                      fontSize: 12,
                    ),
                  ),
                );
              },
              loading: () => const SizedBox.shrink(),
              error: (e, s) => const SizedBox.shrink(),
            ),
          ],
        ),
        const SizedBox(height: 12),

        // Gallery content
        galleryAsync.when(
          data: (projects) {
            if (projects.isEmpty) {
              return _EmptyGallery();
            }

            // Group by series
            final grouped = _groupBySeries(projects);

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final entry in grouped.entries) ...[
                  if (entry.key.isNotEmpty) ...[
                    Padding(
                      padding: const EdgeInsets.only(top: 12, bottom: 6),
                      child: Row(
                        children: [
                          const Icon(Icons.folder_rounded,
                              size: 14, color: AppColors.textMuted),
                          const SizedBox(width: 6),
                          Text(
                            entry.key,
                            style: const TextStyle(
                              color: AppColors.textSecondary,
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  ...entry.value.map((meta) => Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: GalleryCard(
                          meta: meta,
                          onTap: () => _openProject(context, meta.id),
                          onDelete: () => _deleteProject(context, ref, meta.id),
                        ),
                      )),
                ],
              ],
            );
          },
          loading: () => const Padding(
            padding: EdgeInsets.all(32),
            child: Center(
              child: CircularProgressIndicator(
                color: AppColors.accent,
                strokeWidth: 2,
              ),
            ),
          ),
          error: (error, _) => Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: AppColors.bgCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.border),
            ),
            child: Center(
              child: Text(
                'Error loading projects: $error',
                style: const TextStyle(color: AppColors.red, fontSize: 12),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Map<String, List<ProjectMeta>> _groupBySeries(List<ProjectMeta> projects) {
    final Map<String, List<ProjectMeta>> grouped = {};
    for (final p in projects) {
      final key = p.seriesName;
      grouped.putIfAbsent(key, () => []).add(p);
    }
    // Sort: unnamed series first, then alphabetical
    final sorted = Map<String, List<ProjectMeta>>.fromEntries(
      grouped.entries.toList()
        ..sort((a, b) {
          if (a.key.isEmpty && b.key.isNotEmpty) return -1;
          if (a.key.isNotEmpty && b.key.isEmpty) return 1;
          return a.key.compareTo(b.key);
        }),
    );
    return sorted;
  }

  void _openProject(BuildContext context, String projectId) {
    Navigator.pushNamed(context, '/editor', arguments: projectId);
  }

  Future<void> _deleteProject(
      BuildContext context, WidgetRef ref, String id) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Project'),
        content: const Text('This cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete',
                style: TextStyle(color: AppColors.red)),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      final storage = ProjectStorage();
      await storage.init();
      await storage.deleteProject(id);
      ref.invalidate(galleryProvider);
    }
  }

  Future<void> _showClearDialog(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Clear All Projects'),
        content: const Text(
            'This will permanently delete all saved projects. This cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Clear All',
                style: TextStyle(color: AppColors.red)),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      final storage = ProjectStorage();
      await storage.init();
      await storage.clearAll();
      ref.invalidate(galleryProvider);
    }
  }
}

class _EmptyGallery extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 32),
      decoration: BoxDecoration(
        color: AppColors.bgCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: const Column(
        children: [
          Icon(Icons.folder_open_rounded, size: 36, color: AppColors.textMuted),
          SizedBox(height: 8),
          Text(
            'No projects yet',
            style: TextStyle(color: AppColors.textMuted, fontSize: 13),
          ),
          SizedBox(height: 4),
          Text(
            'Create or record something to get started',
            style: TextStyle(color: AppColors.textMuted, fontSize: 11),
          ),
        ],
      ),
    );
  }
}
