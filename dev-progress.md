# Survey Says — Dev Progress

PICO-8 clone of Family Feud. Snarky host, doomed contestants.

## Status: scaffolding playable, input module not started

## Scope decisions (Phase 1)

- **State machine**: dispatch-table pattern — `states[gs].upd/.drw`, one
  `gs` string driving `_update`/`_draw`. Flow:
  `title → question ⇄ (strike | reveal) → steal (on 3 strikes) → tally → question|gameover`
- **Survey data**: each question stored as a single delimited string
  (`"question|answer,pts|answer,pts|..."`), parsed once at boot with
  `split()`. Chosen over nested Lua table literals to keep the ~8192
  token budget from scaling with question count.
- **Answer input**: MVP uses substring matching against an on-screen
  keyboard (not free-text parsing) to avoid fuzzy-match complexity.
  Not yet built — see "Not built yet" below.
- **MVP cut list** (deferred, not in v1): fast-money bonus round,
  animated host portrait, multiple survey packs, cartdata high-score
  persistence, point-multiplier rounds.

## Built so far

`survey_says.p8` — single cart, all code in `__lua__`.

- Boot / state machine (`_init`, `set_state`, `_update`, `_draw`)
- Survey data + parser (`raw_surveys`, `parse_survey`, `cur_q`)
- Host snark line pool (`snark`, `say(category)`)
- Shared draw helpers: `wrap_print`, `draw_scoreboard`, `draw_strikes`,
  `draw_board`
- States: `title`, `question`, `reveal`, `strike`, `steal`, `tally`,
  `gameover`
- `start_round()` — the only thing allowed to reset a round's state
  (strikes, points, revealed flags), called explicitly from `title`
  and `tally`, not from a generic state `.enter()` hook

Answer input in the `question` state is currently a **test stub**:
up/down selects an answer, ❎ marks it correct, 🅾️ registers a strike.
This exists so the full loop is playable before the real input system
is built.

## Bugs found and fixed during scaffolding

1. **Progress-wipe on resume** — `states.question.enter()` used to
   reset strikes/points/revealed answers, and `set_state("question")`
   was called both to start a new round *and* to resume the current
   one after a reveal/strike timeout. Every resume wiped the round.
   Fixed by extracting `start_round()` and calling it only from the
   two places that should actually start a new round (`title`,
   `tally`); `question` state has no `.enter` at all now.
2. **Same-frame input race** — correct-guess and strike checks were
   two independent `if`s, so pressing both buttons in one frame could
   reveal an answer *and* register a strike, landing in the wrong
   state with inconsistent `round_pts`. Changed to `if/elseif`.
3. **Layout collisions** — wrapped 2-line questions overlapped the
   board's top border; 3 strikes overlapped team 2's score text.
   Adjusted y-offsets (question text starts y=8, board rect starts
   y=23, strikes shifted to start at x=48 instead of x=56).
4. **`split()` numeric auto-convert** — PICO-8's `split()` converts
   number-looking tokens by default. `wrap_print`'s word-splitter
   could have received a number instead of a string for a bare numeric
   word (e.g. a future question containing "100"), which would crash
   on `#test`. Fixed by passing `split(s," ",false)`.
5. **Malformed cart footer** — first draft's `__gfx__` section had
   154-char rows instead of 128 (and other footer sections were
   placeholder-length, not real PICO-8 dimensions). Regenerated
   `__gfx__` (128×128), `__gff__` (2×256), `__map__` (32×256), `__sfx__`
   (64×168), `__music__` (64×11) to correct sizes. None of this data
   is used yet (no sprites/map/sfx calls in code) but the cart format
   is now well-formed.

## Known limitations / not yet verified

- No local PICO-8 binary available in this environment — everything
  above was verified by hand-tracing logic and checking cart-format
  dimensions, not by actually booting the cart. **Load it in the
  PICO-8 editor before trusting it plays correctly.**
- Steal state is a stub: always resolves to `tally` after a timer,
  doesn't yet distinguish steal success/fail or move points to the
  opposing team.
- No sound/music wired up yet (footer sections are correctly sized
  but empty).

## Next up

Real answer-input module: on-screen keyboard UI + substring matching
against answer keywords, replacing the up/down/❎/🅾️ test stub in the
`question` state.
