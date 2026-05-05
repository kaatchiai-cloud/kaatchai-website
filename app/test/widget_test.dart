import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:stori_app/app.dart';
import 'package:stori_app/screens/landing/landing_screen.dart';
import 'package:stori_app/services/storage/project_storage.dart';

void main() {
  testWidgets('App launches and shows landing screen', (WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          // Override gallery provider to return empty list (avoid Hive init in tests)
          galleryProvider.overrideWith((ref) => Future.value(<ProjectMeta>[])),
        ],
        child: const StoriApp(),
      ),
    );
    await tester.pump();

    expect(find.text('Stori'), findsOneWidget);
    expect(find.text('Record Podcast'), findsOneWidget);
    expect(find.text('Create Content'), findsOneWidget);
    expect(find.text('Edit Content'), findsOneWidget);
  });
}
