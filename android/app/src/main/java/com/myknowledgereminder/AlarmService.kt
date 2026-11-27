package com.myknowledgereminder

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat

/**
 * Rings like an alarm clock: alarm ringtone on the alarm stream (plays in silent mode),
 * vibration, and a full-screen notification that opens the Alarm screen over the lock
 * screen. Stops when the user answers in the app, taps "Stop", or after 10 minutes.
 */
class AlarmService : Service() {
  private var player: MediaPlayer? = null
  private var vibrator: Vibrator? = null
  private val handler = Handler(Looper.getMainLooper())
  private val timeout = Runnable { stopRinging() }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopRinging()
        return START_NOT_STICKY
      }
      ACTION_START -> {
        val id = intent.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID)
        val spec = id?.let { AlarmScheduler.load(this, it) }
        if (spec == null) {
          stopSelf()
          return START_NOT_STICKY
        }
        startRinging(spec)
      }
    }
    return START_NOT_STICKY
  }

  private fun startRinging(spec: AlarmSpec) {
    ensureChannel(this)
    val notification = buildNotification(spec)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    currentAlarmId = spec.id
    playSound()
    vibrate()
    handler.removeCallbacks(timeout)
    handler.postDelayed(timeout, MAX_RING_MS)
  }

  private fun buildNotification(spec: AlarmSpec): Notification {
    val open = alarmActivityIntent(this, spec)
    val fullScreen = PendingIntent.getActivity(
        this, spec.id.hashCode(), open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val stop = PendingIntent.getService(
        this,
        2,
        Intent(this, AlarmService::class.java).setAction(ACTION_STOP),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    return NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_stat_notification)
        .setColor(0xFF0B4A3A.toInt())
        .setContentTitle(spec.title)
        .setContentText(spec.body)
        .setStyle(NotificationCompat.BigTextStyle().bigText(spec.body))
        .setCategory(NotificationCompat.CATEGORY_ALARM)
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setOngoing(true)
        .setAutoCancel(false)
        .setContentIntent(fullScreen)
        .setFullScreenIntent(fullScreen, true)
        .addAction(0, getString(R.string.alarm_open), fullScreen)
        .addAction(0, getString(R.string.alarm_stop), stop)
        .build()
  }

  private fun playSound() {
    releasePlayer()
    val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
        ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        ?: return
    try {
      player = MediaPlayer().apply {
        setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build())
        setDataSource(this@AlarmService, uri)
        isLooping = true
        prepare()
        start()
      }
    } catch (_: Exception) {
      releasePlayer()
    }
  }

  private fun vibrate() {
    vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      getSystemService(VibratorManager::class.java)?.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }
    val pattern = longArrayOf(0, 700, 500, 700, 500)
    vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 1))
  }

  private fun releasePlayer() {
    try {
      player?.stop()
    } catch (_: Exception) {
    }
    player?.release()
    player = null
  }

  private fun stopRinging() {
    handler.removeCallbacks(timeout)
    releasePlayer()
    vibrator?.cancel()
    vibrator = null
    currentAlarmId = null
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    stopSelf()
  }

  override fun onDestroy() {
    handler.removeCallbacks(timeout)
    releasePlayer()
    vibrator?.cancel()
    super.onDestroy()
  }

  companion object {
    const val ACTION_START = "com.myknowledgereminder.ALARM_START"
    const val ACTION_STOP = "com.myknowledgereminder.ALARM_STOP"
    const val EXTRA_IS_ALARM = "mkr_alarm"
    const val EXTRA_INFORMATION_ID = "mkr_information_id"
    const val EXTRA_PLAN_TASK_ID = "mkr_plan_task_id"
    private const val CHANNEL_ID = "mkr-alarm-ringing"
    private const val NOTIFICATION_ID = 4242
    private const val MAX_RING_MS = 10 * 60 * 1000L

    @Volatile
    var currentAlarmId: String? = null

    fun alarmActivityIntent(context: Context, spec: AlarmSpec): Intent =
        Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(EXTRA_IS_ALARM, true)
            .putExtra(AlarmScheduler.EXTRA_ALARM_ID, spec.id)
            .putExtra(EXTRA_INFORMATION_ID, spec.informationId ?: -1)
            .putExtra(EXTRA_PLAN_TASK_ID, spec.planTaskId ?: -1)

    fun ensureChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val manager = context.getSystemService(NotificationManager::class.java) ?: return
      if (manager.getNotificationChannel(CHANNEL_ID) != null) return
      val channel = NotificationChannel(CHANNEL_ID, context.getString(R.string.alarm_channel), NotificationManager.IMPORTANCE_HIGH).apply {
        description = context.getString(R.string.alarm_channel_description)
        // The service plays the sound and vibration itself (alarm stream).
        setSound(null, null)
        enableVibration(false)
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        setBypassDnd(true)
      }
      manager.createNotificationChannel(channel)
    }

    fun stop(context: Context) {
      if (currentAlarmId == null) return
      context.startService(Intent(context, AlarmService::class.java).setAction(ACTION_STOP))
    }
  }
}
