import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Secure storage for API keys — replaces localStorage in the web app
class SecureStorageService {
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  // Storage keys (match web app's localStorage keys)
  static const String _freeKeyKey = 'stori_key_free';
  static const String _paidKeyKey = 'stori_key_paid';
  static const String _activeTierKey = 'stori_active_tier';
  static const String _gcloudTtsKeyKey = 'stori_gcloud_tts_key';

  // ── API Keys ──

  Future<void> saveFreeKey(String key) async {
    await _storage.write(key: _freeKeyKey, value: key);
  }

  Future<String?> getFreeKey() async {
    return await _storage.read(key: _freeKeyKey);
  }

  Future<void> savePaidKey(String key) async {
    await _storage.write(key: _paidKeyKey, value: key);
  }

  Future<String?> getPaidKey() async {
    return await _storage.read(key: _paidKeyKey);
  }

  // ── Active Tier ──

  Future<void> setActiveTier(String tier) async {
    await _storage.write(key: _activeTierKey, value: tier);
  }

  Future<String> getActiveTier() async {
    return await _storage.read(key: _activeTierKey) ?? 'free';
  }

  // ── Google Cloud TTS Key ──

  Future<void> saveGCloudTtsKey(String key) async {
    await _storage.write(key: _gcloudTtsKeyKey, value: key);
  }

  Future<String?> getGCloudTtsKey() async {
    return await _storage.read(key: _gcloudTtsKeyKey);
  }

  /// Get the active API key based on the current tier
  Future<String?> getActiveKey() async {
    final tier = await getActiveTier();
    if (tier == 'paid') {
      return await getPaidKey();
    }
    return await getFreeKey();
  }

  /// Clear all stored keys
  Future<void> clearAll() async {
    await _storage.deleteAll();
  }
}
