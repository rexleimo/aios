// The frame that appears while the capability process is being asked.
//
// Without this the window showed a blank page for ~10 s (measured: `aios status --json`
// 9.3 s, matrix loader 9.9 s) — indistinguishable from broken. Next renders this fallback
// as soon as the layout is ready and streams the real page when the data arrives.
export default function ConsoleLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="mb-6 border-b border-rex-border pb-4">
        <div className="flex items-center gap-3">
          <div className="h-6 w-28 animate-pulse rounded-rex-sm bg-rex-panel-strong motion-reduce:animate-none" />
          <div className="h-4 w-16 animate-pulse rounded-full bg-rex-panel-strong motion-reduce:animate-none" />
        </div>
        <div className="mt-2 h-3 w-[46%] animate-pulse rounded-full bg-rex-panel-soft motion-reduce:animate-none" />
        <div className="mt-2 h-2.5 w-64 animate-pulse rounded-full bg-rex-panel-soft motion-reduce:animate-none" />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="rounded-rex-md border border-rex-border px-4 py-3">
            <div className="h-2.5 w-16 animate-pulse rounded-full bg-rex-panel-soft motion-reduce:animate-none" />
            <div className="mt-2.5 h-6 w-12 animate-pulse rounded-rex-sm bg-rex-panel-strong motion-reduce:animate-none" />
            <div className="mt-2 h-2.5 w-24 animate-pulse rounded-full bg-rex-panel-soft motion-reduce:animate-none" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((index) => (
          <div key={index} className="rounded-rex-md border border-rex-border px-5 py-4">
            <div className="h-3.5 w-24 animate-pulse rounded-full bg-rex-panel-strong motion-reduce:animate-none" />
            <div className="mt-3 space-y-2">
              {[0, 1, 2, 3, 4].map((line) => (
                <div
                  key={line}
                  className="h-2.5 animate-pulse rounded-full bg-rex-panel-soft motion-reduce:animate-none"
                  style={{ width: `${88 - line * 9}%` }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 font-rex-mono text-[11px] text-rex-text-soft">
        正在向能力进程取数（aios status 约需数秒）…
      </p>
    </div>
  );
}
