// Release builds own a window, not a console: suppress the console the MSVC
// toolchain would otherwise attach, so launching from Explorer does not flash one.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    aios_shell_lib::run()
}
