// Keeping the capability process from outliving the shell.
//
// Measured in S1: `taskkill /F <shell.exe>` does not run Tauri's `RunEvent::Exit`,
// so the sidecar node process stayed alive and kept the port. A graceful close is
// not the only way a window dies — the task manager, a crash, and a logout all look
// the same to the child — so the guarantee has to come from the operating system,
// not from a handler that only some exits run.
//
// Windows: the child is assigned to a Job Object with `KILL_ON_JOB_CLOSE`. The kernel
// closes the job handle when this process ends *for any reason*, and the job then
// kills what it holds. No handler is involved, which is exactly the point.
//
// Unix: the child gets its own process group (`process_group(0)`), so the shell can
// signal the whole tree instead of only the direct child.
use std::process::Child;

#[cfg(windows)]
pub use windows_impl::ProcessGuard;
#[cfg(unix)]
pub use unix_impl::ProcessGuard;
#[cfg(not(any(windows, unix)))]
pub use fallback_impl::ProcessGuard;

#[cfg(windows)]
mod windows_impl {
    use std::os::windows::io::AsRawHandle;
    use std::process::Child;

    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    // Only the test asks the kernel where the child ended up.
    #[cfg(test)]
    use std::io;
    #[cfg(test)]
    use windows_sys::core::BOOL;
    #[cfg(test)]
    use windows_sys::Win32::System::JobObjects::IsProcessInJob;

    /// Owns the job handle. Dropping it kills every process still inside the job —
    /// including on an abrupt exit, because the kernel closes the handle.
    pub struct ProcessGuard {
        // A raw handle is not `Send`, but closing it from another thread is safe, and
        // Tauri's managed state requires `Send + Sync`. Holding it as an integer says
        // that out loud instead of hiding it behind an `unsafe impl`.
        job: isize,
        assigned: bool,
    }

    impl ProcessGuard {
        /// Put `child` under this process's job.
        ///
        /// A failure is reported through `is_supervised()` rather than swallowed: a
        /// shell that believes it will clean up and does not is worse than one that
        /// says so, and the caller prints the reason.
        pub fn adopt(child: &Child) -> Self {
            let job = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
            if job.is_null() {
                return Self {
                    job: 0,
                    assigned: false,
                };
            }

            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let configured = unsafe {
                SetInformationJobObject(
                    job,
                    JobObjectExtendedLimitInformation,
                    &limits as *const _ as *const std::ffi::c_void,
                    std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                )
            };
            if configured == 0 {
                unsafe { CloseHandle(job) };
                return Self {
                    job: 0,
                    assigned: false,
                };
            }

            let assigned = unsafe {
                AssignProcessToJobObject(job, child.as_raw_handle() as HANDLE)
            } != 0;
            if !assigned {
                unsafe { CloseHandle(job) };
                return Self {
                    job: 0,
                    assigned: false,
                };
            }

            Self {
                job: job as isize,
                assigned: true,
            }
        }

        fn handle(&self) -> HANDLE {
            self.job as HANDLE
        }

        pub fn is_supervised(&self) -> bool {
            self.assigned
        }

        pub fn terminate(&self, child: &mut Child) {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    impl Drop for ProcessGuard {
        fn drop(&mut self) {
            if self.job != 0 {
                // Closing the last handle to a kill-on-close job terminates its members.
                unsafe { CloseHandle(self.handle()) };
                self.job = 0;
            }
        }
    }

    /// Whether `child` is a member of `guard`'s job — the assertion the test needs,
    /// because "we called AssignProcessToJobObject" is not the same as "it worked".
    #[cfg(test)]
    pub fn is_in_job(child: &Child, guard: &ProcessGuard) -> io::Result<bool> {
        let mut member: BOOL = 0;
        let ok =
            unsafe { IsProcessInJob(child.as_raw_handle() as HANDLE, guard.handle(), &mut member) };
        if ok == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(member != 0)
    }
}

#[cfg(unix)]
mod unix_impl {
    use std::process::Child;

    /// The child was spawned with `process_group(0)`, so its pid is its pgid.
    pub struct ProcessGuard {
        pgid: i32,
    }

    impl ProcessGuard {
        pub fn adopt(child: &Child) -> Self {
            Self {
                pgid: child.id() as i32,
            }
        }

        pub fn is_supervised(&self) -> bool {
            self.pgid > 0
        }

        pub fn terminate(&self, child: &mut Child) {
            // Negative pid = the whole group; a grandchild that ignores SIGTERM still
            // gets SIGKILL because nothing here waits for a graceful shutdown.
            unsafe {
                libc::kill(-self.pgid, libc::SIGKILL);
            }
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[cfg(not(any(windows, unix)))]
mod fallback_impl {
    use std::process::Child;

    pub struct ProcessGuard;

    impl ProcessGuard {
        pub fn adopt(_child: &Child) -> Self {
            Self
        }
        pub fn is_supervised(&self) -> bool {
            false
        }
        pub fn terminate(&self, child: &mut Child) {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

/// Spawn a child that will not outlive us. Kept next to the guard so the two facts
/// (job membership and process group) are set at the one place a child is created.
#[cfg(unix)]
pub fn spawn_supervised(command: &mut std::process::Command) -> std::io::Result<Child> {
    use std::os::unix::process::CommandExt;
    command.process_group(0).spawn()
}

#[cfg(not(unix))]
pub fn spawn_supervised(command: &mut std::process::Command) -> std::io::Result<Child> {
    command.spawn()
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::process::{Command, Stdio};

    fn long_running_child() -> Child {
        // `ping -n 60` is a portable way to get a child that stays alive; the guard
        // kills it regardless of what it is.
        Command::new("cmd")
            .args(["/C", "ping", "-n", "60", "127.0.0.1"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn a probe child")
    }

    #[test]
    fn the_child_is_a_member_of_the_kill_on_close_job() {
        let mut child = long_running_child();
        let guard = ProcessGuard::adopt(&child);
        assert!(
            guard.is_supervised(),
            "the shell cannot promise cleanup it did not get"
        );
        assert_eq!(
            windows_impl::is_in_job(&child, &guard).expect("query job membership"),
            true
        );
        guard.terminate(&mut child);
    }

    #[test]
    fn dropping_the_guard_terminates_the_child() {
        let mut child = long_running_child();
        let pid = child.id();
        {
            let _guard = ProcessGuard::adopt(&child);
        }
        // The kernel closes the job when its last handle goes away; give it a moment.
        std::thread::sleep(std::time::Duration::from_millis(300));
        let status = child.try_wait().expect("poll child");
        assert!(status.is_some(), "child {pid} survived the job close");
    }
}
