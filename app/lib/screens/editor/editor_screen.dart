import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/colors.dart';
import '../../core/utils/time_format.dart';
import '../../models/photo_item.dart';
import '../../models/text_item.dart';
import '../../providers/audio_provider.dart';
import '../../providers/timeline_provider.dart';
import '../../providers/zoom_provider.dart';
import '../../providers/selection_provider.dart';
import '../../providers/project_provider.dart';
import '../../painters/ruler_painter.dart';
import 'widgets/audio_controls/audio_waveform_widget.dart';
import 'widgets/audio_controls/audio_editor_toolbar.dart';
import 'widgets/audio_controls/bgm_section.dart';
import 'widgets/audio_controls/pip_section.dart';
import 'widgets/audio_controls/language_selector.dart';
import 'widgets/timeline/photo_timeline.dart';
import 'widgets/timeline/text_timeline.dart';
import 'widgets/properties/photo_props_panel.dart';
import 'widgets/properties/text_props_panel.dart';
import 'widgets/properties/series_panel.dart';
import 'widgets/export/export_progress.dart';
import 'editor_actions.dart';

class EditorScreen extends ConsumerStatefulWidget {
  const EditorScreen({super.key});

  @override
  ConsumerState<EditorScreen> createState() => _EditorScreenState();
}

class _EditorScreenState extends ConsumerState<EditorScreen> {
  bool _projectLoaded = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_projectLoaded) {
      _projectLoaded = true;
      // Check if a project ID was passed as a route argument
      final projectId = ModalRoute.of(context)?.settings.arguments as String?;
      if (projectId != null) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          EditorActions.loadProject(context, ref, projectId);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final audio = ref.watch(audioProvider);
    final timeline = ref.watch(timelineProvider);
    final zoom = ref.watch(zoomProvider);
    final selection = ref.watch(selectionProvider);
    final project = ref.watch(projectProvider);

    // Find selected items for property panel
    final selectedPhoto = selection.hasPhotoSelection
        ? timeline.photos.cast<PhotoItem?>().firstWhere(
            (p) => p != null && selection.selectedPhotoIds.contains(p.id),
            orElse: () => null)
        : null;
    final selectedText = selection.hasTextSelection
        ? timeline.texts.cast<TextItem?>().firstWhere(
            (t) => t != null && selection.selectedTextIds.contains(t.id),
            orElse: () => null)
        : null;

    return Scaffold(
      appBar: AppBar(
        title: GestureDetector(
          onTap: () => _editProjectName(context, ref, project.projectName),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(project.projectName, style: const TextStyle(fontSize: 16)),
              const SizedBox(width: 4),
              const Icon(Icons.edit, size: 14, color: AppColors.textMuted),
            ],
          ),
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.pop(context),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.save_outlined, size: 22),
            onPressed: () => EditorActions.saveProject(context, ref),
            tooltip: 'Save',
          ),
          IconButton(
            icon: const Icon(Icons.play_circle_outline, size: 22),
            onPressed: () {}, // Preview handled by inline preview
            tooltip: 'Preview',
          ),
          IconButton(
            icon: const Icon(Icons.file_download_outlined, size: 22),
            onPressed: () => EditorActions.showExportDialog(context, ref),
            tooltip: 'Export',
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            // ── Waveform / Audio info ──
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: audio.hasAudio
                  ? Container(
                      height: 80,
                      width: double.infinity,
                      decoration: BoxDecoration(
                        color: AppColors.bgCard,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: Stack(
                        children: [
                          // Waveform (if samples available)
                          AudioWaveformWidget(
                            height: 80,
                            duration: audio.duration,
                            currentTime: audio.currentTime,
                            regionStart: audio.regionStart,
                            regionEnd: audio.regionEnd,
                            onSeek: (t) => ref.read(audioProvider.notifier).updateCurrentTime(t),
                            onRegionChanged: (s, e) => ref.read(audioProvider.notifier).setRegion(s, e),
                            onRegionCleared: () => ref.read(audioProvider.notifier).clearRegion(),
                          ),
                          // Audio info overlay
                          Positioned(
                            top: 4, left: 8,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: Colors.black54,
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                'Audio: ${fmtLong(audio.duration)}',
                                style: const TextStyle(color: AppColors.green, fontSize: 10),
                              ),
                            ),
                          ),
                        ],
                      ),
                    )
                  : Container(
                      height: 80,
                      width: double.infinity,
                      decoration: BoxDecoration(
                        color: AppColors.bgCard,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: const Center(
                        child: Text('No audio loaded',
                            style: TextStyle(color: AppColors.textMuted, fontSize: 12)),
                      ),
                    ),
            ),

            // ── Audio Toolbar ──
            AudioEditorToolbar(
              hasRegion: audio.hasRegion,
              canUndo: false, // TODO: wire to audio service
              isPlaying: audio.isPlaying,
              onPlay: () => ref.read(audioProvider.notifier).setPlaying(!audio.isPlaying),
              onStop: () {
                ref.read(audioProvider.notifier).setPlaying(false);
                ref.read(audioProvider.notifier).updateCurrentTime(0);
              },
            ),

            // ── Ruler ──
            SizedBox(
              height: 20,
              child: CustomPaint(
                size: const Size(double.infinity, 20),
                painter: RulerPainter(
                  visibleDuration: zoom.visibleDuration,
                  visibleStart: zoom.visibleStart,
                ),
              ),
            ),

            // ── Timelines ──
            Expanded(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Timeline area
                  Expanded(
                    flex: 3,
                    child: SingleChildScrollView(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const SizedBox(height: 8),

                            // Photo timeline
                            _TimelineHeader(
                              label: 'Photos',
                              count: timeline.photos.length,
                              color: AppColors.photoBlock,
                              onAdd: () => _addPhoto(ref),
                            ),
                            const PhotoTimeline(),
                            const SizedBox(height: 8),

                            // Text timeline
                            _TimelineHeader(
                              label: 'Text',
                              count: timeline.texts.length,
                              color: AppColors.textBlock,
                              onAdd: () => _addText(ref),
                            ),
                            const TextTimeline(),
                            const SizedBox(height: 8),

                            // Subtitle timeline
                            _TimelineHeader(
                              label: 'Subtitles',
                              count: timeline.subtitles.length,
                              color: AppColors.subtitleBlock,
                            ),
                            const SubtitleTimeline(),
                            const SizedBox(height: 16),

                            // Export progress
                            const ExportProgress(),

                            // BGM section
                            const BgmSection(),
                            const SizedBox(height: 10),

                            // PiP section
                            const PipSection(),
                            const SizedBox(height: 10),

                            // Language selector
                            const LanguageSelector(),
                            const SizedBox(height: 10),

                            // Series management
                            const SeriesPanel(),
                            const SizedBox(height: 24),
                          ],
                        ),
                      ),
                    ),
                  ),

                  // Property panel (right side, shown when item selected)
                  if (selectedPhoto != null || selectedText != null)
                    SizedBox(
                      width: 240,
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.all(8),
                        child: Column(
                          children: [
                            if (selectedPhoto != null)
                              PhotoPropsPanel(photo: selectedPhoto),
                            if (selectedText != null)
                              TextPropsPanel(textItem: selectedText),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),

            // ── Zoom Controls ──
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: const BoxDecoration(
                color: AppColors.bgSecondary,
                border: Border(top: BorderSide(color: AppColors.border)),
              ),
              child: Row(
                children: [
                  // Time display
                  Text(
                    '${fmtShort(audio.currentTime)}/${fmtShort(audio.duration)}',
                    style: const TextStyle(
                      color: AppColors.textSecondary,
                      fontSize: 10,
                      fontFeatures: [FontFeature.tabularFigures()],
                    ),
                  ),
                  const SizedBox(width: 4),

                  // Zoom slider (compact)
                  Expanded(
                    child: SizedBox(
                      height: 20,
                      child: Slider(
                        value: zoom.zoomLevel,
                        min: 1, max: 10,
                        onChanged: (v) => ref.read(zoomProvider.notifier).setZoom(v),
                      ),
                    ),
                  ),

                  Text(
                    '${zoom.zoomLevel.toStringAsFixed(1)}x',
                    style: const TextStyle(color: AppColors.textMuted, fontSize: 9),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _addPhoto(WidgetRef ref) {
    final timeline = ref.read(timelineProvider);
    final nextId = timeline.nextPhotoId;
    // Calculate start time after last photo
    final lastEnd = timeline.photos.isEmpty
        ? 0.0
        : timeline.photos.map((p) => p.endTime).reduce((a, b) => a > b ? a : b);

    ref.read(timelineProvider.notifier).addPhoto(PhotoItem(
      id: nextId,
      imagePath: '', // placeholder — will be replaced by file picker
      startTime: lastEnd,
      duration: 5.0,
    ));
  }

  void _addText(WidgetRef ref) {
    final timeline = ref.read(timelineProvider);
    final audio = ref.read(audioProvider);
    final nextId = timeline.nextTextId;

    ref.read(timelineProvider.notifier).addText(TextItem(
      id: nextId,
      startTime: audio.currentTime,
    ));
  }

  void _editProjectName(BuildContext context, WidgetRef ref, String current) {
    final controller = TextEditingController(text: current);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Project Name'),
        content: TextField(
          controller: controller,
          autofocus: true,
          style: const TextStyle(color: AppColors.textPrimary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              ref.read(projectProvider.notifier).setName(controller.text);
              Navigator.pop(ctx);
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }
}

class _TimelineHeader extends StatelessWidget {
  final String label;
  final int count;
  final Color color;
  final VoidCallback? onAdd;

  const _TimelineHeader({
    required this.label,
    required this.count,
    required this.color,
    this.onAdd,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          Container(
            width: 8, height: 8,
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(width: 6),
          Text(
            '$label ($count)',
            style: const TextStyle(
              color: AppColors.textSecondary,
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
          const Spacer(),
          if (onAdd != null)
            GestureDetector(
              onTap: onAdd,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: AppColors.accentSoft,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.add, size: 12, color: AppColors.accent),
                    SizedBox(width: 2),
                    Text('Add', style: TextStyle(color: AppColors.accent, fontSize: 10)),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
