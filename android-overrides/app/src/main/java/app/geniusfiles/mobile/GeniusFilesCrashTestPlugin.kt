package app.geniusfiles.mobile

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.firebase.crashlytics.FirebaseCrashlytics

/**
 * ⚠️ TEMPORAIRE — VALIDATION CRASHLYTICS UNIQUEMENT. À SUPPRIMER.
 *
 * Ce greffon n'existe que pour vérifier que Firebase Crashlytics remonte
 * bien des rapports réels depuis l'APK GeniusFiles. Il ne fait rien au
 * démarrage ni pendant l'usage normal : chaque méthode doit être appelée
 * explicitement depuis l'écran « Diagnostic Crashlytics » des Paramètres.
 *
 * Suppression complète (après validation) :
 *  1. supprimer ce fichier ;
 *  2. retirer `registerPlugin(GeniusFilesCrashTestPlugin::class.java)`
 *     dans MainActivity.kt ;
 *  3. supprimer `src/lib/native/crash-test.ts` et la carte
 *     « Diagnostic Crashlytics » dans `src/routes/parametres.tsx`.
 */
@CapacitorPlugin(name = "GeniusFilesCrashTest")
class GeniusFilesCrashTestPlugin : Plugin() {
    /** Erreur non fatale de test (aucune donnée personnelle). */
    @PluginMethod
    fun recordTestNonFatal(call: PluginCall) {
        try {
            val fc = FirebaseCrashlytics.getInstance()
            fc.log("crashlytics-selftest: non-fatal")
            fc.recordException(RuntimeException("GeniusFiles Crashlytics self-test (non-fatal)"))
        } catch (_: Throwable) {
            /* Crashlytics indisponible dans cette build */
        }
        call.resolve(JSObject().put("ok", true))
    }

    /**
     * Crash NATIF réel : exception non capturée sur le thread principal.
     * Le processus se termine — c'est le comportement attendu du test.
     * Le rapport est envoyé au redémarrage suivant de l'application.
     */
    @PluginMethod
    fun crashNow(call: PluginCall) {
        call.resolve()
        val activity = activity ?: throw RuntimeException("GeniusFiles Crashlytics self-test crash")
        activity.runOnUiThread {
            throw RuntimeException("GeniusFiles Crashlytics self-test crash")
        }
    }
}
