import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/colors.dart';
import '../../../providers/create_provider.dart';
import '../../../services/storage/secure_storage.dart';

/// Provider to persist API key state across step navigation
final _apiKeyStateProvider = StateProvider<_ApiKeyState>((ref) => _ApiKeyState());

class _ApiKeyState {
  String freeKey;
  String paidKey;
  String tier;
  bool loaded;

  _ApiKeyState({
    this.freeKey = '',
    this.paidKey = '',
    this.tier = 'free',
    this.loaded = false,
  });
}

class ApiKeyStep extends ConsumerStatefulWidget {
  const ApiKeyStep({super.key});

  @override
  ConsumerState<ApiKeyStep> createState() => _ApiKeyStepState();
}

class _ApiKeyStepState extends ConsumerState<ApiKeyStep> {
  final _storage = SecureStorageService();
  late TextEditingController _freeController;
  late TextEditingController _paidController;

  @override
  void initState() {
    super.initState();
    final state = ref.read(_apiKeyStateProvider);
    _freeController = TextEditingController(text: state.freeKey);
    _paidController = TextEditingController(text: state.paidKey);

    if (!state.loaded) {
      _loadKeys();
    }
  }

  Future<void> _loadKeys() async {
    final freeKey = await _storage.getFreeKey() ?? '';
    final paidKey = await _storage.getPaidKey() ?? '';
    final tier = await _storage.getActiveTier();

    _freeController.text = freeKey;
    _paidController.text = paidKey;

    ref.read(_apiKeyStateProvider.notifier).state = _ApiKeyState(
      freeKey: freeKey,
      paidKey: paidKey,
      tier: tier,
      loaded: true,
    );

    _updateProvider();
  }

  Future<void> _onKeyChanged(String value) async {
    final state = ref.read(_apiKeyStateProvider);
    if (state.tier == 'free') {
      ref.read(_apiKeyStateProvider.notifier).state = _ApiKeyState(
        freeKey: value,
        paidKey: state.paidKey,
        tier: state.tier,
        loaded: true,
      );
      await _storage.saveFreeKey(value.trim());
    } else {
      ref.read(_apiKeyStateProvider.notifier).state = _ApiKeyState(
        freeKey: state.freeKey,
        paidKey: value,
        tier: state.tier,
        loaded: true,
      );
      await _storage.savePaidKey(value.trim());
    }
    await _storage.setActiveTier(state.tier);
    _updateProvider();
  }

  void _onTierChanged(String tier) {
    ref.read(_apiKeyStateProvider.notifier).state = _ApiKeyState(
      freeKey: _freeController.text,
      paidKey: _paidController.text,
      tier: tier,
      loaded: true,
    );
    _storage.setActiveTier(tier);
    _updateProvider();
  }

  void _updateProvider() {
    // Always read from controllers (source of truth for current text)
    final tier = ref.read(_apiKeyStateProvider).tier;
    final key = tier == 'free' ? _freeController.text : _paidController.text;
    ref.read(createProvider.notifier).setActiveTier(tier);
    ref.read(createProvider.notifier).setHasApiKey(key.trim().isNotEmpty);
  }

  @override
  Widget build(BuildContext context) {
    final keyState = ref.watch(_apiKeyStateProvider);

    if (!keyState.loaded) {
      return const Center(child: CircularProgressIndicator(color: AppColors.accent));
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('API Key Setup',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
          const SizedBox(height: 4),
          const Text('Stori uses your own Google Gemini API key. All processing happens on-device.',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
          const SizedBox(height: 20),

          // Tier selector
          Row(
            children: [
              _TierCard(
                title: 'Free Tier',
                subtitle: 'Gemini Flash (2 img/min)',
                isSelected: keyState.tier == 'free',
                onTap: () => _onTierChanged('free'),
              ),
              const SizedBox(width: 10),
              _TierCard(
                title: 'Paid Tier',
                subtitle: 'Imagen 4 (~\$0.04/img)',
                isSelected: keyState.tier == 'paid',
                onTap: () => _onTierChanged('paid'),
              ),
            ],
          ),
          const SizedBox(height: 20),

          // Key input
          Text(
            keyState.tier == 'free' ? 'Free Tier API Key' : 'Paid Tier API Key',
            style: const TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 6),
          TextField(
            controller: keyState.tier == 'free' ? _freeController : _paidController,
            obscureText: true,
            style: const TextStyle(color: AppColors.textPrimary, fontSize: 14),
            decoration: InputDecoration(
              hintText: 'Enter your Gemini API key',
              suffixIcon: (keyState.tier == 'free' ? keyState.freeKey : keyState.paidKey).isNotEmpty
                  ? const Icon(Icons.check_circle, color: AppColors.green, size: 20)
                  : null,
            ),
            onChanged: _onKeyChanged,
          ),
          const SizedBox(height: 8),

          // Saved confirmation
          if ((keyState.tier == 'free' ? keyState.freeKey : keyState.paidKey).isNotEmpty)
            const Text('Key saved automatically',
                style: TextStyle(color: AppColors.green, fontSize: 11)),

          const SizedBox(height: 16),

          // Help text
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.bgElevated,
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('How to get a key:',
                    style: TextStyle(color: AppColors.textPrimary, fontSize: 12, fontWeight: FontWeight.w600)),
                SizedBox(height: 4),
                Text('1. Go to aistudio.google.com\n2. Click "Get API Key"\n3. Create a key and paste it above',
                    style: TextStyle(color: AppColors.textSecondary, fontSize: 11, height: 1.5)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _freeController.dispose();
    _paidController.dispose();
    super.dispose();
  }
}

class _TierCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final bool isSelected;
  final VoidCallback onTap;

  const _TierCard({
    required this.title,
    required this.subtitle,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: isSelected ? AppColors.accentSoft : AppColors.bgCard,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: isSelected ? AppColors.accent : AppColors.border,
              width: isSelected ? 2 : 1,
            ),
          ),
          child: Column(
            children: [
              Text(title, style: TextStyle(
                color: isSelected ? AppColors.accent : AppColors.textPrimary,
                fontWeight: FontWeight.w600, fontSize: 14)),
              const SizedBox(height: 2),
              Text(subtitle, style: const TextStyle(color: AppColors.textMuted, fontSize: 10)),
            ],
          ),
        ),
      ),
    );
  }
}
