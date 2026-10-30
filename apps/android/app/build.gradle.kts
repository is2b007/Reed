plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val defaultAgentRelayUrl = providers.environmentVariable("REED_AGENT_RELAY_URL")
    .orElse(providers.gradleProperty("reedAgentRelayUrl"))
    .orElse("")
    .get()
    .trim()
    .trimEnd('/')
require(defaultAgentRelayUrl.isEmpty() || defaultAgentRelayUrl.startsWith("https://")) {
    "reedAgentRelayUrl must be an HTTPS origin"
}
val escapedDefaultAgentRelayUrl = defaultAgentRelayUrl
    .replace("\\", "\\\\")
    .replace("\"", "\\\"")

val releaseKeystorePath = providers.environmentVariable("REED_ANDROID_KEYSTORE_PATH")
    .orElse(providers.gradleProperty("reedAndroidKeystorePath"))
    .orNull?.trim().orEmpty()
val releaseKeystorePassword = providers.environmentVariable("REED_ANDROID_KEYSTORE_PASSWORD")
    .orElse(providers.gradleProperty("reedAndroidKeystorePassword"))
    .orNull.orEmpty()
val releaseKeyAlias = providers.environmentVariable("REED_ANDROID_KEY_ALIAS")
    .orElse(providers.gradleProperty("reedAndroidKeyAlias"))
    .orElse("reed-release")
    .get()
    .trim()
val releaseKeyPassword = providers.environmentVariable("REED_ANDROID_KEY_PASSWORD")
    .orElse(providers.gradleProperty("reedAndroidKeyPassword"))
    .orNull.orEmpty()
val hasReleaseSigning = listOf(
    releaseKeystorePath,
    releaseKeystorePassword,
    releaseKeyAlias,
    releaseKeyPassword,
).all(String::isNotBlank)

android {
    namespace = "com.reed.editor"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.reed.editor"
        minSdk = 33
        targetSdk = 36
        versionCode = 11
        versionName = "0.2.1"
        buildConfigField("String", "DEFAULT_AGENT_RELAY_URL", "\"$escapedDefaultAgentRelayUrl\"")
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables.useSupportLibrary = true
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions { jvmTarget = "17" }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(releaseKeystorePath)
                storePassword = releaseKeystorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
                enableV1Signing = true
                enableV2Signing = true
                enableV3Signing = true
                enableV4Signing = true
            }
        }
    }

    buildTypes {
        getByName("debug") {
            // Installs beside the release app on a test device instead of replacing it.
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        getByName("release") {
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    packaging.resources.excludes += setOf(
        "META-INF/AL2.0",
        "META-INF/LGPL2.1",
        "META-INF/LICENSE*",
        "META-INF/NOTICE*",
        "META-INF/DEPENDENCIES"
    )
}

gradle.taskGraph.whenReady {
    val releaseArtifactRequested = allTasks.any { task ->
        task.name.matches(Regex("(?i)(assemble|bundle).*release"))
    }
    if (releaseArtifactRequested && !hasReleaseSigning) {
        throw GradleException(
            "Android release builds require REED_ANDROID_KEYSTORE_PATH, " +
                "REED_ANDROID_KEYSTORE_PASSWORD, REED_ANDROID_KEY_ALIAS, and " +
                "REED_ANDROID_KEY_PASSWORD. Reed will not publish an unsigned release.",
        )
    }
}

dependencies {
    implementation(project(":core"))
    implementation(project(":git"))
    implementation(project(":remote"))
    implementation(platform("androidx.compose:compose-bom:2026.06.01"))
    implementation("androidx.activity:activity-compose:1.13.0")
    // 1.19 follows the API 37 line; 1.18 is the current API 36-compatible release.
    implementation("androidx.core:core-ktx:1.18.0")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    // 2.11 requires compileSdk 37 / AGP 9.1; 2.10 is the current API 36 line.
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.10.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.10.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")

    debugImplementation("androidx.compose.ui:ui-tooling")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.14.1")
    testImplementation("androidx.test:core:1.7.0")
    androidTestImplementation(platform("androidx.compose:compose-bom:2026.06.01"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.7.0")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}

// Gradle's connected-test lifecycle can replace the debug package and clear its app data.
// A real DC-1 may contain the only local copy of an offline project, so require an explicit
// opt-in before any connected Android test task begins executing.
val allowDeviceDataReset = providers.gradleProperty("allowDeviceDataReset")
    .map { value -> value.equals("true", ignoreCase = true) }
    .orElse(false)

gradle.taskGraph.whenReady {
    val runsConnectedAndroidTests = allTasks.any { task ->
        task.project == project && task.name.startsWith("connected") && task.name.endsWith("AndroidTest")
    }
    if (runsConnectedAndroidTests && !allowDeviceDataReset.get()) {
        throw GradleException(
            "Connected Android tests can replace Reed and clear local projects/credentials. " +
                "Use a disposable device or profile, then rerun with -PallowDeviceDataReset=true."
        )
    }
}
