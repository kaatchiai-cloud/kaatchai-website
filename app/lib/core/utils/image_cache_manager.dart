import 'dart:collection';
import 'dart:io';
import 'dart:ui' as ui;
import '../constants/app_constants.dart';

/// LRU image cache for decoded ui.Image objects
/// Limits memory by evicting oldest images when cache is full
class ImageCacheManager {
  final int maxSize;
  final LinkedHashMap<int, ui.Image> _cache = LinkedHashMap();

  ImageCacheManager({this.maxSize = AppConstants.maxImageCacheSize});

  /// Get cached image by photo ID
  ui.Image? get(int id) {
    final image = _cache.remove(id);
    if (image != null) {
      _cache[id] = image; // Move to end (most recently used)
    }
    return image;
  }

  /// Put image into cache
  void put(int id, ui.Image image) {
    _cache.remove(id); // Remove if exists (to reinsert at end)
    _cache[id] = image;

    // Evict oldest if over limit
    while (_cache.length > maxSize) {
      final oldestKey = _cache.keys.first;
      final oldest = _cache.remove(oldestKey);
      oldest?.dispose();
    }
  }

  /// Check if image is cached
  bool has(int id) => _cache.containsKey(id);

  /// Remove specific image
  void remove(int id) {
    final image = _cache.remove(id);
    image?.dispose();
  }

  /// Get all cached images as a map (for rendering)
  Map<int, ui.Image> get all => Map.unmodifiable(_cache);

  /// Clear all cached images
  void clear() {
    for (final image in _cache.values) {
      image.dispose();
    }
    _cache.clear();
  }

  /// Load image from file path and cache it
  Future<ui.Image?> loadAndCache(int id, String filePath) async {
    // Check cache first
    final cached = get(id);
    if (cached != null) return cached;

    try {
      final file = File(filePath);
      if (!await file.exists()) return null;

      final bytes = await file.readAsBytes();
      final codec = await ui.instantiateImageCodec(bytes);
      final frame = await codec.getNextFrame();
      final image = frame.image;

      put(id, image);
      return image;
    } catch (e) {
      return null;
    }
  }

  int get size => _cache.length;
}
