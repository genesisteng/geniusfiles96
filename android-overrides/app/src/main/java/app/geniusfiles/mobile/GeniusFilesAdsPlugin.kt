package app.geniusfiles.mobile

import android.view.Gravity
import android.view.ViewGroup
import android.widget.FrameLayout
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.android.libraries.ads.mobile.sdk.MobileAds
import com.google.android.libraries.ads.mobile.sdk.banner.AdSize
import com.google.android.libraries.ads.mobile.sdk.banner.AdView
import com.google.android.libraries.ads.mobile.sdk.banner.BannerAd
import com.google.android.libraries.ads.mobile.sdk.banner.BannerAdEventCallback
import com.google.android.libraries.ads.mobile.sdk.banner.BannerAdRequest
import com.google.android.libraries.ads.mobile.sdk.common.AdLoadCallback
import com.google.android.libraries.ads.mobile.sdk.common.LoadAdError
import com.google.android.libraries.ads.mobile.sdk.initialization.InitializationConfig

/**
 * GeniusFilesAds — pont natif Google Mobile Ads (GMA Next-Gen SDK).
 *
 * Le SDK est initialisé une seule fois, sur un thread d'arrière-plan
 * (exigence Google : une initialisation sur le thread principal peut
 * provoquer un ANR au démarrage).
 *
 * Exposé à la WebView :
 *   - initialize()  : initialisation explicite (idempotente).
 *   - showBanner()  : bannière adaptative ancrée en bas de l'écran.
 *   - hideBanner()  : retrait de la bannière + libération des ressources.
 *
 * Aucune donnée personnelle, aucun nom ni chemin de fichier n'est transmis
 * au SDK publicitaire.
 */
@CapacitorPlugin(name = "GeniusFilesAds")
class GeniusFilesAdsPlugin : Plugin() {

    companion object {
        /** Identifiant d'application AdMob de GeniusFiles. */
        const val APP_ID = "ca-app-pub-4007496300800778~9248149643"

        /** Bloc d'annonces de TEST Google (bannière Android). */
        const val TEST_BANNER_AD_UNIT_ID = "ca-app-pub-3940256099942544/9214589741"

        @Volatile
        private var initialized = false

        /**
         * Initialise le SDK sur un thread d'arrière-plan. Sans effet si
         * l'initialisation a déjà été demandée.
         */
        fun initializeOnce(context: android.content.Context) {
            if (initialized) return
            initialized = true
            Thread {
                try {
                    MobileAds.initialize(
                        context.applicationContext,
                        InitializationConfig.Builder(APP_ID).build(),
                    ) {
                        /* adaptateurs de médiation prêts */
                    }
                } catch (_: Throwable) {
                    initialized = false
                }
            }
                .start()
        }
    }

    private var container: FrameLayout? = null
    private var adView: AdView? = null

    @PluginMethod
    fun initialize(call: PluginCall) {
        initializeOnce(context)
        call.resolve(JSObject().put("initialized", true))
    }

    @PluginMethod
    fun showBanner(call: PluginCall) {
        val adUnitId = call.getString("adUnitId") ?: TEST_BANNER_AD_UNIT_ID
        val widthDp = call.getInt("widthDp") ?: 360
        val activity = activity ?: run {
            call.reject("Activity unavailable")
            return
        }
        initializeOnce(context)

        activity.runOnUiThread {
            try {
                removeBanner()

                val holder = FrameLayout(activity)
                val holderParams = FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                )
                holderParams.gravity = Gravity.BOTTOM
                activity.addContentView(holder, holderParams)

                val view = AdView(activity)
                holder.addView(
                    view,
                    FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                        Gravity.CENTER_HORIZONTAL or Gravity.BOTTOM,
                    ),
                )
                container = holder
                adView = view

                val adSize = AdSize.getLargeAnchoredAdaptiveBannerAdSize(activity, widthDp)
                val request = BannerAdRequest.Builder(adUnitId, adSize).build()
                view.loadAd(
                    request,
                    object : AdLoadCallback<BannerAd> {
                        override fun onAdLoaded(ad: BannerAd) {
                            ad.adEventCallback = object : BannerAdEventCallback {
                                override fun onAdImpression() = notifyListeners(
                                    "bannerImpression",
                                    JSObject(),
                                )

                                override fun onAdClicked() = notifyListeners(
                                    "bannerClicked",
                                    JSObject(),
                                )
                            }
                            notifyListeners("bannerLoaded", JSObject())
                        }

                        override fun onAdFailedToLoad(adError: LoadAdError) {
                            notifyListeners(
                                "bannerFailed",
                                JSObject().put("error", adError.toString()),
                            )
                        }
                    },
                )
                call.resolve(JSObject().put("shown", true))
            } catch (t: Throwable) {
                call.reject(t.message ?: "Banner unavailable")
            }
        }
    }

    @PluginMethod
    fun hideBanner(call: PluginCall) {
        val activity = activity
        if (activity == null) {
            call.resolve(JSObject().put("shown", false))
            return
        }
        activity.runOnUiThread {
            removeBanner()
            call.resolve(JSObject().put("shown", false))
        }
    }

    /** Retire la bannière de la hiérarchie de vues et libère ses ressources. */
    private fun removeBanner() {
        try {
            adView?.let { view ->
                (view.parent as? ViewGroup)?.removeView(view)
                view.destroy()
            }
            container?.let { holder -> (holder.parent as? ViewGroup)?.removeView(holder) }
        } catch (_: Throwable) {
            /* vue déjà détachée */
        }
        adView = null
        container = null
    }

    override fun handleOnDestroy() {
        removeBanner()
        super.handleOnDestroy()
    }
}
