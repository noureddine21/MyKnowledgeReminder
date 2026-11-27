package com.myknowledgereminder

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

/** Fires when an alarm is due: starts the ringing service and re-arms repeating alarms. */
class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      AlarmScheduler.ACTION_FIRE -> {
        val id = intent.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID) ?: return
        val spec = AlarmScheduler.load(context, id) ?: return
        val service = Intent(context, AlarmService::class.java)
            .setAction(AlarmService.ACTION_START)
            .putExtra(AlarmScheduler.EXTRA_ALARM_ID, id)
        // Allowed from the background: the app was woken by an exact alarm.
        ContextCompat.startForegroundService(context, service)
        if (spec.repeatMs > 0) {
          val next = AlarmScheduler.nextAfter(spec.at, spec.repeatMs, System.currentTimeMillis())
          AlarmScheduler.schedule(context, spec.copy(at = next))
        }
      }
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_LOCKED_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      "android.intent.action.QUICKBOOT_POWERON" -> AlarmScheduler.rescheduleAll(context)
    }
  }
}
