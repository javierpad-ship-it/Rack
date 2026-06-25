pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // Repos del SDK de Honeywell (DataCollection) cuando se integre el .aar oficial.
        flatDir { dirs("app/libs") }
    }
}

rootProject.name = "Rack"
include(":app")
