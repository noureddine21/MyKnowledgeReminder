package com.myknowledgereminder

import android.app.Activity
import android.app.NotificationManager
import android.os.Build
import android.provider.Settings
import android.appwidget.AppWidgetManager
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.speech.RecognizerIntent
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.BufferedReader
import java.io.InputStreamReader

/**
 * Small native helpers used by the JS side (src/native/mkrNative.ts):
 *  - saveTextFile / openTextFile: backup export/import through the Android file picker
 *    (lets the user choose Google Drive, Downloads, ...), no storage permission needed;
 *  - startSpeech: Android speech recognition (voice input for the to-do list);
 *  - recognizeText: on-device OCR (ML Kit, Latin scripts) for shared screenshots;
 *  - updateWidget: stores the home-screen widget snapshot and refreshes the widget.
 */
class MkrNativeModule(private val context: ReactApplicationContext) :
    ReactContextBaseJavaModule(context), ActivityEventListener {

  private var pendingSave: Pair<Promise, String>? = null
  private var pendingOpen: Promise? = null
  private var pendingSpeech: Promise? = null
  private var pendingImage: Promise? = null
  private var pendingPlayback: Promise? = null

  init {
    context.addActivityEventListener(this)
  }

  override fun getName(): String = NAME

  @ReactMethod
  fun saveTextFile(fileName: String, mimeType: String, content: String, promise: Promise) {
    val activity = context.currentActivity ?: return promise.reject(E_NO_ACTIVITY, "The app is not in the foreground.")
    if (pendingSave != null) return promise.reject(E_BUSY, "A save is already in progress.")
    val intent = Intent(Intent.ACTION_CREATE_DOCUMENT)
        .addCategory(Intent.CATEGORY_OPENABLE)
        .setType(mimeType)
        .putExtra(Intent.EXTRA_TITLE, fileName)
    pendingSave = promise to content
    try {
      activity.startActivityForResult(intent, REQUEST_SAVE)
    } catch (e: ActivityNotFoundException) {
      pendingSave = null
      promise.reject(E_UNAVAILABLE, "No file manager is available.", e)
    }
  }

  @ReactMethod
  fun openTextFile(promise: Promise) {
    val activity = context.currentActivity ?: return promise.reject(E_NO_ACTIVITY, "The app is not in the foreground.")
    if (pendingOpen != null) return promise.reject(E_BUSY, "A file is already being opened.")
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT)
        .addCategory(Intent.CATEGORY_OPENABLE)
        .setType("*/*")
        .putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/json", "text/plain", "application/octet-stream"))
    pendingOpen = promise
    try {
      activity.startActivityForResult(intent, REQUEST_OPEN)
    } catch (e: ActivityNotFoundException) {
      pendingOpen = null
      promise.reject(E_UNAVAILABLE, "No file manager is available.", e)
    }
  }

  @ReactMethod
  fun isSpeechAvailable(promise: Promise) {
    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
    promise.resolve(intent.resolveActivity(context.packageManager) != null)
  }

  @ReactMethod
  fun startSpeech(language: String?, prompt: String?, promise: Promise) {
    val activity = context.currentActivity ?: return promise.reject(E_NO_ACTIVITY, "The app is not in the foreground.")
    if (pendingSpeech != null) return promise.reject(E_BUSY, "Voice input is already running.")
    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
        .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
    if (!language.isNullOrBlank()) intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
    if (!prompt.isNullOrBlank()) intent.putExtra(RecognizerIntent.EXTRA_PROMPT, prompt)
    pendingSpeech = promise
    try {
      activity.startActivityForResult(intent, REQUEST_SPEECH)
    } catch (e: ActivityNotFoundException) {
      pendingSpeech = null
      promise.reject(E_UNAVAILABLE, "Voice input is not available on this phone.", e)
    }
  }

  @ReactMethod
  fun recognizeText(uri: String, promise: Promise) {
    try {
      val image = InputImage.fromFilePath(context, Uri.parse(uri))
      val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
      recognizer.process(image)
          .addOnSuccessListener { result ->
            promise.resolve(result.text)
            recognizer.close()
          }
          .addOnFailureListener { e ->
            promise.reject(E_OCR, e.message ?: "Text recognition failed.", e)
            recognizer.close()
          }
    } catch (e: Exception) {
      promise.reject(E_OCR, e.message ?: "The image could not be read.", e)
    }
  }

  /** Lets the Alarm screen appear over the lock screen and wake the display (only while it is shown). */
  @ReactMethod
  fun setShowWhenLocked(enabled: Boolean, promise: Promise) {
    val activity = context.currentActivity ?: return promise.resolve(false)
    activity.runOnUiThread {
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
          activity.setShowWhenLocked(enabled)
          activity.setTurnScreenOn(enabled)
        } else {
          @Suppress("DEPRECATION")
          val flags = android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
              android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
          @Suppress("DEPRECATION")
          if (enabled) activity.window.addFlags(flags) else activity.window.clearFlags(flags)
        }
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject(E_UNAVAILABLE, e.message ?: "Not available.", e)
      }
    }
  }

  /** Android 14+ requires the user to allow full-screen notifications for non-clock apps. */
  @ReactMethod
  fun canUseFullScreenIntent(promise: Promise) {
    if (Build.VERSION.SDK_INT < 34) return promise.resolve(true)
    val manager = context.getSystemService(NotificationManager::class.java)
    promise.resolve(manager?.canUseFullScreenIntent() ?: false)
  }

  @ReactMethod
  fun openFullScreenIntentSettings(promise: Promise) {
    try {
      val intent = if (Build.VERSION.SDK_INT >= 34) {
        Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${context.packageName}"))
      } else {
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject(E_UNAVAILABLE, e.message ?: "Settings not available.", e)
    }
  }

  /** Schedules a real alarm (alarm clock API). `spec`: id, at, title, body, informationId, planTaskId, repeatMs. */
  @ReactMethod
  fun scheduleAlarm(spec: com.facebook.react.bridge.ReadableMap, promise: Promise) {
    try {
      val alarm = AlarmSpec(
          id = spec.getString("id") ?: return promise.reject(E_UNAVAILABLE, "Missing id."),
          at = spec.getDouble("at").toLong(),
          title = spec.getString("title") ?: "",
          body = spec.getString("body") ?: "",
          informationId = if (spec.hasKey("informationId") && !spec.isNull("informationId")) spec.getInt("informationId") else null,
          planTaskId = if (spec.hasKey("planTaskId") && !spec.isNull("planTaskId")) spec.getInt("planTaskId") else null,
          repeatMs = if (spec.hasKey("repeatMs")) spec.getDouble("repeatMs").toLong() else 0L,
      )
      AlarmScheduler.schedule(context, alarm)
      promise.resolve(AlarmScheduler.canScheduleExact(context))
    } catch (e: Exception) {
      promise.reject(E_UNAVAILABLE, e.message ?: "The alarm could not be scheduled.", e)
    }
  }

  @ReactMethod
  fun cancelAlarm(id: String, promise: Promise) {
    AlarmScheduler.cancel(context, id)
    promise.resolve(null)
  }

  @ReactMethod
  fun cancelAlarmsWithPrefix(prefix: String, promise: Promise) {
    AlarmScheduler.cancelWithPrefix(context, prefix)
    promise.resolve(null)
  }

  /** Stops the ringing (sound, vibration, alarm notification). */
  @ReactMethod
  fun stopAlarmSound(promise: Promise) {
    AlarmService.stop(context)
    promise.resolve(null)
  }

  @ReactMethod
  fun canScheduleExactAlarms(promise: Promise) {
    promise.resolve(AlarmScheduler.canScheduleExact(context))
  }

  /** Xiaomi / MIUI: opens Autostart or the app's "Other permissions" page (lock screen, pop-ups). */
  @ReactMethod
  fun openVendorSettings(page: String, promise: Promise) {
    val pkg = context.packageName
    val candidates = when (page) {
      "autostart" -> listOf(
          Intent().setClassName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
          Intent("miui.intent.action.OP_AUTO_START").addCategory(Intent.CATEGORY_DEFAULT),
      )
      else -> listOf(
          Intent("miui.intent.action.APP_PERM_EDITOR")
              .setClassName("com.miui.securitycenter", "com.miui.permcenter.permissions.PermissionsEditorActivity")
              .putExtra("extra_pkgname", pkg),
          Intent("miui.intent.action.APP_PERM_EDITOR")
              .setClassName("com.miui.securitycenter", "com.miui.permcenter.permissions.AppPermissionsEditorActivity")
              .putExtra("extra_pkgname", pkg),
      )
    } + Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg"))
    for (intent in candidates) {
      try {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        return promise.resolve(true)
      } catch (_: Exception) {
        // Try the next one (different MIUI / HyperOS versions).
      }
    }
    promise.resolve(false)
  }

  /** Lets the user choose a photo; it is copied (≤ 1600 px JPEG) into the app's private storage. */
  @ReactMethod
  fun pickImage(promise: Promise) {
    val activity = context.currentActivity ?: return promise.reject(E_NO_ACTIVITY, "The app is not in the foreground.")
    if (pendingImage != null) return promise.reject(E_BUSY, "A photo is already being chosen.")
    val intent = Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*")
    pendingImage = promise
    try {
      activity.startActivityForResult(Intent.createChooser(intent, null), REQUEST_IMAGE)
    } catch (e: ActivityNotFoundException) {
      pendingImage = null
      promise.reject(E_UNAVAILABLE, "No gallery app is available.", e)
    }
  }

  /** Copies a shared image (content://) into the app's private storage. */
  @ReactMethod
  fun importImage(uri: String, promise: Promise) {
    Thread {
      try {
        promise.resolve(MediaHelper.importImage(context, Uri.parse(uri)))
      } catch (e: Exception) {
        promise.reject(E_IO, e.message ?: "The image could not be saved.", e)
      }
    }.start()
  }

  /** Deletes a photo / voice note of the app (ignores any other path). */
  @ReactMethod
  fun deleteAppFile(path: String, promise: Promise) {
    if (MediaHelper.isAppMedia(context, path)) {
      MediaHelper.toFile(path)?.delete()
    }
    promise.resolve(null)
  }

  @ReactMethod
  fun startRecording(promise: Promise) {
    try {
      promise.resolve(MediaHelper.startRecording(context))
    } catch (e: Exception) {
      promise.reject(E_UNAVAILABLE, e.message ?: "The microphone is not available.", e)
    }
  }

  /** Resolves { path, durationMs }. */
  @ReactMethod
  fun stopRecording(promise: Promise) {
    try {
      val (path, duration) = MediaHelper.stopRecording()
      val result = com.facebook.react.bridge.Arguments.createMap()
      result.putString("path", path)
      result.putDouble("durationMs", duration.toDouble())
      promise.resolve(result)
    } catch (e: Exception) {
      promise.reject(E_IO, e.message ?: "The recording failed.", e)
    }
  }

  @ReactMethod
  fun cancelRecording(promise: Promise) {
    MediaHelper.cancelRecording()
    promise.resolve(null)
  }

  /** Resolves true at the end of the voice note, false when stopped. */
  @ReactMethod
  fun playAudio(path: String, promise: Promise) {
    if (!MediaHelper.isAppMedia(context, path)) return promise.reject(E_IO, "Invalid voice note.")
    pendingPlayback?.resolve(false)
    pendingPlayback = promise
    try {
      MediaHelper.play(context, path) { completed ->
        if (pendingPlayback === promise) pendingPlayback = null
        promise.resolve(completed)
      }
    } catch (e: Exception) {
      pendingPlayback = null
      promise.reject(E_IO, e.message ?: "The voice note could not be played.", e)
    }
  }

  @ReactMethod
  fun stopAudio(promise: Promise) {
    MediaHelper.stopPlayback()
    promise.resolve(null)
  }

  /** Draws the item as an emerald & gold image and opens the share sheet. */
  @ReactMethod
  fun shareCard(card: com.facebook.react.bridge.ReadableMap, promise: Promise) {
    Thread {
      try {
        ShareCard.share(
            context,
            ShareCard.Card(
                title = card.getString("title") ?: "",
                content = card.getString("content") ?: "",
                source = if (card.hasKey("source") && !card.isNull("source")) card.getString("source") else null,
                footer = card.getString("footer") ?: "My Knowledge Reminder",
            ),
            card.getString("chooserTitle") ?: "Share",
        )
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject(E_IO, e.message ?: "The image could not be created.", e)
      }
    }.start()
  }

  @ReactMethod
  fun updateWidget(snapshotJson: String, promise: Promise) {
    try {
      context.getSharedPreferences(MkrWidgetProvider.PREFS, Context.MODE_PRIVATE)
          .edit()
          .putString(MkrWidgetProvider.KEY_SNAPSHOT, snapshotJson)
          .apply()
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, MkrWidgetProvider::class.java))
      if (ids.isNotEmpty()) {
        MkrWidgetProvider.render(context, manager, ids)
      }
      promise.resolve(ids.size)
    } catch (e: Exception) {
      promise.reject(E_WIDGET, e.message ?: "The widget could not be updated.", e)
    }
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    when (requestCode) {
      REQUEST_SAVE -> {
        val (promise, content) = pendingSave ?: return
        pendingSave = null
        val uri = data?.data
        if (resultCode != Activity.RESULT_OK || uri == null) return promise.resolve(null)
        try {
          context.contentResolver.openOutputStream(uri, "wt")?.use { it.write(content.toByteArray(Charsets.UTF_8)) }
              ?: return promise.reject(E_IO, "The file could not be written.")
          promise.resolve(uri.toString())
        } catch (e: Exception) {
          promise.reject(E_IO, e.message ?: "The file could not be written.", e)
        }
      }
      REQUEST_OPEN -> {
        val promise = pendingOpen ?: return
        pendingOpen = null
        val uri = data?.data
        if (resultCode != Activity.RESULT_OK || uri == null) return promise.resolve(null)
        try {
          val text = context.contentResolver.openInputStream(uri)?.use { stream ->
            BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).readText()
          } ?: return promise.reject(E_IO, "The file could not be read.")
          promise.resolve(text)
        } catch (e: Exception) {
          promise.reject(E_IO, e.message ?: "The file could not be read.", e)
        }
      }
      REQUEST_IMAGE -> {
        val promise = pendingImage ?: return
        pendingImage = null
        val uri = data?.data
        if (resultCode != Activity.RESULT_OK || uri == null) return promise.resolve(null)
        Thread {
          try {
            promise.resolve(MediaHelper.importImage(context, uri))
          } catch (e: Exception) {
            promise.reject(E_IO, e.message ?: "The image could not be saved.", e)
          }
        }.start()
      }
      REQUEST_SPEECH -> {
        val promise = pendingSpeech ?: return
        pendingSpeech = null
        if (resultCode != Activity.RESULT_OK) return promise.resolve(null)
        val results = data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
        promise.resolve(results?.firstOrNull())
      }
    }
  }

  override fun onNewIntent(intent: Intent) = Unit

  companion object {
    const val NAME = "MkrNative"
    private const val REQUEST_SAVE = 41001
    private const val REQUEST_OPEN = 41002
    private const val REQUEST_SPEECH = 41003
    private const val REQUEST_IMAGE = 41004
    private const val E_NO_ACTIVITY = "E_NO_ACTIVITY"
    private const val E_BUSY = "E_BUSY"
    private const val E_UNAVAILABLE = "E_UNAVAILABLE"
    private const val E_IO = "E_IO"
    private const val E_OCR = "E_OCR"
    private const val E_WIDGET = "E_WIDGET"
  }
}
