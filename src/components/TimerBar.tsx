import { Show, createSignal, onCleanup } from "solid-js";

export default function TimerBar(props: { endsAt: number | null; durationMs: number | null; label?: string }) {
  const [now, setNow] = createSignal(Date.now());
  const interval = setInterval(() => setNow(Date.now()), 100);
  onCleanup(() => clearInterval(interval));

  const remainingMs = () => (props.endsAt ? Math.max(0, props.endsAt - now()) : 0);
  const remainingSeconds = () => Math.ceil(remainingMs() / 1000);
  const pct = () => (props.durationMs ? Math.max(0, Math.min(100, (remainingMs() / props.durationMs) * 100)) : 0);

  return (
    <Show when={props.endsAt}>
      <div class="w-full max-w-md flex flex-col gap-1">
        <div class="flex justify-between text-xs text-slate-400 uppercase tracking-widest">
          <span>{props.label ?? "Time to answer"}</span>
          <span class={remainingSeconds() <= 5 ? "text-strike font-bold" : ""}>{remainingSeconds()}s</span>
        </div>
        <div class="h-3 w-full bg-slate-700 rounded overflow-hidden">
          <div
            class={`h-full rounded transition-all duration-100 ${
              pct() <= 25 ? "bg-strike" : pct() <= 50 ? "bg-amber-400" : "bg-emerald-500"
            }`}
            style={{ width: `${pct()}%` }}
          />
        </div>
      </div>
    </Show>
  );
}
