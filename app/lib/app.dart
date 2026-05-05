import 'package:flutter/material.dart';
import 'core/theme/app_theme.dart';
import 'screens/landing/landing_screen.dart';
import 'screens/record/record_screen.dart';
import 'screens/create/create_screen.dart';
import 'screens/editor/editor_screen.dart';

class StoriApp extends StatelessWidget {
  const StoriApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Stori',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      initialRoute: '/',
      routes: {
        '/': (context) => const LandingScreen(),
        '/record': (context) => const RecordScreen(),
        '/create': (context) => const CreateScreen(),
        '/editor': (context) => const EditorScreen(),
      },
    );
  }
}
