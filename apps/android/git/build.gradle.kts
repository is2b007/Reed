plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.reed.git"
    compileSdk = 36

    defaultConfig { minSdk = 33 }

    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions { jvmTarget = "17" }

    lint {
        // JGit contains an opt-in no-check trust manager for its own compatibility APIs.
        // Reed never selects it; all HTTPS actions use the Android platform trust store.
        disable += "TrustAllX509TrustManager"
    }
}

dependencies {
    api(project(":core"))
    implementation("org.eclipse.jgit:org.eclipse.jgit:7.2.0.202503040940-r")
    implementation("org.slf4j:slf4j-nop:2.0.17")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2")
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.14.1")
    testImplementation("androidx.test:core:1.7.0")
}
