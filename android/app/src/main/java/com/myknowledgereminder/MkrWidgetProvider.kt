package com.myknowledgereminder

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject

/**
 * Home-screen widget "My day": today's next tasks and the number of items to review.
 * The JS side writes a small JSON snapshot (see src/services/widgetService.ts);
 * the widget only displays it, so it never touches the database.
 */
class MkrWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
    render(context, manager, appWidgetIds)
  }

  companion object {
    const val PREFS = "mkr_widget"
    const val KEY_SNAPSHOT = "snapshot"

    fun render(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
      val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_SNAPSHOT, null)
      var title = context.getString(R.string.widget_title)
      var subtitle = context.getString(R.string.widget_empty)
      var body = ""
      var badge = ""
      if (raw != null) {
        try {
          val json = JSONObject(raw)
          title = json.optString("title", title)
          subtitle = json.optString("subtitle", subtitle)
          badge = json.optString("badge", "")
          val lines = json.optJSONArray("lines")
          if (lines != null) {
            body = (0 until lines.length()).joinToString("\n") { lines.optString(it) }
          }
        } catch (_: Exception) {
          // Corrupted snapshot: show the defaults.
        }
      }

      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
          ?: Intent(context, MainActivity::class.java)
      val pending = PendingIntent.getActivity(
          context,
          0,
          launch,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )

      for (id in appWidgetIds) {
        val views = RemoteViews(context.packageName, R.layout.widget_today)
        views.setTextViewText(R.id.widget_title, title)
        views.setTextViewText(R.id.widget_subtitle, subtitle)
        views.setTextViewText(R.id.widget_body, body)
        views.setViewVisibility(R.id.widget_body, if (body.isEmpty()) View.GONE else View.VISIBLE)
        views.setTextViewText(R.id.widget_badge, badge)
        views.setViewVisibility(R.id.widget_badge, if (badge.isEmpty()) View.GONE else View.VISIBLE)
        views.setOnClickPendingIntent(R.id.widget_root, pending)
        manager.updateAppWidget(id, views)
      }
    }
  }
}
