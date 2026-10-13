#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() {
    quanta_core::desktop::run();
}
