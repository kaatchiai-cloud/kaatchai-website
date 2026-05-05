package com.stori.stori_app

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.*
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Dual-camera recording plugin for Android
 * Uses CameraX for concurrent front + back camera recording
 * Requires Android 11+ and device support for concurrent cameras
 */
class DualCameraPlugin private constructor(
    private val activity: Activity
) : MethodChannel.MethodCallHandler, EventChannel.StreamHandler {

    companion object {
        private const val TAG = "DualCameraPlugin"
        private const val METHOD_CHANNEL = "com.stori/dual_camera"
        private const val EVENT_CHANNEL = "com.stori/dual_camera_events"

        fun registerWith(flutterEngine: FlutterEngine, activity: Activity) {
            val plugin = DualCameraPlugin(activity)

            val methodChannel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, METHOD_CHANNEL)
            methodChannel.setMethodCallHandler(plugin)

            val eventChannel = EventChannel(flutterEngine.dartExecutor.binaryMessenger, EVENT_CHANNEL)
            eventChannel.setStreamHandler(plugin)
        }
    }

    private var eventSink: EventChannel.EventSink? = null
    private var cameraExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private var isRecording = false
    private var sessionDir: String? = null
    private var sessionId: String? = null
    private var recordingStartTime: Long = 0
    private var isSwapped = false

    // Audio level monitoring
    private val handler = Handler(Looper.getMainLooper())
    private var audioLevelRunnable: Runnable? = null

    // CameraX components
    private var frontRecording: Recording? = null
    private var backRecording: Recording? = null

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "isDualCameraSupported" -> {
                result.success(checkDualCameraSupport())
            }
            "initialize" -> {
                initialize(call, result)
            }
            "startRecording" -> {
                startRecording(call, result)
            }
            "pauseRecording" -> {
                pauseRecording(result)
            }
            "resumeRecording" -> {
                resumeRecording(result)
            }
            "stopRecording" -> {
                stopRecording(result)
            }
            "swapCameras" -> {
                isSwapped = !isSwapped
                result.success(null)
            }
            "dispose" -> {
                cleanup()
                result.success(null)
            }
            else -> result.notImplemented()
        }
    }

    /**
     * Check if device supports concurrent dual cameras
     * Requires Android 11+ and hardware support
     */
    private fun checkDualCameraSupport(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return false

        try {
            val cameraManager = activity.getSystemService(Activity.CAMERA_SERVICE) as CameraManager
            val concurrentCameraIds = cameraManager.concurrentCameraIds

            // Check if there's a set containing both front and back cameras
            for (idSet in concurrentCameraIds) {
                var hasFront = false
                var hasBack = false
                for (id in idSet) {
                    val characteristics = cameraManager.getCameraCharacteristics(id)
                    val facing = characteristics.get(CameraCharacteristics.LENS_FACING)
                    if (facing == CameraCharacteristics.LENS_FACING_FRONT) hasFront = true
                    if (facing == CameraCharacteristics.LENS_FACING_BACK) hasBack = true
                }
                if (hasFront && hasBack) return true
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error checking dual camera support", e)
        }
        return false
    }

    private fun initialize(call: MethodCall, result: MethodChannel.Result) {
        // CameraX initialization
        // In a full implementation, this sets up CameraProvider with concurrent cameras
        // For now, return placeholder values
        result.success(mapOf(
            "frontTextureId" to -1,
            "backTextureId" to -1,
            "frontWidth" to 720,
            "frontHeight" to 1280,
            "backWidth" to 720,
            "backHeight" to 1280
        ))
    }

    private fun startRecording(call: MethodCall, result: MethodChannel.Result) {
        val dir = call.argument<String>("sessionDir")
        val id = call.argument<String>("sessionId")

        if (dir == null || id == null) {
            result.error("ARGS", "Missing sessionDir or sessionId", null)
            return
        }

        // Create session directory
        File(dir).mkdirs()

        sessionDir = dir
        sessionId = id
        recordingStartTime = System.currentTimeMillis()
        isRecording = true

        // Start audio level monitoring (200ms interval)
        startAudioLevelMonitoring()

        // TODO: Start CameraX concurrent recording
        // This requires ProcessCameraProvider.getInstance() and concurrent camera use cases
        // Full implementation in Phase 3 refinement

        result.success(null)
    }

    private fun pauseRecording(result: MethodChannel.Result) {
        frontRecording?.pause()
        backRecording?.pause()
        result.success(null)
    }

    private fun resumeRecording(result: MethodChannel.Result) {
        frontRecording?.resume()
        backRecording?.resume()
        result.success(null)
    }

    private fun stopRecording(result: MethodChannel.Result) {
        if (!isRecording) {
            result.error("NOT_RECORDING", "Not currently recording", null)
            return
        }

        stopAudioLevelMonitoring()

        frontRecording?.stop()
        backRecording?.stop()

        isRecording = false

        val duration = (System.currentTimeMillis() - recordingStartTime) / 1000.0

        result.success(mapOf(
            "sessionId" to sessionId,
            "frontVideoPath" to "$sessionDir/front_camera.mp4",
            "backVideoPath" to "$sessionDir/back_camera.mp4",
            "stereoAudioPath" to "$sessionDir/front_camera.mp4",
            "duration" to duration
        ))
    }

    private fun startAudioLevelMonitoring() {
        audioLevelRunnable = object : Runnable {
            override fun run() {
                if (!isRecording) return

                // Send audio levels to Flutter
                // In full implementation, read from AudioRecord or MediaRecorder
                eventSink?.success(mapOf(
                    "type" to "audioLevels",
                    "hostLevel" to 0.0,
                    "guestLevel" to 0.0
                ))

                handler.postDelayed(this, 200)
            }
        }
        handler.post(audioLevelRunnable!!)
    }

    private fun stopAudioLevelMonitoring() {
        audioLevelRunnable?.let { handler.removeCallbacks(it) }
        audioLevelRunnable = null
    }

    private fun cleanup() {
        stopAudioLevelMonitoring()
        frontRecording?.stop()
        backRecording?.stop()
        cameraExecutor.shutdown()
        isRecording = false
    }

    // EventChannel.StreamHandler

    override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
        eventSink = events
    }

    override fun onCancel(arguments: Any?) {
        eventSink = null
    }
}
