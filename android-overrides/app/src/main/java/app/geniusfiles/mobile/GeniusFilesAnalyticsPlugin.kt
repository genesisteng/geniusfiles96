package app.geniusfiles.mobile

import android.os.Bundle
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.firebase.analytics.FirebaseAnalytics

/**
 * Pont minimal entre la WebView et Google Analytics for Firebase.
 *
 * Portée volontairement réduite (base stable pour la suite) :
 *  - `screen_view` : nom d'écran LOGIQUE issu d'une liste blanche ;
 *  - `setUserProperty` : propriétés techniques courtes (langue, version) ;
 *  - sessions, versions d'app, appareil, OS, pays, langue : collectés
 *    automatiquement par le SDK Analytics, aucun code requis.
 *
 * Confidentialité — ne transitent JAMAIS par ce pont : contenu ou nom ou
 * chemin de fichier, données du coffre-fort, PIN / mot de passe, messages
 * Genius AI, contenu de document. `setUserId` n'est volontairement pas
 * exposé : aucun identifiant utilisateur n'est envoyé.
 *
 * Coût : quelques écritures en file d'attente asynchrone du SDK, aucune I/O
 * bloquante côté WebView.
 */
@CapacitorPlugin(name = "GeniusFilesAnalytics")
class GeniusFilesAnalyticsPlugin : Plugin() {
    private val analytics: FirebaseAnalytics?
        get() = try {
            FirebaseAnalytics.getInstance(context)
        } catch (_: Throwable) {
            null
        }

    /** Jetons techniques uniquement : lettres, chiffres, `_`, `-`, `.`. */
    private fun token(raw: String?, max: Int): String {
        val value = raw ?: return ""
        val cleaned = value.filter { it.isLetterOrDigit() || it == '_' || it == '-' || it == '.' }
        return if (cleaned.length > max) cleaned.take(max) else cleaned
    }

    /** Vue d'écran : seul le nom logique de l'écran est transmis. */
    @PluginMethod
    fun logScreenView(call: PluginCall) {
        val screen = token(call.getString("screen"), 40)
        val fa = analytics
        if (fa == null || screen.isEmpty()) {
            call.resolve()
            return
        }
        val params = Bundle()
        params.putString(FirebaseAnalytics.Param.SCREEN_NAME, screen)
        params.putString(FirebaseAnalytics.Param.SCREEN_CLASS, "GeniusFiles")
        fa.logEvent(FirebaseAnalytics.Event.SCREEN_VIEW, params)
        call.resolve()
    }

    /** Clés de paramètres autorisées : aucune autre n'est transmise. */
    private val allowedKeys = setOf("action", "tool", "kind", "result")

    /** Événements autorisés : toute autre valeur est ignorée. */
    private val allowedEvents = setOf(
        "app_open",
        "feature_open",
        "search_run",
        "file_open",
        "file_action",
        "trash_action",
        "vault_action",
        "pdf_tool",
        "media_edit",
        "ai_usage",
        "automation",
    )

    /**
     * Événement de fonctionnalité : nom en liste blanche, paramètres
     * courts en liste blanche, plus un compteur numérique déjà arrondi
     * en paliers côté WebView. Aucun texte libre n'est accepté.
     */
    @PluginMethod
    fun logEvent(call: PluginCall) {
        val name = token(call.getString("name"), 32)
        val fa = analytics
        if (fa == null || name.isEmpty() || name !in allowedEvents) {
            call.resolve()
            return
        }
        val bundle = Bundle()
        val params = call.getObject("params")
        if (params != null) {
            for (key in allowedKeys) {
                val value = token(params.optString(key, ""), 32)
                if (value.isNotEmpty()) bundle.putString(key, value)
            }
        }
        val count = call.getInt("count")
        if (count != null && count > 0) bundle.putLong("item_count", count.toLong())
        fa.logEvent(name, bundle)
        call.resolve()
    }

    /** Propriété utilisateur technique (langue d'interface, version…). */
    @PluginMethod
    fun setUserProperty(call: PluginCall) {
        val name = token(call.getString("name"), 24)
        val value = token(call.getString("value"), 36)
        val fa = analytics
        if (fa == null || name.isEmpty()) {
            call.resolve()
            return
        }
        fa.setUserProperty(name, value.ifEmpty { null })
        call.resolve()
    }

    /** Permet à l'utilisateur (ou au build) de couper toute collecte. */
    @PluginMethod
    fun setEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled", true) ?: true
        analytics?.setAnalyticsCollectionEnabled(enabled)
        call.resolve()
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val result = JSObject()
        result.put("available", analytics != null)
        call.resolve(result)
    }
}
