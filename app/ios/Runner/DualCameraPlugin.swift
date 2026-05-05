import Flutter
import UIKit
import AVFoundation

/// Dual-camera recording plugin for iOS
/// Uses AVCaptureMultiCamSession for simultaneous front + back camera recording
/// Requires iPhone XS or later, iOS 13+
class DualCameraPlugin: NSObject, FlutterPlugin {
    private var registrar: FlutterPluginRegistrar
    private var eventSink: FlutterEventSink?

    // Multi-cam session
    private var multiCamSession: AVCaptureMultiCamSession?

    // Camera inputs
    private var frontCameraInput: AVCaptureDeviceInput?
    private var backCameraInput: AVCaptureDeviceInput?

    // Video outputs
    private var frontVideoOutput: AVCaptureMovieFileOutput?
    private var backVideoOutput: AVCaptureMovieFileOutput?

    // Audio
    private var audioOutput: AVCaptureAudioDataOutput?
    private var audioInput: AVCaptureDeviceInput?

    // Texture renderers for preview
    private var frontTextureEntry: FlutterTextureEntry?
    private var backTextureEntry: FlutterTextureEntry?

    // Recording state
    private var isRecording = false
    private var sessionDir: String?
    private var sessionId: String?
    private var recordingStartTime: Date?
    private var isSwapped = false

    // Audio level monitoring
    private var audioLevelTimer: Timer?

    init(registrar: FlutterPluginRegistrar) {
        self.registrar = registrar
        super.init()
    }

    static func register(with registrar: FlutterPluginRegistrar) {
        let channel = FlutterMethodChannel(
            name: "com.stori/dual_camera",
            binaryMessenger: registrar.messenger()
        )
        let eventChannel = FlutterEventChannel(
            name: "com.stori/dual_camera_events",
            binaryMessenger: registrar.messenger()
        )

        let instance = DualCameraPlugin(registrar: registrar)
        registrar.addMethodCallDelegate(instance, channel: channel)
        eventChannel.setStreamHandler(instance)
    }

    func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
        switch call.method {
        case "isDualCameraSupported":
            result(AVCaptureMultiCamSession.isMultiCamSupported)

        case "initialize":
            initialize(call: call, result: result)

        case "startRecording":
            startRecording(call: call, result: result)

        case "pauseRecording":
            pauseRecording(result: result)

        case "resumeRecording":
            resumeRecording(result: result)

        case "stopRecording":
            stopRecording(result: result)

        case "swapCameras":
            isSwapped = !isSwapped
            result(nil)

        case "dispose":
            cleanup()
            result(nil)

        default:
            result(FlutterMethodNotImplemented)
        }
    }

    // MARK: - Initialize

    private func initialize(call: FlutterMethodCall, result: @escaping FlutterResult) {
        guard AVCaptureMultiCamSession.isMultiCamSupported else {
            result(FlutterError(code: "UNSUPPORTED", message: "Multi-cam not supported on this device", details: nil))
            return
        }

        do {
            // Configure audio session for voice recording
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetooth])
            try audioSession.setActive(true)

            // Create multi-cam session
            let session = AVCaptureMultiCamSession()
            session.beginConfiguration()

            // Front camera
            guard let frontCamera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front) else {
                result(FlutterError(code: "NO_CAMERA", message: "Front camera not available", details: nil))
                return
            }
            let frontInput = try AVCaptureDeviceInput(device: frontCamera)
            if session.canAddInput(frontInput) {
                session.addInputWithNoConnections(frontInput)
            }

            // Back camera
            guard let backCamera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else {
                result(FlutterError(code: "NO_CAMERA", message: "Back camera not available", details: nil))
                return
            }
            let backInput = try AVCaptureDeviceInput(device: backCamera)
            if session.canAddInput(backInput) {
                session.addInputWithNoConnections(backInput)
            }

            // Audio input
            guard let audioDevice = AVCaptureDevice.default(for: .audio) else {
                result(FlutterError(code: "NO_MIC", message: "Microphone not available", details: nil))
                return
            }
            let audioDeviceInput = try AVCaptureDeviceInput(device: audioDevice)
            if session.canAddInput(audioDeviceInput) {
                session.addInputWithNoConnections(audioDeviceInput)
            }

            // Video outputs
            let frontOutput = AVCaptureMovieFileOutput()
            let backOutput = AVCaptureMovieFileOutput()

            if session.canAddOutput(frontOutput) {
                session.addOutputWithNoConnections(frontOutput)
            }
            if session.canAddOutput(backOutput) {
                session.addOutputWithNoConnections(backOutput)
            }

            // Connect front camera to front output
            if let frontVideoPort = frontInput.ports(for: .video, sourceDeviceType: frontCamera.deviceType, sourceDevicePosition: .front).first {
                let frontConnection = AVCaptureConnection(inputPorts: [frontVideoPort], output: frontOutput)
                if session.canAddConnection(frontConnection) {
                    session.addConnection(frontConnection)
                }
                frontConnection.videoOrientation = .portrait
                if frontConnection.isVideoMirroringSupported {
                    frontConnection.isVideoMirrored = true
                }
            }

            // Connect back camera to back output
            if let backVideoPort = backInput.ports(for: .video, sourceDeviceType: backCamera.deviceType, sourceDevicePosition: .back).first {
                let backConnection = AVCaptureConnection(inputPorts: [backVideoPort], output: backOutput)
                if session.canAddConnection(backConnection) {
                    session.addConnection(backConnection)
                }
                backConnection.videoOrientation = .portrait
            }

            // Connect audio to both outputs
            if let audioPort = audioDeviceInput.ports(for: .audio, sourceDeviceType: audioDevice.deviceType, sourceDevicePosition: .unspecified).first {
                let frontAudioConnection = AVCaptureConnection(inputPorts: [audioPort], output: frontOutput)
                if session.canAddConnection(frontAudioConnection) {
                    session.addConnection(frontAudioConnection)
                }
            }

            session.commitConfiguration()

            // Store references
            multiCamSession = session
            frontCameraInput = frontInput
            backCameraInput = backInput
            frontVideoOutput = frontOutput
            backVideoOutput = backOutput
            audioInput = audioDeviceInput

            // Start session
            DispatchQueue.global(qos: .userInitiated).async {
                session.startRunning()
            }

            // Return preview info (texture IDs would be set up separately)
            result([
                "frontTextureId": -1, // Will use Texture widget in future
                "backTextureId": -1,
                "frontWidth": 720,
                "frontHeight": 1280,
                "backWidth": 720,
                "backHeight": 1280,
            ] as [String: Any])

        } catch {
            result(FlutterError(code: "INIT_FAILED", message: error.localizedDescription, details: nil))
        }
    }

    // MARK: - Recording

    private func startRecording(call: FlutterMethodCall, result: @escaping FlutterResult) {
        guard let args = call.arguments as? [String: Any],
              let dir = args["sessionDir"] as? String,
              let id = args["sessionId"] as? String else {
            result(FlutterError(code: "ARGS", message: "Missing sessionDir or sessionId", details: nil))
            return
        }

        // Create session directory
        let fileManager = FileManager.default
        try? fileManager.createDirectory(atPath: dir, withIntermediateDirectories: true)

        sessionDir = dir
        sessionId = id
        recordingStartTime = Date()

        let frontPath = "\(dir)/front_camera.mp4"
        let backPath = "\(dir)/back_camera.mp4"

        // Start recording on both outputs
        frontVideoOutput?.startRecording(to: URL(fileURLWithPath: frontPath), recordingDelegate: self)
        backVideoOutput?.startRecording(to: URL(fileURLWithPath: backPath), recordingDelegate: self)

        isRecording = true

        // Start audio level monitoring
        startAudioLevelMonitoring()

        result(nil)
    }

    private func pauseRecording(result: @escaping FlutterResult) {
        frontVideoOutput?.pauseRecording()
        backVideoOutput?.pauseRecording()
        result(nil)
    }

    private func resumeRecording(result: @escaping FlutterResult) {
        frontVideoOutput?.resumeRecording()
        backVideoOutput?.resumeRecording()
        result(nil)
    }

    private func stopRecording(result: @escaping FlutterResult) {
        guard isRecording, let dir = sessionDir, let id = sessionId else {
            result(FlutterError(code: "NOT_RECORDING", message: "Not currently recording", details: nil))
            return
        }

        audioLevelTimer?.invalidate()
        audioLevelTimer = nil

        frontVideoOutput?.stopRecording()
        backVideoOutput?.stopRecording()

        isRecording = false

        let duration = Date().timeIntervalSince(recordingStartTime ?? Date())

        result([
            "sessionId": id,
            "frontVideoPath": "\(dir)/front_camera.mp4",
            "backVideoPath": "\(dir)/back_camera.mp4",
            "stereoAudioPath": "\(dir)/front_camera.mp4", // Audio embedded in front video
            "duration": duration,
        ] as [String: Any])
    }

    // MARK: - Audio Level Monitoring

    private func startAudioLevelMonitoring() {
        // Monitor audio levels every 200ms for speaker detection
        audioLevelTimer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { [weak self] _ in
            guard let self = self, let sink = self.eventSink else { return }

            // Read audio levels from capture connections
            // In a full implementation, this would read from audio data output
            // For now, send simulated levels (will be replaced with real data)
            let hostLevel = self.getAudioLevel(for: self.frontVideoOutput)
            let guestLevel = self.getAudioLevel(for: self.backVideoOutput)

            sink([
                "type": "audioLevels",
                "hostLevel": hostLevel,
                "guestLevel": guestLevel,
            ] as [String: Any])
        }
    }

    private func getAudioLevel(for output: AVCaptureMovieFileOutput?) -> Double {
        guard let output = output else { return 0 }
        // Get audio channel from connections
        for connection in output.connections {
            for channel in connection.audioChannels {
                // averagePowerLevel is in dB (-160 to 0)
                let db = channel.averagePowerLevel
                // Convert to 0-1 linear scale
                let linear = max(0, (db + 60) / 60) // -60dB = 0, 0dB = 1
                return Double(linear)
            }
        }
        return 0
    }

    // MARK: - Cleanup

    private func cleanup() {
        audioLevelTimer?.invalidate()
        audioLevelTimer = nil
        multiCamSession?.stopRunning()
        multiCamSession = nil
        frontCameraInput = nil
        backCameraInput = nil
        frontVideoOutput = nil
        backVideoOutput = nil
        audioInput = nil
        isRecording = false
    }
}

// MARK: - AVCaptureFileOutputRecordingDelegate

extension DualCameraPlugin: AVCaptureFileOutputRecordingDelegate {
    func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo outputFileURL: URL, from connections: [AVCaptureConnection], error: Error?) {
        if let error = error {
            eventSink?([
                "type": "error",
                "message": "Recording error: \(error.localizedDescription)",
            ] as [String: Any])
        }
    }
}

// MARK: - FlutterStreamHandler

extension DualCameraPlugin: FlutterStreamHandler {
    func onListen(withArguments arguments: Any?, eventSink events: @escaping FlutterEventSink) -> FlutterError? {
        self.eventSink = events
        return nil
    }

    func onCancel(withArguments arguments: Any?) -> FlutterError? {
        self.eventSink = nil
        return nil
    }
}
