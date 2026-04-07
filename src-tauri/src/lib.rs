use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Next.jsサーバーをサイドカーとして起動（プロダクション時）
            if !cfg!(debug_assertions) {
                let resource_dir = app.path().resource_dir()
                    .expect("failed to resolve resource dir");
                let next_dir = resource_dir.parent()
                    .unwrap_or(&resource_dir)
                    .to_path_buf();

                std::thread::spawn(move || {
                    let _ = std::process::Command::new("node")
                        .args(["node_modules/.bin/next", "start", "-p", "3000"])
                        .current_dir(&next_dir)
                        .spawn();
                });

                // Next.jsサーバーの起動を待つ
                std::thread::sleep(std::time::Duration::from_secs(3));
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
