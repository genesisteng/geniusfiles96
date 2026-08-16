package app.geniusfiles.mobile

import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.android.libraries.ads.mobile.sdk.banner.AdSize
import com.google.android.libraries.ads.mobile.sdk.banner.AdView
import com.google.android.libraries.ads.mobile.sdk.banner.BannerAd
import com.google.android.libraries.ads.mobile.sdk.banner.BannerAdEventCallback
import com.google.android.libraries.ads.mobile.sdk.banner.BannerAdRequest
import com.google.android.libraries.ads.mobile.sdk.common.AdLoadCallback
import com.google.android.libraries.ads.mobile.sdk.common.LoadAdError

/**
 * Bannière AdMob (GMA Next-Gen) ancrée à un emplacement DÉCIDÉ PAR LA PAGE.
 *
 * L'`AdView` est ajoutée DIRECTEMENT au conteneur de l'activité, à la taille
 * exacte du bloc réservé par la page : aucune vue plein écran n'est posée
 * au-dessus de la WebView (une telle superposition rendait l'interface
 * invisible pendant le défilement). Quand la page défile, JS renvoie la
 * nouvelle position ; quand le bloc sort de l'écran, la vue est masquée.
 *
 * Aucune donnée personnelle n'est transmise au SDK par ce pont.
 */
@CapacitorPlugin(name = "GeniusFilesAds")
class GeniusFilesAdsPlugin : Plugin() {
    private var adView: AdView? = null
    private var loadedUnitId: String? = null
    private var lastWidthDp: Int = 0
    private var adLoaded: Boolean = false

    /** Hauteur (dp) réservée par la bannière adaptative pour cette largeur. */
    private fun adSizeFor(widthDp: Int): AdSize =
        AdSize.getLargeAnchoredAdaptiveBannerAdSize(activity, widthDp.coerceIn(200, 1200))

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        call.resolve(JSObject().put("available", true))
    }

    /**
     * Affiche (ou repositionne) la bannière.
     *
     * @param x,y,width  rectangle CSS px du bloc réservé dans la page.
     * @param unitId     bloc d'annonces ; par défaut le bloc de TEST Google.
     */
    @PluginMethod
    fun showBanner(call: PluginCall) {
        val density = context.resources.displayMetrics.density
        val xDp = (call.getDouble("x") ?: 0.0).toInt()
        val yDp = (call.getDouble("y") ?: 0.0).toInt()
        val widthDp = (call.getDouble("width") ?: 0.0).toInt().let { if (it <= 0) 360 else it }
        val unitId = call.getString("unitId") ?: TEST_BANNER_UNIT_ID
        val heightDp = try {
            adSizeFor(widthDp).height
        } catch (_: Throwable) {
            50
        }

        activity.runOnUiThread {
            try {
                val root = activity.findViewById<ViewGroup>(android.R.id.content)

                val needsReload = adView == null || loadedUnitId != unitId || lastWidthDp != widthDp
                if (needsReload) {
                    releaseAdView()
                    adLoaded = false
                    val view = AdView(activity)
                    root.addView(view)
                    adView = view
                    loadedUnitId = unitId
                    lastWidthDp = widthDp
                    loadInto(view, unitId, widthDp)
                }

                adView?.let { view ->
                    view.layoutParams = FrameLayout.LayoutParams(
                        (widthDp * density).toInt(),
                        (heightDp * density).toInt(),
                        Gravity.TOP or Gravity.START,
                    ).also { lp ->
                        lp.leftMargin = (xDp * density).toInt()
                        lp.topMargin = (yDp * density).toInt()
                    }
                    // Tant qu'aucune annonce n'est chargée, la vue reste
                    // invisible : aucun cadre vide, aucune interception de
                    // clic, aucun recouvrement du contenu.
                    view.visibility = if (adLoaded) View.VISIBLE else View.INVISIBLE
                    view.requestLayout()
                }
                call.resolve(JSObject().put("height", heightDp).put("shown", true))
            } catch (t: Throwable) {
                call.resolve(
                    JSObject().put("height", heightDp).put("shown", false)
                        .put("error", t.message ?: "banner error"),
                )
            }
        }
    }

    private fun adSizeHeight(widthDp: Int): Int = try {
        adSizeFor(widthDp).height
    } catch (_: Throwable) {
        50
    }

    /** Informe la page du résultat du chargement (hauteur réelle à réserver). */
    private fun notifyStatus(loaded: Boolean, heightDp: Int) {
        try {
            notifyListeners(
                "bannerStatus",
                JSObject().put("loaded", loaded).put("height", heightDp),
            )
        } catch (_: Throwable) {
            /* pont fermé */
        }
    }

    private fun loadInto(view: AdView, unitId: String, widthDp: Int) {
        val request = BannerAdRequest.Builder(unitId, adSizeFor(widthDp)).build()
        view.loadAd(
            request,
            object : AdLoadCallback<BannerAd> {
                override fun onAdLoaded(ad: BannerAd) {
                    ad.adEventCallback = object : BannerAdEventCallback {}
                    adLoaded = true
                    activity.runOnUiThread { view.visibility = View.VISIBLE }
                    notifyStatus(true, adSizeHeight(widthDp))
                }

                override fun onAdFailedToLoad(adError: LoadAdError) {
                    // Réseau absent ou remplissage vide : l'application
                    // continue normalement et aucun espace n'est réservé.
                    adLoaded = false
                    activity.runOnUiThread { view.visibility = View.INVISIBLE }
                    notifyStatus(false, 0)
                }
            },
        )
    }

    @PluginMethod
    fun hideBanner(call: PluginCall) {
        activity.runOnUiThread {
            adView?.visibility = View.GONE
            call.resolve()
        }
    }

    @PluginMethod
    fun removeBanner(call: PluginCall) {
        activity.runOnUiThread {
            releaseAdView()
            call.resolve()
        }
    }

    /** Retire la bannière de la hiérarchie et libère ses ressources. */
    private fun releaseAdView() {
        val view = adView ?: return
        (view.parent as? ViewGroup)?.removeView(view)
        try {
            view.destroy()
        } catch (_: Throwable) {
            /* déjà libérée */
        }
        adView = null
        loadedUnitId = null
        lastWidthDp = 0
        adLoaded = false
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        releaseAdView()
    }

    companion object {
        /** Bloc de TEST officiel Google — jamais de trafic réel en debug. */
        const val TEST_BANNER_UNIT_ID = "ca-app-pub-3940256099942544/9214589741"
    }
}
