package com.rack.net

import android.content.Context

/** Persiste el token de acceso y el contexto del usuario (perfil/tienda). */
class SessionStore(context: Context) {
    private val prefs = context.getSharedPreferences("rack_session", Context.MODE_PRIVATE)

    var accessToken: String?
        get() = prefs.getString("token", null)
        set(v) = prefs.edit().putString("token", v).apply()

    var userId: String?
        get() = prefs.getString("uid", null)
        set(v) = prefs.edit().putString("uid", v).apply()

    var storeId: String?
        get() = prefs.getString("store_id", null)
        set(v) = prefs.edit().putString("store_id", v).apply()

    var role: String?
        get() = prefs.getString("role", null)
        set(v) = prefs.edit().putString("role", v).apply()

    val isLoggedIn: Boolean get() = accessToken != null

    fun clear() = prefs.edit().clear().apply()
}
