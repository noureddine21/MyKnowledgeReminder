package com.myknowledgereminder

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "MyKnowledgeReminder"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onCreate(savedInstanceState: Bundle?) {
    convertShareIntent(intent)
    // null: react-native-screens must not restore fragments after process death.
    super.onCreate(null)
  }

  override fun onNewIntent(intent: Intent) {
    convertShareIntent(intent)
    super.onNewIntent(intent)
  }

  /**
   * Text shared from another app (ACTION_SEND) is turned into an internal
   * myknowledgereminder://share?text=...&subject=... link so JavaScript receives it
   * through React Native's Linking API (initial URL on cold start, "url" event otherwise).
   */
  private fun convertShareIntent(intent: Intent?) {
    if (intent == null || intent.action != Intent.ACTION_SEND) return
    if (intent.type?.startsWith("image/") == true) {
      val stream = streamUri(intent) ?: return
      intent.action = Intent.ACTION_VIEW
      intent.data = Uri.Builder()
          .scheme("myknowledgereminder")
          .authority("share")
          .appendQueryParameter("image", stream.toString())
          .build()
      setIntent(intent)
      return
    }
    if (intent.type?.startsWith("text/") != true) return
    val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()?.trim()
    if (text.isNullOrEmpty()) return
    val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)?.trim()

    val builder = Uri.Builder()
        .scheme("myknowledgereminder")
        .authority("share")
        .appendQueryParameter("text", text.take(MAX_SHARED_TEXT))
    if (!subject.isNullOrEmpty()) {
      builder.appendQueryParameter("subject", subject.take(MAX_SHARED_SUBJECT))
    }
    intent.action = Intent.ACTION_VIEW
    intent.data = builder.build()
    setIntent(intent)
  }

  @Suppress("DEPRECATION")
  private fun streamUri(intent: Intent): Uri? =
      if (android.os.Build.VERSION.SDK_INT >= 33) {
        intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
      } else {
        intent.getParcelableExtra(Intent.EXTRA_STREAM)
      }

  private companion object {
    const val MAX_SHARED_TEXT = 20000
    const val MAX_SHARED_SUBJECT = 300
  }
}
