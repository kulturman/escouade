fn main() {
    #[allow(unused_mut)] // only changed on Windows
    let mut attributes = tauri_build::Attributes::new();
    // Embed the Common-Controls v6 manifest in every binary, test harnesses included:
    // without it, test binaries that link the dialog/tray code fail to start on Windows
    // (STATUS_ENTRYPOINT_NOT_FOUND, TaskDialogIndirect).
    #[cfg(windows)]
    {
        attributes = attributes
            .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
        let manifest = std::env::current_dir()
            .expect("cwd")
            .join("windows-app-manifest.xml");
        println!("cargo:rerun-if-changed={}", manifest.display());
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
        println!("cargo:rustc-link-arg=/WX");
    }
    clang_runtime_on_macos();
    tauri_build::try_build(attributes).expect("tauri build script");
}

/// whisper.cpp's Metal code checks the version of macOS as it runs (`@available`), which calls
/// `__isPlatformVersionAtLeast` from clang's runtime. With LTO (the release profile) Rust's copy of
/// it does not reach the link, and a release built for macOS 11 failed: "symbol(s) not found for
/// architecture arm64". clang's own runtime (a universal archive) is linked instead.
fn clang_runtime_on_macos() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("macos") {
        return;
    }
    let Ok(out) = std::process::Command::new("xcrun")
        .args(["clang", "--print-resource-dir"])
        .output()
    else {
        return;
    };
    let dir =
        std::path::PathBuf::from(String::from_utf8_lossy(&out.stdout).trim()).join("lib/darwin");
    if dir.join("libclang_rt.osx.a").is_file() {
        println!("cargo:rustc-link-search=native={}", dir.display());
        println!("cargo:rustc-link-lib=static=clang_rt.osx");
    }
}
