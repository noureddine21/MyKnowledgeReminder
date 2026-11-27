package com.myknowledgereminder

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONObject

/**
 * Real alarms (AlarmManager.setAlarmClock, like a clock app): reliable in Doze and on
 * aggressive vendors (Xiaomi/MIUI). Alarms are stored so they survive reboots and updates.
 */
data class AlarmSpec(
    val id: String,
    val at: Long,
    val title: String,
    val body: String,
    val informationId: Int?,
    val planTaskId: Int?,
    /** > 0: re-arm automatically after ringing (every N ms). */
    val repeatMs: Long,
) {
  fun toJson(): JSONObject = JSONObject()
      .put("id", id)
      .put("at", at)
      .put("title", title)
      .put("body", body)
      .put("informationId", informationId ?: -1)
      .put("planTaskId", planTaskId ?: -1)
      .put("repeatMs", repeatMs)

  companion object {
    fun fromJson(json: JSONObject) = AlarmSpec(
        id = json.getString("id"),
        at = json.getLong("at"),
        title = json.optString("title"),
        body = json.optString("body"),
        informationId = json.optInt("informationId", -1).takeIf { it > 0 },
        planTaskId = json.optInt("planTaskId", -1).takeIf { it > 0 },
        repeatMs = json.optLong("repeatMs", 0),
    )
  }
}

object AlarmScheduler {
  private const val PREFS = "mkr_alarms"
  const val ACTION_FIRE = "com.myknowledgereminder.ALARM_FIRE"
  const val EXTRA_ALARM_ID = "mkr_alarm_id"

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun load(context: Context, id: String): AlarmSpec? =
      prefs(context).getString(id, null)?.let { runCatching { AlarmSpec.fromJson(JSONObject(it)) }.getOrNull() }

  fun all(context: Context): List<AlarmSpec> =
      prefs(context).all.values.mapNotNull { value ->
        (value as? String)?.let { runCatching { AlarmSpec.fromJson(JSONObject(it)) }.getOrNull() }
      }

  private fun firePendingIntent(context: Context, id: String): PendingIntent {
    val intent = Intent(context, AlarmReceiver::class.java).setAction(ACTION_FIRE).putExtra(EXTRA_ALARM_ID, id)
    return PendingIntent.getBroadcast(
        context,
        id.hashCode(),
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun showPendingIntent(context: Context): PendingIntent {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
        ?: Intent(context, MainActivity::class.java)
    return PendingIntent.getActivity(context, 1, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  fun canScheduleExact(context: Context): Boolean {
    val manager = context.getSystemService(AlarmManager::class.java) ?: return false
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.S || manager.canScheduleExactAlarms()
  }

  fun schedule(context: Context, spec: AlarmSpec) {
    prefs(context).edit().putString(spec.id, spec.toJson().toString()).apply()
    arm(context, spec)
  }

  private fun arm(context: Context, spec: AlarmSpec) {
    val manager = context.getSystemService(AlarmManager::class.java) ?: return
    val operation = firePendingIntent(context, spec.id)
    if (canScheduleExact(context)) {
      // Alarm clock: exempt from Doze, shown as the next alarm in the status bar.
      manager.setAlarmClock(AlarmManager.AlarmClockInfo(spec.at, showPendingIntent(context)), operation)
    } else {
      manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, spec.at, operation)
    }
  }

  fun cancel(context: Context, id: String) {
    prefs(context).edit().remove(id).apply()
    context.getSystemService(AlarmManager::class.java)?.cancel(firePendingIntent(context, id))
  }

  fun cancelWithPrefix(context: Context, prefix: String) {
    prefs(context).all.keys.filter { it.startsWith(prefix) }.forEach { cancel(context, it) }
  }

  /** After a reboot or an app update: re-arm future alarms, drop or roll forward past ones. */
  fun rescheduleAll(context: Context) {
    val now = System.currentTimeMillis()
    for (spec in all(context)) {
      when {
        spec.at > now -> arm(context, spec)
        spec.repeatMs > 0 -> schedule(context, spec.copy(at = nextAfter(spec.at, spec.repeatMs, now)))
        else -> cancel(context, spec.id)
      }
    }
  }

  fun nextAfter(at: Long, repeatMs: Long, now: Long): Long {
    if (repeatMs <= 0) return at
    var next = at
    if (next <= now) {
      val steps = (now - next) / repeatMs + 1
      next += steps * repeatMs
    }
    return next
  }
}
