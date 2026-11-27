package com.myknowledgereminder

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import java.io.File
import java.io.FileOutputStream

/**
 * Photos and voice notes of the information items, kept in the app's private
 * storage (files/media). Nothing leaves the phone.
 */
object MediaHelper {
  private const val DIR = "media"
  private const val MAX_IMAGE_SIDE = 1600

  fun mediaDir(context: Context): File = File(context.filesDir, DIR).apply { mkdirs() }

  /** True for a file:// path inside the media folder (the only files the app may delete). */
  fun isAppMedia(context: Context, path: String): Boolean {
    val file = toFile(path) ?: return false
    return file.canonicalPath.startsWith(mediaDir(context).canonicalPath + File.separator)
  }

  fun toFile(path: String): File? {
    val raw = if (path.startsWith("file://")) Uri.parse(path).path else path
    return raw?.let { File(it) }
  }

  /** Copies an image (content:// or file://) as a JPEG of at most 1600 px, upright. Returns file://… */
  fun importImage(context: Context, source: Uri): String {
    val resolver = context.contentResolver
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    resolver.openInputStream(source)?.use { BitmapFactory.decodeStream(it, null, bounds) }
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
      throw IllegalArgumentException("This file is not an image.")
    }
    var sample = 1
    while (bounds.outWidth / (sample * 2) >= MAX_IMAGE_SIDE || bounds.outHeight / (sample * 2) >= MAX_IMAGE_SIDE) {
      sample *= 2
    }
    val decoded = resolver.openInputStream(source)?.use {
      BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
    } ?: throw IllegalArgumentException("The image could not be read.")

    val rotation = try {
      resolver.openInputStream(source)?.use {
        when (ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
          ExifInterface.ORIENTATION_ROTATE_90 -> 90f
          ExifInterface.ORIENTATION_ROTATE_180 -> 180f
          ExifInterface.ORIENTATION_ROTATE_270 -> 270f
          else -> 0f
        }
      } ?: 0f
    } catch (_: Exception) {
      0f
    }
    val scale = minOf(1f, MAX_IMAGE_SIDE.toFloat() / maxOf(decoded.width, decoded.height))
    val matrix = Matrix().apply {
      postScale(scale, scale)
      postRotate(rotation)
    }
    val bitmap = if (scale < 1f || rotation != 0f) {
      Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
    } else {
      decoded
    }
    val file = File(mediaDir(context), "img_${System.currentTimeMillis()}.jpg")
    FileOutputStream(file).use { bitmap.compress(Bitmap.CompressFormat.JPEG, 85, it) }
    if (bitmap !== decoded) decoded.recycle()
    bitmap.recycle()
    return Uri.fromFile(file).toString()
  }

  // --- Voice notes -----------------------------------------------------------------

  private var recorder: MediaRecorder? = null
  private var recordingFile: File? = null
  private var recordingStartedAt = 0L
  private var player: MediaPlayer? = null
  private var onPlaybackDone: ((Boolean) -> Unit)? = null

  fun startRecording(context: Context): String {
    cancelRecording()
    val file = File(mediaDir(context), "voice_${System.currentTimeMillis()}.m4a")
    val r = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(context) else @Suppress("DEPRECATION") MediaRecorder()
    try {
      r.setAudioSource(MediaRecorder.AudioSource.MIC)
      r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
      r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
      r.setAudioSamplingRate(44100)
      r.setAudioEncodingBitRate(64000)
      r.setOutputFile(file.absolutePath)
      r.prepare()
      r.start()
    } catch (e: Exception) {
      r.release()
      file.delete()
      throw e
    }
    recorder = r
    recordingFile = file
    recordingStartedAt = SystemClock.elapsedRealtime()
    return Uri.fromFile(file).toString()
  }

  /** Returns (file://path, duration in ms). */
  fun stopRecording(): Pair<String, Long> {
    val r = recorder ?: throw IllegalStateException("No recording in progress.")
    val file = recordingFile!!
    val duration = SystemClock.elapsedRealtime() - recordingStartedAt
    recorder = null
    recordingFile = null
    try {
      r.stop()
    } catch (e: RuntimeException) {
      // stop() fails when nothing was recorded (too short).
      r.release()
      file.delete()
      throw IllegalStateException("The recording is too short.")
    }
    r.release()
    return Uri.fromFile(file).toString() to duration
  }

  fun cancelRecording() {
    val r = recorder ?: return
    try {
      r.stop()
    } catch (_: Exception) {
    }
    r.release()
    recordingFile?.delete()
    recorder = null
    recordingFile = null
  }

  /** Plays a voice note; `done(true)` at the end, `done(false)` when stopped or replaced. */
  fun play(context: Context, path: String, done: (Boolean) -> Unit) {
    stopPlayback()
    val file = toFile(path) ?: throw IllegalArgumentException("Invalid file.")
    if (!file.exists()) throw IllegalArgumentException("The voice note file is missing.")
    val p = MediaPlayer()
    p.setDataSource(file.absolutePath)
    p.setOnCompletionListener {
      finishPlayback(true)
    }
    p.setOnErrorListener { _, _, _ ->
      finishPlayback(false)
      true
    }
    p.prepare()
    player = p
    onPlaybackDone = done
    p.start()
  }

  fun stopPlayback() = finishPlayback(false)

  private fun finishPlayback(completed: Boolean) {
    val p = player ?: return
    player = null
    try {
      p.stop()
    } catch (_: Exception) {
    }
    p.release()
    val done = onPlaybackDone
    onPlaybackDone = null
    done?.invoke(completed)
  }
}
