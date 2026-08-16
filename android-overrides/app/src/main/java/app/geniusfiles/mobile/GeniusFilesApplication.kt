package app.geniusfiles.mobile

import android.app.Application
import android.os.Build
import androidx.appcompat.app.AppCompatDelegate
import com.google.android.libraries.ads.mobile.sdk.MobileAds
import com.google.firebase.crashlytics.FirebaseCrashlytics

/**
 * Applique le mode sauvegardé avant la création de MainActivity.
 * Le thème de la fenêtre de lancement et le splash Android disposent ainsi
 * de la bonne configuration dès la toute première frame du cold start.
 *
 * Initialise également les clés de diagnostic Crashlytics : uniquement des
 * informations techniques (version publiée, niveau d'API, appareil, ABI).
 * Aucun identifiant utilisateur, aucun chemin, aucun nom de fichier.
 */
class GeniusFilesApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        val mode = getSharedPreferences(MainActivity.THEME_PREFS, MODE_PRIVATE)
            .getString(MainActivity.THEME_MODE, "system") ?: "system"
        AppCompatDelegate.setDefaultNightMode(
            when (mode) {
                "light" -> AppCompatDelegate.MODE_NIGHT_NO
                "dark" -> AppCompatDelegate.MODE_NIGHT_YES
                else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
            }
        )
        initCrashlyticsKeys()
        initMobileAds()
    }

    /**
     * SDK Google Mobile Ads (Next-Gen). L'initialisation est faite hors du
     * thread principal : elle effectue des I/O disque et réseau et
     * provoquerait sinon un ANR au démarrage.
     */
    private fun initMobileAds() {
        Thread {
            try {
                MobileAds.initialize(this)
            } catch (_: Throwable) {
                /* Publicité indisponible — l'application reste utilisable */
            }
        }.apply { name = "gf-ads-init" }.start()
    }

    /**
     * Coût négligeable (quelques écritures clé/valeur en mémoire) et exécuté
     * une seule fois : aucun impact mesurable sur le démarrage.
     */
    private fun initCrashlyticsKeys() {
        try {
            val info = packageManager.getPackageInfo(packageName, 0)
            @Suppress("DEPRECATION")
            val versionCode = info.longVersionCode.toString()
            FirebaseCrashlytics.getInstance().apply {
                setCustomKey("app_version_name", info.versionName ?: "unknown")
                setCustomKey("app_version_code", versionCode)
                setCustomKey("android_sdk", Build.VERSION.SDK_INT)
                setCustomKey("device_model", "${Build.MANUFACTURER} ${Build.MODEL}")
                setCustomKey("abi", Build.SUPPORTED_ABIS.firstOrNull() ?: "unknown")
            }
        } catch (_: Throwable) {
            /* Crashlytics indisponible dans cette variante — sans effet */
        }
    }
}
