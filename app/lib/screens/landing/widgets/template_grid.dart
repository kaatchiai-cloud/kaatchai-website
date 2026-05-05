import 'package:flutter/material.dart';
import '../../../core/theme/colors.dart';
import '../../../core/constants/style_presets.dart';
import '../../../core/utils/color_utils.dart';
import '../../../models/template.dart';

class TemplateGrid extends StatefulWidget {
  final void Function(StoriTemplate template)? onSelect;

  const TemplateGrid({super.key, this.onSelect});

  @override
  State<TemplateGrid> createState() => _TemplateGridState();
}

class _TemplateGridState extends State<TemplateGrid> {
  String _selectedCategory = 'all';
  String? _selectedTemplateId;

  List<StoriTemplate> get _filteredTemplates {
    if (_selectedCategory == 'all') return templates;
    return templates
        .where((t) =>
            t.category == _selectedCategory || t.id == 'blank')
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Templates',
          style: TextStyle(
            color: AppColors.textPrimary,
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 12),

        // Category tabs
        SizedBox(
          height: 34,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: templateCategories.length,
            separatorBuilder: (c, i) => const SizedBox(width: 6),
            itemBuilder: (context, i) {
              final entry = templateCategories.entries.elementAt(i);
              final isActive = entry.key == _selectedCategory;
              return GestureDetector(
                onTap: () =>
                    setState(() => _selectedCategory = entry.key),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                  decoration: BoxDecoration(
                    color: isActive ? AppColors.accent : AppColors.bgElevated,
                    borderRadius: BorderRadius.circular(17),
                    border: Border.all(
                      color:
                          isActive ? AppColors.accent : AppColors.border,
                    ),
                  ),
                  child: Text(
                    entry.value,
                    style: TextStyle(
                      color: isActive ? Colors.white : AppColors.textSecondary,
                      fontSize: 12,
                      fontWeight:
                          isActive ? FontWeight.w600 : FontWeight.w400,
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 14),

        // Template cards grid
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 3,
            mainAxisSpacing: 8,
            crossAxisSpacing: 8,
            childAspectRatio: 0.85,
          ),
          itemCount: _filteredTemplates.length,
          itemBuilder: (context, i) {
            final tpl = _filteredTemplates[i];
            final isSelected = tpl.id == _selectedTemplateId;
            final colors = parseGradient(tpl.gradient);

            return GestureDetector(
              onTap: () {
                setState(() => _selectedTemplateId = tpl.id);
                widget.onSelect?.call(tpl);
              },
              child: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: colors,
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: isSelected
                        ? AppColors.accent
                        : Colors.transparent,
                    width: 2,
                  ),
                ),
                child: Stack(
                  children: [
                    // Content
                    Padding(
                      padding: const EdgeInsets.all(10),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          Text(
                            tpl.name,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              shadows: [
                                Shadow(blurRadius: 8, color: Colors.black54),
                              ],
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 2),
                          Text(
                            tpl.description,
                            style: TextStyle(
                              color: Colors.white.withAlpha(179),
                              fontSize: 9,
                              height: 1.2,
                              shadows: const [
                                Shadow(blurRadius: 6, color: Colors.black54),
                              ],
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),

                    // Size badge
                    if (tpl.size.isNotEmpty)
                      Positioned(
                        top: 6,
                        right: 6,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 5, vertical: 2),
                          decoration: BoxDecoration(
                            color: Colors.black.withAlpha(102),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            tpl.size,
                            style: TextStyle(
                              color: Colors.white.withAlpha(204),
                              fontSize: 8,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      ),

                    // Selected checkmark
                    if (isSelected)
                      Positioned(
                        top: 6,
                        left: 6,
                        child: Container(
                          width: 20,
                          height: 20,
                          decoration: const BoxDecoration(
                            color: AppColors.accent,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(Icons.check,
                              size: 13, color: Colors.white),
                        ),
                      ),
                  ],
                ),
              ),
            );
          },
        ),
      ],
    );
  }
}
