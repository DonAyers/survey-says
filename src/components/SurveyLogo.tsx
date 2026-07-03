// A "split-flap" (Solari board) style reveal: shown briefly full-screen as
// an intro/loading beat with ONE randomly chosen era-inspired look (never
// the real trademarked wordmark, just pastiche), then flips away to reveal
// the app underneath. `HeaderLogo` is the small, permanent, static mark used
// in the app header afterward — no cycling, just gentle idle motion.
import { Match, Switch, createSignal, onMount } from "solid-js";

const ERA_COUNT = 6;
const SPLASH_HOLD_MS = 1300;
const FLIP_MS = 420;

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function nextPaint() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

export function IntroSplash(props: { onDone: () => void }) {
  const [idx] = createSignal(Math.floor(Math.random() * ERA_COUNT));
  const [rot, setRot] = createSignal(-90);
  const [instant, setInstant] = createSignal(true);
  const [leaving, setLeaving] = createSignal(false);

  onMount(async () => {
    await nextPaint();
    setInstant(false);
    setRot(0); // flip open to reveal the chosen era
    await wait(SPLASH_HOLD_MS);
    setLeaving(true);
    setRot(90); // flip closed
    await wait(FLIP_MS);
    props.onDone();
  });

  return (
    <div class={`sl-splash ${leaving() ? "sl-splash-leaving" : ""}`}>
      <style>{CSS}</style>
      <div class="sl-wrap">
        <div
          class="sl-stage sl-stage-lg"
          style={{
            transform: `perspective(1200px) rotateX(${rot()}deg)`,
            transition: instant() ? "none" : "transform 420ms cubic-bezier(.22,.85,.3,1.15)",
          }}
        >
          <div class="sl-seam" />
          <Switch>
            <Match when={idx() === 0}>
              <EraStampedOval />
            </Match>
            <Match when={idx() === 1}>
              <EraCrossStitch />
            </Match>
            <Match when={idx() === 2}>
              <EraPewter />
            </Match>
            <Match when={idx() === 3}>
              <EraPixel />
            </Match>
            <Match when={idx() === 4}>
              <EraChromeScript />
            </Match>
            <Match when={idx() === 5}>
              <EraDiamondStud />
            </Match>
          </Switch>
        </div>
        <p class="sl-loading-caption">tabulating the survey…</p>
      </div>
    </div>
  );
}

export function HeaderLogo() {
  return (
    <div class="sl-wrap">
      <style>{CSS}</style>
      <div class="sl-stage sl-stage-sm">
        <FinalLogo />
      </div>
    </div>
  );
}


// -- Era 1: c.1975, stamped mustard oval, dashed cranberry ring --------------
function EraStampedOval() {
  return (
    <div class="sl-fill" style={{ background: "radial-gradient(120% 140% at 50% 20%, #f2d573, #d9a72e 70%)", "border-radius": "50%" }}>
      <div class="sl-ring-dash" />
      <p class="sl-era-label" style={{ color: "#7a2020" }}>
        1975
      </p>
      <div
        class="sl-word"
        style={{ "font-family": "Bevan, serif", color: "#7a2020", "letter-spacing": "0.04em", "font-size": "2.6rem", "line-height": "1.15" }}
      >
        <span>SURVEY</span>
        <span style={{ "font-size": "1.9rem" }}>SAYS</span>
      </div>
    </div>
  );
}

// -- Era 2: c.1983, needlepoint sampler, powder blue + stitched flowers -----
function EraCrossStitch() {
  return (
    <div
      class="sl-fill"
      style={{
        background: "#bcd9ea",
        "border-radius": "50%",
        "background-image": "repeating-linear-gradient(0deg, rgba(255,255,255,.35) 0 2px, transparent 2px 8px), repeating-linear-gradient(90deg, rgba(255,255,255,.35) 0 2px, transparent 2px 8px)",
      }}
    >
      <div class="sl-ring-dot" />
      <span class="sl-flower" style={{ left: "10%", top: "22%" }}>
        ❀
      </span>
      <span class="sl-flower" style={{ right: "10%", bottom: "20%" }}>
        ❀
      </span>
      <p class="sl-era-label" style={{ color: "#3a5a72" }}>
        1983
      </p>
      <div
        class="sl-word"
        style={{
          "font-family": "'Press Start 2P', monospace",
          color: "#e2b13c",
          "font-size": "2.1rem",
          "line-height": "1.3",
          "text-shadow": "1px 1px 0 #3a5a72, -1px -1px 0 #3a5a72, 1px -1px 0 #3a5a72, -1px 1px 0 #3a5a72",
        }}
      >
        <span>SURVEY</span>
        <span>SAYS</span>
      </div>
    </div>
  );
}

// -- Era 3: c.1994, brushed pewter engraved medallion -----------------------
function EraPewter() {
  return (
    <div
      class="sl-fill"
      style={{
        background: "linear-gradient(135deg, #c9cdd2 0%, #8d949c 45%, #5a6067 100%)",
        "border-radius": "50%",
        "background-image":
          "repeating-linear-gradient(115deg, rgba(255,255,255,.25) 0 1px, transparent 1px 6px), linear-gradient(135deg, #c9cdd2 0%, #8d949c 45%, #5a6067 100%)",
      }}
    >
      <div class="sl-ring-gold" />
      <p class="sl-era-label" style={{ color: "#3a3f45" }}>
        1994
      </p>
      <div
        class="sl-word"
        style={{
          "font-family": "'Press Start 2P', monospace",
          "font-size": "2.1rem",
          "line-height": "1.3",
          color: "#f3f4f6",
          "text-shadow": "1px 1px 0 #2b2f33, 0 2px 3px rgba(0,0,0,.5)",
        }}
      >
        <span>SURVEY</span>
        <span>SAYS</span>
      </div>
    </div>
  );
}

// -- Era 4: c.1998, electric pixel plaque with CRT scanlines ----------------
function EraPixel() {
  return (
    <div
      class="sl-fill"
      style={{
        background: "radial-gradient(120% 140% at 50% 30%, #1c318f, #0d1c56 80%)",
        "border-radius": "18px",
        "background-image":
          "repeating-linear-gradient(180deg, rgba(255,255,255,.06) 0 1px, transparent 1px 3px), radial-gradient(120% 140% at 50% 30%, #1c318f, #0d1c56 80%)",
      }}
    >
      <div class="sl-ring-gold thin" />
      <p class="sl-era-label" style={{ color: "#8fa3ff" }}>
        1998
      </p>
      <div
        class="sl-word"
        style={{
          "font-family": "'Press Start 2P', monospace",
          "font-size": "2.15rem",
          "line-height": "1.3",
          color: "#ffcf3f",
          "text-shadow":
            "2px 0 0 #0d1c56, -2px 0 0 #0d1c56, 0 2px 0 #0d1c56, 0 -2px 0 #0d1c56, 2px 2px 0 #0d1c56, -2px -2px 0 #0d1c56",
        }}
      >
        <span>SURVEY</span>
        <span>SAYS</span>
      </div>
    </div>
  );
}

// -- Era 5: c.2003, chrome + gold cursive script ----------------------------
function EraChromeScript() {
  return (
    <div
      class="sl-fill sl-shine"
      style={{ background: "linear-gradient(160deg, #0d5c66 0%, #06313a 100%)", "border-radius": "50%" }}
    >
      <div class="sl-ring-chrome" />
      <p class="sl-era-label" style={{ color: "#8fd8de" }}>
        2003
      </p>
      <div class="sl-word" style={{ gap: "0.1rem" }}>
        <span style={{ "font-family": "'Berkshire Swash', cursive", color: "#f2c94c", "font-size": "2.1rem", transform: "rotate(-3deg)" }}>
          Survey
        </span>
        <span
          style={{
            "font-family": "Bungee, sans-serif",
            background: "linear-gradient(180deg, #fff 0%, #c7c9cc 45%, #7c8085 100%)",
            "-webkit-background-clip": "text",
            "background-clip": "text",
            color: "transparent",
            "font-size": "2.4rem",
          }}
        >
          SAYS
        </span>
      </div>
    </div>
  );
}

// -- Era 6: c.2009, diamond-stud deluxe -------------------------------------
function EraDiamondStud() {
  return (
    <div
      class="sl-fill"
      style={{
        background: "radial-gradient(120% 140% at 50% 25%, #1b2a55, #0a1230 85%)",
        "border-radius": "20px",
      }}
    >
      <div class="sl-ring-studs" />
      <span class="sl-sparkle" style={{ left: "14%", top: "18%" }}>
        ✦
      </span>
      <span class="sl-sparkle" style={{ right: "12%", top: "26%", "animation-delay": ".6s" }}>
        ✦
      </span>
      <span class="sl-sparkle" style={{ left: "20%", bottom: "16%", "animation-delay": "1.1s" }}>
        ✦
      </span>
      <p class="sl-era-label" style={{ color: "#93a3d6" }}>
        2009
      </p>
      <div
        class="sl-word"
        style={{
          "font-family": "Bungee, sans-serif",
          "font-size": "2.1rem",
          color: "#f5b942",
          "text-shadow": "0 3px 0 #7a3d0a, 0 6px 10px rgba(0,0,0,.55)",
        }}
      >
        <span>SURVEY</span>
        <span>SAYS</span>
      </div>
    </div>
  );
}

// -- Final: our own permanent mark, tying into game mechanics (✓ / ✗) ------
function FinalLogo() {
  return (
    <div class="sl-fill sl-final">
      <span class="sl-check">✓</span>
      <span class="sl-cross">✗</span>
      <div class="sl-final-word">
        <span class="sl-final-top">SURVEY</span>
        <span class="sl-final-bottom">says</span>
      </div>
      <div class="sl-bubble-tail" />
      <div class="sl-shimmer-sweep" />
    </div>
  );
}

const CSS = `
.sl-wrap { display: flex; flex-direction: column; align-items: center; gap: 0.6rem; }
.sl-stage {
  position: relative;
  width: min(92vw, 420px);
  height: 200px;
  transform-style: preserve-3d;
  will-change: transform;
}
.sl-stage-lg { width: min(94vw, 560px); height: 300px; }
.sl-stage-sm { width: min(70vw, 260px); height: 140px; transform: scale(0.6); margin: -28px 0; }
.sl-splash {
  position: fixed; inset: 0; z-index: 60;
  display: flex; align-items: center; justify-content: center;
  background: radial-gradient(120% 120% at 50% 40%, #1c2333 0%, #05070d 100%);
  transition: opacity 420ms ease;
}
.sl-splash-leaving { opacity: 0; }
.sl-loading-caption {
  margin-top: 0.9rem; text-align: center; color: #64748b; font-size: .75rem;
  letter-spacing: .16em; text-transform: uppercase;
}
.sl-seam {
  position: absolute; left: 6%; right: 6%; top: 50%; height: 1px;
  background: rgba(0,0,0,.28); z-index: 5; pointer-events: none;
  box-shadow: 0 1px 0 rgba(255,255,255,.15);
}
.sl-fill {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  overflow: visible;
  box-shadow: 0 14px 30px -10px rgba(0,0,0,.6), inset 0 0 0 4px rgba(0,0,0,.15);
}
.sl-word { display: flex; flex-direction: column; align-items: center; font-weight: 700; }
.sl-era-label {
  position: absolute; bottom: 8px; right: 14px; margin: 0;
  font: 700 0.6rem/1 "Bungee", sans-serif; opacity: .55; letter-spacing: .08em;
}
.sl-ring-dash {
  position: absolute; inset: 10px; border-radius: 50%;
  border: 3px dashed #8f1f1f; opacity: .8;
}
.sl-ring-dot {
  position: absolute; inset: 10px; border-radius: 50%;
  border: 6px dotted #ffffffc0;
}
.sl-ring-gold {
  position: absolute; inset: 8px; border-radius: 50%;
  border: 4px solid #d8b354; box-shadow: inset 0 0 0 1px rgba(0,0,0,.3);
}
.sl-ring-gold.thin { border-width: 3px; inset: 8px; border-radius: 14px; }
.sl-ring-chrome {
  /* border-image ignores border-radius (renders as a rectangle), so fake the
     chrome sheen with per-side border colors instead — this respects the
     ellipse shape correctly. */
  position: absolute; inset: 9px; border-radius: 50%;
  border: 5px solid #c7c9cc;
  border-top-color: #ffffff;
  border-bottom-color: #5a5f66;
}
.sl-ring-studs {
  position: absolute; inset: 6px; border-radius: 16px;
  background:
    repeating-linear-gradient(90deg, #f5d98a 0 8px, transparent 8px 22px) top / 100% 6px no-repeat,
    repeating-linear-gradient(90deg, #f5d98a 0 8px, transparent 8px 22px) bottom / 100% 6px no-repeat,
    repeating-linear-gradient(0deg, #f5d98a 0 8px, transparent 8px 22px) left / 6px 100% no-repeat,
    repeating-linear-gradient(0deg, #f5d98a 0 8px, transparent 8px 22px) right / 6px 100% no-repeat;
  opacity: .85;
}
.sl-flower { position: absolute; color: #e0699a; font-size: 1rem; }
.sl-sparkle { position: absolute; color: #ffe28a; font-size: 0.9rem; animation: sl-twinkle 1.8s ease-in-out infinite; }
@keyframes sl-twinkle { 0%,100% { opacity: .15; transform: scale(.7); } 50% { opacity: 1; transform: scale(1.15); } }
.sl-shine::after {
  content: ""; position: absolute; inset: -20%; border-radius: 50%;
  background: linear-gradient(115deg, transparent 40%, rgba(255,255,255,.25) 50%, transparent 60%);
  animation: sl-sheen 2.6s linear infinite;
}
@keyframes sl-sheen { from { transform: translateX(-40%); } to { transform: translateX(40%); } }

.sl-final {
  border-radius: 22px;
  background: radial-gradient(120% 150% at 50% 20%, #1e2233, #0b0d16 78%);
  border: 2px solid rgba(251,191,36,.35);
}
.sl-final-word { display: flex; flex-direction: column; align-items: center; position: relative; z-index: 2; }
.sl-final-top {
  font-family: Bungee, sans-serif;
  font-size: 2.6rem;
  letter-spacing: .03em;
  background: linear-gradient(180deg, #fde68a 0%, #f5b942 45%, #b8781a 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 3px 0 rgba(120,60,10,.6));
}
.sl-final-bottom {
  font-family: 'Berkshire Swash', cursive;
  font-size: 1.5rem;
  color: #f0abfc;
  margin-top: -0.35rem;
  transform: rotate(-2deg);
  text-shadow: 0 2px 8px rgba(240,171,252,.45);
}
.sl-bubble-tail {
  position: absolute; bottom: -8px; left: 28%;
  width: 22px; height: 22px; background: inherit;
  background-color: #0b0d16;
  border-right: 2px solid rgba(251,191,36,.35);
  border-bottom: 2px solid rgba(251,191,36,.35);
  transform: rotate(45deg);
}
.sl-check, .sl-cross {
  position: absolute; font-weight: 900; font-size: 1.3rem;
  animation: sl-bob 3.2s ease-in-out infinite;
}
.sl-check { left: 10%; top: 20%; color: #34d399; }
.sl-cross { right: 10%; bottom: 22%; color: #dc2626; animation-delay: 1.1s; }
@keyframes sl-bob { 0%,100% { transform: translateY(0) rotate(-6deg); } 50% { transform: translateY(-6px) rotate(6deg); } }
.sl-shimmer-sweep {
  position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(100deg, transparent 30%, rgba(255,255,255,.16) 45%, transparent 60%);
  animation: sl-sheen 4.5s ease-in-out infinite;
}

`;
