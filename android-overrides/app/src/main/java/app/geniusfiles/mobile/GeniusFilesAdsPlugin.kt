package app.geniusfiles.mobile

import android.content.pm.ApplicationInfo
import android.os.SystemClock
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.android.gms.ads.AdListener
import com.google.android.gms.ads.AdLoader
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.MobileAds
import com.google.android.gms.ads.nativead.MediaView
import com.google.android.gms.ads.nativead.NativeAd
import com.google.android.gms.ads.nativead.NativeAdOptions
import com.google.android.gms.ads.nativead.NativeAdView

/**
 * Annonces natives avancées (Google Mobile Ads) superposées à la WebView.
 *
 * La WebView réserve un emplacement (un simple bloc vide) et publie sa
 * position ; ce plugin place au-dessus une vraie `NativeAdView` Android où
 * le SDK rend lui-même les éléments de l'annonce — c'est l'exigence des
 * règles AdMob pour le format natif (aucun rendu HTML des assets).
 *
 * Confidentialité : aucune donnée de l'application n'est transmise au SDK.
 * Aucun ciblage personnalisé n'est fourni, aucun nom/chemin/contenu de
 * fichier, aucune donnée du coffre-fort ou de Genius AI ne quitte l'app.
 *
 * En build debug, l'identifiant de bloc de test Google est utilisé
 * automatiquement : jamais d'impression réelle pendant les tests.
 */
@CapacitorPlugin(name = "GeniusFilesAds")
class GeniusFilesAdsPlugin : Plugin() {
    private companion object {
        /** Bloc de test officiel Google (natif avancé, Android). */
        const val TEST_UNIT = "ca-app-pub-3940256099942544/2247696110"

        /** Une annonce chargée expire au bout d'une heure : on recharge avant. */
        const val MAX_AGE_MS = 50 * 60 * 1000L
    }

    private class Slot(val container: FrameLayout) {
        var ad: NativeAd? = null
        var loading = false
        var loadedAt = 0L
        var unitId = ""
    }

    private val slots = HashMap<String, Slot>()
    private var initialized = false

    private val debuggable: Boolean
        get() = (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0

    /** Conteneur racine : la WebView y est déjà attachée. */
    private fun root(): ViewGroup? = (bridge?.webView?.parent as? ViewGroup)

    private fun ensureInitialized() {
        if (initialized) return
        initialized = true
        // Initialisation hors du thread principal (recommandation Google) :
        // aucun impact sur la fluidité du démarrage de l'application.
        Thread { runCatching { MobileAds.initialize(context) {} } }.start()
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val res = JSObject()
        res.put("available", root() != null)
        call.resolve(res)
    }

    @PluginMethod
    fun initialize(call: PluginCall) {
        ensureInitialized()
        call.resolve()
    }

    /**
     * Place (et charge si nécessaire) l'annonce d'un emplacement.
     * Coordonnées en pixels CSS de la WebView, converties en pixels écran.
     */
    @PluginMethod
    fun show(call: PluginCall) {
        val id = call.getString("id").orEmpty()
        if (id.isEmpty()) {
            call.resolve()
            return
        }
        ensureInitialized()
        val unit = if (debuggable) TEST_UNIT else call.getString("adUnitId").orEmpty()
        val x = call.getDouble("x") ?: 0.0
        val y = call.getDouble("y") ?: 0.0
        val w = call.getDouble("width") ?: 0.0
        val h = call.getDouble("height") ?: 0.0
        if (unit.isEmpty() || w <= 0 || h <= 0) {
            call.resolve()
            return
        }
        activity.runOnUiThread {
            runCatching { place(id, unit, x, y, w, h) }
            call.resolve()
        }
    }

    private fun place(id: String, unit: String, x: Double, y: Double, w: Double, h: Double) {
        val parent = root() ?: return
        val density = context.resources.displayMetrics.density
        val webView = bridge?.webView
        val offsetX = webView?.left ?: 0
        val offsetY = webView?.top ?: 0

        val slot = slots.getOrPut(id) {
            val container = FrameLayout(context)
            container.visibility = View.INVISIBLE
            parent.addView(container)
            Slot(container)
        }
        val params = FrameLayout.LayoutParams((w * density).toInt(), (h * density).toInt())
        params.leftMargin = offsetX + (x * density).toInt()
        params.topMargin = offsetY + (y * density).toInt()
        slot.container.layoutParams = params
        slot.container.requestLayout()
        slot.container.visibility = if (slot.ad == null) View.INVISIBLE else View.VISIBLE

        val expired = slot.ad != null && SystemClock.elapsedRealtime() - slot.loadedAt > MAX_AGE_MS
        if (!slot.loading && (slot.ad == null || expired || slot.unitId != unit)) {
            slot.unitId = unit
            load(id, unit)
        }
    }

    private fun load(id: String, unit: String) {
        val slot = slots[id] ?: return
        slot.loading = true
        val loader = AdLoader.Builder(context, unit)
            .forNativeAd { ad ->
                val current = slots[id]
                if (current == null || activity.isDestroyed || activity.isFinishing) {
                    ad.destroy()
                    return@forNativeAd
                }
                current.ad?.destroy()
                current.ad = ad
                current.loadedAt = SystemClock.elapsedRealtime()
                current.loading = false
                activity.runOnUiThread { runCatching { render(current, ad) } }
            }
            .withAdListener(object : AdListener() {
                override fun onAdFailedToLoad(error: LoadAdError) {
                    // Aucune nouvelle tentative immédiate : l'emplacement
                    // reste simplement vide jusqu'au prochain affichage.
                    slots[id]?.loading = false
                }
            })
            .withNativeAdOptions(NativeAdOptions.Builder().build())
            .build()
        runCatching { loader.loadAd(AdRequest.Builder().build()) }
            .onFailure { slot.loading = false }
    }

    private fun render(slot: Slot, ad: NativeAd) {
        val view = LayoutInflater.from(context)
            .inflate(R.layout.gf_native_ad, slot.container, false) as NativeAdView

        val headline = view.findViewById<TextView>(R.id.gf_ad_headline)
        headline.text = ad.headline
        view.headlineView = headline

        val body = view.findViewById<TextView>(R.id.gf_ad_body)
        body.text = ad.body
        body.visibility = if (ad.body.isNullOrEmpty()) View.GONE else View.VISIBLE
        view.bodyView = body

        val advertiser = view.findViewById<TextView>(R.id.gf_ad_advertiser)
        advertiser.text = ad.advertiser ?: ad.store ?: ""
        view.advertiserView = advertiser

        val icon = view.findViewById<ImageView>(R.id.gf_ad_icon)
        val iconAsset = ad.icon
        if (iconAsset == null) {
            icon.visibility = View.GONE
        } else {
            icon.setImageDrawable(iconAsset.drawable)
            icon.visibility = View.VISIBLE
            view.iconView = icon
        }

        val media = view.findViewById<MediaView>(R.id.gf_ad_media)
        val mediaContent = ad.mediaContent
        if (mediaContent == null) {
            media.visibility = View.GONE
        } else {
            media.mediaContent = mediaContent
            media.visibility = View.VISIBLE
        }
        view.mediaView = media

        val cta = view.findViewById<Button>(R.id.gf_ad_cta)
        val ctaText = ad.callToAction
        if (ctaText.isNullOrEmpty()) {
            cta.visibility = View.GONE
        } else {
            cta.text = ctaText
            cta.visibility = View.VISIBLE
            view.callToActionView = cta
        }

        view.setNativeAd(ad)
        slot.container.removeAllViews()
        slot.container.addView(view)
        slot.container.visibility = View.VISIBLE
    }

    /** Masque un emplacement (écran quitté, emplacement hors du viewport). */
    @PluginMethod
    fun hide(call: PluginCall) {
        val id = call.getString("id").orEmpty()
        activity.runOnUiThread {
            slots[id]?.container?.visibility = View.INVISIBLE
            call.resolve()
        }
    }

    /** Détruit un emplacement et libère l'annonce associée. */
    @PluginMethod
    fun destroy(call: PluginCall) {
        val id = call.getString("id").orEmpty()
        activity.runOnUiThread {
            release(id)
            call.resolve()
        }
    }

    private fun release(id: String) {
        val slot = slots.remove(id) ?: return
        slot.ad?.destroy()
        slot.ad = null
        (slot.container.parent as? ViewGroup)?.removeView(slot.container)
    }

    override fun handleOnDestroy() {
        for (id in slots.keys.toList()) release(id)
        super.handleOnDestroy()
    }
}
