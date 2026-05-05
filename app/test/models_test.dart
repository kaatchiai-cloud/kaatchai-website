import 'package:flutter_test/flutter_test.dart';
import 'package:stori_app/models/models.dart';

void main() {
  group('PhotoItem', () {
    test('serialization roundtrip', () {
      final photo = PhotoItem(
        id: 1,
        imagePath: '/path/to/image.png',
        startTime: 2.5,
        duration: 5.0,
        transition: 'fade',
        transDur: 0.8,
        motion: 'ken-burns',
        type: 'image',
      );

      final json = photo.toJson();
      final restored = PhotoItem.fromJson(json);

      expect(restored.id, 1);
      expect(restored.imagePath, '/path/to/image.png');
      expect(restored.startTime, 2.5);
      expect(restored.duration, 5.0);
      expect(restored.transition, 'fade');
      expect(restored.transDur, 0.8);
      expect(restored.motion, 'ken-burns');
      expect(restored.endTime, 7.5);
    });

    test('defaults for missing fields', () {
      final json = {'id': 1, 'imagePath': '/img.png', 'startTime': 0.0, 'duration': 3.0};
      final photo = PhotoItem.fromJson(json);

      expect(photo.transition, 'none');
      expect(photo.transDur, 0.5);
      expect(photo.motion, 'none');
      expect(photo.type, 'image');
    });

    test('video item fields', () {
      final photo = PhotoItem(
        id: 2,
        imagePath: '/thumb.png',
        startTime: 0,
        duration: 10,
        type: 'video',
        videoPath: '/video.mp4',
        videoDuration: 30,
        inPoint: 5,
        outPoint: 15,
      );

      final json = photo.toJson();
      final restored = PhotoItem.fromJson(json);

      expect(restored.type, 'video');
      expect(restored.videoPath, '/video.mp4');
      expect(restored.inPoint, 5);
      expect(restored.outPoint, 15);
    });
  });

  group('TextItem', () {
    test('serialization roundtrip', () {
      final text = TextItem(
        id: 1,
        text: 'Hello World',
        font: 'Poppins',
        fontSize: 36,
        color: '#ff0000',
        strokeColor: '#000000',
        strokeWidth: 2,
        bgColor: '#000000',
        bgAlpha: 0.5,
        bold: true,
        position: 'top-center',
        startTime: 1.0,
        duration: 4.0,
        animation: 'slide-up',
        animDur: 0.8,
      );

      final json = text.toJson();
      final restored = TextItem.fromJson(json);

      expect(restored.text, 'Hello World');
      expect(restored.bold, true);
      expect(restored.position, 'top-center');
      expect(restored.animation, 'slide-up');
      expect(restored.endTime, 5.0);
    });
  });

  group('SubtitleItem', () {
    test('has correct defaults', () {
      final sub = SubtitleItem(id: 1, startTime: 0, text: 'Subtitle');

      expect(sub.position, 'bot-center');
      expect(sub.bgAlpha, 0.5);
      expect(sub.bold, true);
      expect(sub.fontSize, 32);
      expect(sub.strokeWidth, 2);
    });
  });

  group('PipItem', () {
    test('serialization roundtrip', () {
      final pip = PipItem(
        id: 1,
        videoPath: '/speaker.mp4',
        videoDuration: 120,
        inPoint: 10,
        outPoint: 100,
        position: 'top-left',
        size: 30,
        shape: 'rounded',
        border: 4,
        borderColor: '#ff0000',
        shadow: false,
        name: 'Host',
      );

      final json = pip.toJson();
      final restored = PipItem.fromJson(json);

      expect(restored.position, 'top-left');
      expect(restored.size, 30);
      expect(restored.shape, 'rounded');
      expect(restored.shadow, false);
      expect(restored.name, 'Host');
    });
  });

  group('RecordingSession', () {
    test('serialization roundtrip', () {
      final session = RecordingSession(
        id: 'test-session',
        frontVideoPath: '/front.mp4',
        backVideoPath: '/back.mp4',
        stereoAudioPath: '/stereo.wav',
        duration: 60.5,
        speakerTimeline: [
          SpeakerSegment(speakerId: 'host', startTime: 0, endTime: 10),
          SpeakerSegment(speakerId: 'guest', startTime: 10, endTime: 25),
        ],
        hostCleanAudioPath: '/host_clean.wav',
      );

      final json = session.toJson();
      final restored = RecordingSession.fromJson(json);

      expect(restored.id, 'test-session');
      expect(restored.duration, 60.5);
      expect(restored.speakerTimeline.length, 2);
      expect(restored.speakerTimeline[0].speakerId, 'host');
      expect(restored.speakerTimeline[1].endTime, 25);
      expect(restored.hostCleanAudioPath, '/host_clean.wav');
    });
  });

  group('Project', () {
    test('full serialization roundtrip', () {
      final project = Project(
        id: 'test-project',
        name: 'My Video',
        imageSize: '1080x1920',
        exportQuality: 'high',
        exportFps: '30',
        seriesName: 'My Series',
        episodeNumber: 3,
        stylePreset: 'cinematic',
        photos: [
          PhotoItem(id: 1, imagePath: '/img1.png', startTime: 0, duration: 5),
          PhotoItem(id: 2, imagePath: '/img2.png', startTime: 5, duration: 5),
        ],
        texts: [
          TextItem(id: 1, text: 'Title', startTime: 0),
        ],
        bgmVolume: 0.5,
        bgmLoop: false,
      );

      final json = project.toJson();
      final restored = Project.fromJson(json);

      expect(restored.name, 'My Video');
      expect(restored.imageSize, '1080x1920');
      expect(restored.width, 1080);
      expect(restored.height, 1920);
      expect(restored.photos.length, 2);
      expect(restored.texts.length, 1);
      expect(restored.seriesName, 'My Series');
      expect(restored.episodeNumber, 3);
      expect(restored.bgmVolume, 0.5);
      expect(restored.bgmLoop, false);
    });
  });

  group('Scene', () {
    test('serialization', () {
      final scene = Scene(
        prompt: 'A beautiful sunset',
        startTime: 0,
        endTime: 5,
        text: 'Narration text',
        status: 'done',
        imagePath: '/scene1.png',
      );

      final json = scene.toJson();
      final restored = Scene.fromJson(json);

      expect(restored.prompt, 'A beautiful sunset');
      expect(restored.duration, 5);
      expect(restored.status, 'done');
    });
  });
}
