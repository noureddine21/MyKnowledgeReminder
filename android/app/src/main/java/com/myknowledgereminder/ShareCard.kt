package com.myknowledgereminder

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.text.TextUtils
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream

/**
 * "Share as image": draws an information item as an emerald & gold card (PNG)
 * and opens the Android share sheet (WhatsApp, Instagram...).
 */
object ShareCard {
  private const val WIDTH = 1080
  private const val PADDING = 96
  private const val EMERALD = 0xFF0B4A3A.toInt()
  private const val EMERALD_DARK = 0xFF083A2D.toInt()
  private const val GOLD = 0xFFE7C873.toInt()

  data class Card(val title: String, val content: String, val source: String?, val footer: String)

  private fun font(context: Context, name: String, fallback: Int): Typeface =
      try {
        Typeface.createFromAsset(context.assets, "fonts/$name.ttf")
      } catch (_: Exception) {
        Typeface.create(Typeface.SERIF, fallback)
      }

  private fun isArabic(text: String): Boolean {
    var arabic = 0
    var letters = 0
    for (ch in text) {
      if (Character.isLetter(ch)) {
        letters++
        if (ch.code in 0x0600..0x06FF || ch.code in 0x0750..0x077F || ch.code in 0xFB50..0xFEFF) arabic++
      }
    }
    return letters > 0 && arabic * 2 >= letters
  }

  private fun layout(text: String, paint: TextPaint, width: Int, maxLines: Int, align: Layout.Alignment): StaticLayout =
      StaticLayout.Builder.obtain(text, 0, text.length, paint, width)
          .setAlignment(align)
          .setLineSpacing(0f, 1.25f)
          .setMaxLines(maxLines)
          .setEllipsize(TextUtils.TruncateAt.END)
          .build()

  fun render(context: Context, card: Card): Bitmap {
    val inner = WIDTH - PADDING * 2
    val titlePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
      color = GOLD
      textSize = 58f
      typeface = if (isArabic(card.title)) font(context, "Amiri-Bold", Typeface.BOLD) else font(context, "PlusJakartaSans-Bold", Typeface.BOLD)
    }
    val arabicContent = isArabic(card.content)
    val contentPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.WHITE
      textSize = if (arabicContent) 52f else 42f
      typeface = if (arabicContent) font(context, "Amiri-Regular", Typeface.NORMAL) else font(context, "PlusJakartaSans-Regular", Typeface.NORMAL)
    }
    val smallPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
      color = GOLD
      textSize = 32f
      typeface = font(context, "PlusJakartaSans-Medium", Typeface.NORMAL)
    }
    val footerPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.argb(170, 255, 255, 255)
      textSize = 28f
      typeface = font(context, "PlusJakartaSans-SemiBold", Typeface.NORMAL)
      letterSpacing = 0.12f
    }
    val center = Layout.Alignment.ALIGN_CENTER
    val title = layout(card.title, titlePaint, inner, 4, center)
    val content = layout(card.content, contentPaint, inner, 22, center)
    val source = card.source?.takeIf { it.isNotBlank() }?.let { layout("— $it", smallPaint, inner, 2, center) }
    val footer = layout(card.footer.uppercase(), footerPaint, inner, 1, center)

    val gap = 56
    val bodyHeight = title.height + gap + 4 + gap + content.height + (source?.let { gap / 2 + it.height } ?: 0)
    val height = maxOf(WIDTH, PADDING * 2 + 120 + bodyHeight + gap + footer.height)

    val bitmap = Bitmap.createBitmap(WIDTH, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    canvas.drawColor(EMERALD)
    // Ornaments: soft circle + 8-point star outline, gold frame.
    val ornament = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeWidth = 3f
      color = Color.argb(46, 231, 200, 115)
    }
    canvas.drawCircle(WIDTH - 120f, 140f, 260f, ornament)
    canvas.save()
    canvas.rotate(45f, WIDTH - 120f, 140f)
    canvas.drawRect(WIDTH - 280f, -20f, WIDTH + 40f, 300f, ornament)
    canvas.restore()
    canvas.drawRect(WIDTH - 280f, -20f, WIDTH + 40f, 300f, ornament)
    val band = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = EMERALD_DARK }
    canvas.drawRect(0f, height - 150f, WIDTH.toFloat(), height.toFloat(), band)
    val frame = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeWidth = 4f
      color = GOLD
    }
    canvas.drawRoundRect(RectF(36f, 36f, WIDTH - 36f, height - 36f), 36f, 36f, frame)

    var y = ((height - 150 - bodyHeight) / 2f).coerceAtLeast(PADDING + 40f)
    canvas.save()
    canvas.translate(PADDING.toFloat(), y)
    title.draw(canvas)
    canvas.restore()
    y += title.height + gap
    val line = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = GOLD }
    canvas.drawRect(WIDTH / 2f - 60f, y, WIDTH / 2f + 60f, y + 4f, line)
    y += 4 + gap
    canvas.save()
    canvas.translate(PADDING.toFloat(), y)
    content.draw(canvas)
    canvas.restore()
    y += content.height
    if (source != null) {
      y += gap / 2
      canvas.save()
      canvas.translate(PADDING.toFloat(), y)
      source.draw(canvas)
      canvas.restore()
    }
    canvas.save()
    canvas.translate(PADDING.toFloat(), height - 75f - footer.height / 2f)
    footer.draw(canvas)
    canvas.restore()
    return bitmap
  }

  /** Renders the card, saves it in the cache and opens the share sheet. */
  fun share(context: Context, card: Card, chooserTitle: String) {
    val bitmap = render(context, card)
    val dir = File(context.cacheDir, "share").apply { mkdirs() }
    dir.listFiles()?.forEach { it.delete() }
    val file = File(dir, "knowledge_${System.currentTimeMillis()}.png")
    FileOutputStream(file).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    bitmap.recycle()
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    val send = Intent(Intent.ACTION_SEND)
        .setType("image/png")
        .putExtra(Intent.EXTRA_STREAM, uri)
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    send.clipData = ClipData.newRawUri(null, uri)
    val chooser = Intent.createChooser(send, chooserTitle)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
    context.startActivity(chooser)
  }
}
