package app.geniusfiles.mobile

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.firebase.crashlytics.FirebaseCrashlytics

/**
 * Pont minimal entre la WebView et Firebase Crashlytics.
 *
 * Confidentialité : ce pont ne transmet QUE des chaînes déjà assainies
 * côté JavaScript (`src/lib/native/crashlytics.ts`). Par sécurité, une
 * seconde passe de troncature/filtrage est appliquée ici :
 *  - aucun chemin de fichier (tout segment `/…` est retiré) ;
 *  - aucune valeur de plus de 256 caractères ;
 *  - aucun identifiant utilisateur n'est jamais défini
 *    (`setUserId` n'est volontairement pas exposé).
 *
 * Les appels sont non bloquants pour la WebView : Crashlytics met en file
 * d'attente en arrière-plan, aucune I/O fichier n'est effectuée ici.
 */
@CapacitorPlugin(name = "GeniusFilesCrashlytics")
class GeniusFilesCrashlyticsPlugin : Plugin() {
    private val crashlytics: FirebaseCrashlytics?
        get() = try {
            FirebaseCrashlytics.getInstance()
        } catch (_: Throwable) {
            null
        }

    /** Retire tout ce qui pourrait ressembler à un chemin ou un nom de fichier. */
    private fun sanitize(raw: String?): String {
        val value = raw ?: return ""
        val noPaths = value
            .replace(Regex("""(/[\w.\-]+){2,}"""), "[path]")
            .replace(Regex("""content://\S+"""), "[uri]")
            .replace(Regex("""file://\S+"""), "[uri]")
            .replace(Regex("""[\w.\-]+@[\w.\-]+"""), "[email]")
        return if (noPaths.length > 256) noPaths.take(256) else noPaths
    }

    @PluginMethod
    fun log(call: PluginCall) {
        val message = sanitize(call.getString("message"))
        if (message.isNotEmpty()) crashlytics?.log(message)
        call.resolve()
    }

    /** Erreur non fatale : type + message assainis + pile technique. */
    @PluginMethod
    fun recordError(call: PluginCall) {
        val name = sanitize(call.getString("name")).ifEmpty { "NonFatal" }
        val message = sanitize(call.getString("message"))
        val stack = sanitize(call.getString("stack"))
        val fc = crashlytics
        if (fc == null) {
            call.resolve()
            return
        }
        if (stack.isNotEmpty()) fc.log(stack)
        fc.recordException(RuntimeException("$name: $message"))
        call.resolve()
    }

    /** Clés de diagnostic techniques uniquement (route, version, plateforme…). */
    @PluginMethod
    fun setKeys(call: PluginCall) {
        val keys: JSObject = call.getObject("keys") ?: JSObject()
        val fc = crashlytics
        if (fc == null) {
            call.resolve()
            return
        }
        val it = keys.keys()
        while (it.hasNext()) {
            val key = it.next()
            val value = sanitize(keys.optString(key))
            if (key.isNotEmpty() && value.isNotEmpty()) fc.setCustomKey(key, value)
        }
        call.resolve()
    }

    /** Vrai si la collecte Crashlytics est active dans cette build. */
    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val result = JSObject()
        result.put("available", crashlytics != null)
        call.resolve(result)
    }
}
