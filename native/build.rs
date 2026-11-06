fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        // Avoid embedding a developer's absolute Cargo target path in packages.
        println!("cargo:rustc-cdylib-link-arg=-Wl,-install_name,@rpath/guardrails.node");
    }
}
