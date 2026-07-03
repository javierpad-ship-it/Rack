plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("com.google.devtools.ksp")
}

android {
    namespace = "com.rack"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.geeksapp.rackone"
        minSdk = 24          // cubre equipos Honeywell con Android 7+
        targetSdk = 35       // requisito de Google Play (API 35+)
        // Google Play "quema" cada versionCode al subirlo (no se puede reusar).
        // En CI se pasa VERSION_CODE = número de corrida (siempre incremental);
        // localmente cae al default.
        versionCode = (project.findProperty("VERSION_CODE") as String?)?.toIntOrNull() ?: 3
        versionName = "0.1.1"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Configurar en local.properties / CI; se leen vía BuildConfig.
        buildConfigField("String", "SUPABASE_URL", "\"${project.findProperty("SUPABASE_URL") ?: ""}\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"${project.findProperty("SUPABASE_ANON_KEY") ?: ""}\"")
    }

    // Dos apps desde el mismo código: "Inventario" (conteo completo, audit)
    // y "Repo" (reposición incremental, restock). Ver com.rack.AppMode.
    flavorDimensions += "app"
    productFlavors {
        create("inventario") {
            dimension = "app"
            applicationId = "com.geeksapp.rackone"
            resValue("string", "app_name", "Rack One - Inventario")
            buildConfigField("String", "APP_KIND", "\"audit\"")
        }
        create("repo") {
            dimension = "app"
            applicationId = "com.geeksapp.rackone.repo"
            resValue("string", "app_name", "Rack One - Repo")
            buildConfigField("String", "APP_KIND", "\"restock\"")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
        resValues = true
    }
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.14"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    // Firma de release: lee ruta/contraseñas desde propiedades de Gradle
    // (pasadas por CI vía -P o local.properties; nunca hardcodeadas).
    val storeFilePath = project.findProperty("RACK_UPLOAD_STORE_FILE") as String?
    signingConfigs {
        if (!storeFilePath.isNullOrBlank()) {
            create("release") {
                storeFile = file(storeFilePath)
                storePassword = project.findProperty("RACK_UPLOAD_STORE_PASSWORD") as String?
                keyAlias = project.findProperty("RACK_UPLOAD_KEY_ALIAS") as String?
                keyPassword = project.findProperty("RACK_UPLOAD_KEY_PASSWORD") as String?
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (!storeFilePath.isNullOrBlank()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.06.00")
    implementation(composeBom)
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-compose:1.9.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.2")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.navigation:navigation-compose:2.7.7")

    // Room (persistencia offline)
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    ksp("androidx.room:room-compiler:2.6.1")

    // WorkManager (sync en background)
    implementation("androidx.work:work-runtime-ktx:2.9.0")

    // Red (REST a Supabase)
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.8.1")
}
