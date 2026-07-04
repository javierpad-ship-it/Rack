package com.rack.net

import com.rack.BuildConfig
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/**
 * Cliente REST mínimo para Supabase (Auth + PostgREST) usando OkHttp.
 * Las credenciales del proyecto llegan por BuildConfig (ver app/build.gradle.kts).
 */
class SupabaseClient(
    private val baseUrl: String = BuildConfig.SUPABASE_URL,
    private val anonKey: String = BuildConfig.SUPABASE_ANON_KEY,
) {
    private val json = Json { ignoreUnknownKeys = true }
    private val http = OkHttpClient.Builder()
        .callTimeout(30, TimeUnit.SECONDS)
        .build()
    private val jsonMedia = "application/json".toMediaType()

    // ---- Auth ----
    fun signIn(email: String, password: String): AuthResponse {
        val body = json.encodeToString(AuthRequest.serializer(), AuthRequest(email, password))
            .toRequestBody(jsonMedia)
        val req = Request.Builder()
            .url("$baseUrl/auth/v1/token?grant_type=password")
            .header("apikey", anonKey)
            .post(body)
            .build()
        http.newCall(req).execute().use { resp ->
            val text = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) error("Login falló (${resp.code}): $text")
            return json.decodeFromString(AuthResponse.serializer(), text)
        }
    }

    // ---- Auth: renovar el access token con el refresh token ----
    fun refreshSession(refreshToken: String): AuthResponse {
        val body = """{"refresh_token":"$refreshToken"}""".toRequestBody(jsonMedia)
        val req = Request.Builder()
            .url("$baseUrl/auth/v1/token?grant_type=refresh_token")
            .header("apikey", anonKey)
            .post(body)
            .build()
        http.newCall(req).execute().use { resp ->
            val text = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) error("Refresh falló (${resp.code}): $text")
            return json.decodeFromString(AuthResponse.serializer(), text)
        }
    }

    // ---- PostgREST helpers ----
    private fun get(token: String, pathAndQuery: String, range: IntRange? = null): String {
        val builder = Request.Builder()
            .url("$baseUrl/rest/v1/$pathAndQuery")
            .header("apikey", anonKey)
            .header("Authorization", "Bearer $token")
            .get()
        if (range != null) builder.header("Range", "${range.first}-${range.last}")
        val req = builder.build()
        http.newCall(req).execute().use { resp ->
            val text = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) error("GET $pathAndQuery falló (${resp.code}): $text")
            return text
        }
    }

    private fun post(token: String, path: String, jsonBody: String, prefer: String): String {
        val req = Request.Builder()
            .url("$baseUrl/rest/v1/$path")
            .header("apikey", anonKey)
            .header("Authorization", "Bearer $token")
            .header("Content-Type", "application/json")
            .header("Prefer", prefer)
            .post(jsonBody.toRequestBody(jsonMedia))
            .build()
        http.newCall(req).execute().use { resp ->
            val text = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) error("POST $path falló (${resp.code}): $text")
            return text
        }
    }

    fun fetchProfile(token: String, userId: String): ProfileDto? {
        val text = get(token, "profiles?id=eq.$userId&select=role,store_id,full_name")
        return json.decodeFromString(ProfileDto.serializer().list(), text).firstOrNull()
    }

    /**
     * Baja el catálogo completo paginando (PostgREST corta en ~1000 filas por
     * defecto; sin esto el catálogo local quedaba truncado y los SKUs salían
     * como "(desconocido)" al escanear).
     */
    fun fetchProducts(token: String): List<ProductDto> {
        val pageSize = 1000
        val all = mutableListOf<ProductDto>()
        var from = 0
        while (true) {
            val text = get(
                token,
                "products?select=sku,ean,name,family&order=sku",
                from until (from + pageSize),
            )
            val page = json.decodeFromString(ProductDto.serializer().list(), text)
            all += page
            if (page.size < pageSize) break
            from += pageSize
        }
        return all
    }

    fun fetchFixtures(token: String, storeId: String): List<FixtureDto> {
        val text = get(token, "fixtures?store_id=eq.$storeId&select=id,store_id,barcode,name,active")
        return json.decodeFromString(FixtureDto.serializer().list(), text)
    }

    /** Inserta (upsert por client_uid) una sesión y devuelve su id de servidor. */
    fun upsertSession(token: String, session: ScanSessionDto): String {
        val bodyJson = "[" + json.encodeToString(ScanSessionDto.serializer(), session) + "]"
        val text = post(
            token,
            "scan_sessions?on_conflict=client_uid&select=id,client_uid",
            bodyJson,
            "resolution=merge-duplicates,return=representation",
        )
        return json.decodeFromString(ScanSessionInserted.serializer().list(), text)
            .first().id
    }

    fun upsertLines(token: String, lines: List<ScanLineDto>) {
        if (lines.isEmpty()) return
        val bodyJson = json.encodeToString(ScanLineDto.serializer().list(), lines)
        post(
            token,
            "scan_lines?on_conflict=session_id,sku",
            bodyJson,
            "resolution=merge-duplicates,return=minimal",
        )
    }
}

// Helper de serializador de listas.
private fun <T> kotlinx.serialization.KSerializer<T>.list() =
    kotlinx.serialization.builtins.ListSerializer(this)
