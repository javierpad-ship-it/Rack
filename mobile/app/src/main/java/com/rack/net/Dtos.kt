package com.rack.net

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class AuthRequest(val email: String, val password: String)

@Serializable
data class AuthUser(val id: String)

@Serializable
data class AuthResponse(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String,
    val user: AuthUser,
)

@Serializable
data class ProfileDto(
    val role: String,
    @SerialName("store_id") val storeId: String? = null,
    @SerialName("full_name") val fullName: String? = null,
)

@Serializable
data class ProductDto(
    val sku: String,
    val ean: String? = null,
    val name: String,
    val family: String? = null,
)

@Serializable
data class FixtureDto(
    val id: String,
    @SerialName("store_id") val storeId: String,
    val barcode: String,
    val name: String,
    val active: Boolean = true,
)

@Serializable
data class ScanSessionDto(
    @SerialName("client_uid") val clientUid: String,
    @SerialName("store_id") val storeId: String,
    @SerialName("fixture_id") val fixtureId: String,
    val week: String,
    @SerialName("scanned_at") val scannedAt: String, // ISO-8601
)

@Serializable
data class ScanSessionInserted(val id: String, @SerialName("client_uid") val clientUid: String)

@Serializable
data class ScanLineDto(
    @SerialName("session_id") val sessionId: String,
    val sku: String,
    val quantity: Int,
)
