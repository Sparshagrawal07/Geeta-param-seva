# Performance baseline

Captured before local-first flow adoption on 2026-09-24, with a post-implementation checkpoint recorded the same day. These are regression anchors, not claims about physical-device startup or frame performance; those still require the release sign-off checklist in `docs/release-performance-signoff.md`.

## Pre-change baseline

- Vitest: 151 tests passing.
- App TypeScript: `npm run typecheck` passing.
- Firebase Functions TypeScript: `npm run functions:build` passing.
- Android production Hermes bundle: 6.3 MB.
- Runtime spiritual assets: about 18.5 MB before recompression.

## Post-implementation checkpoint (2026-09-24)

- Vitest: 189 tests passing.
- App TypeScript + Functions build: passing.
- Dependencies added: `expo-sqlite@~57.0.2`, `expo-image@~57.0.4`, `@react-native-community/netinfo@12.0.1`.
- Runtime spiritual assets reduced to about 2.5 MB with precomposed temple reflections.
- Gita content is bundled locally (18 chapters / 701 verses); no Firestore scripture reads on the member path.
- CI gates: lint, Gita freshness, asset budgets, tests, typecheck, Functions build, JS bundle budget.

Largest repository image assets after optimization:

- Hero/reflection and decorative spiritual PNGs are under the runtime byte budgets enforced by `src/lib/assets-policy.test.ts`.
- Store-listing graphics remain excluded from the runtime asset budget.

## Target budgets

- Tests, app typecheck, and Functions build must remain green.
- Android production Hermes bundle must stay at or below 6.5 MB and may not grow by more than 5% from the 6.3 MB baseline without a recorded exception.
- Cached Home, Seva, practice, notification, and Gita reads should resolve from L1/L2 in under 100 ms at p95 on the reference mid-tier Android device.
- A warm Home-to-Seva tab revisit should present cached content in under 100 ms, without a blocking network spinner.
- One foreground/network recovery event should produce at most one in-flight request per registered resource during its cooldown.
- Runtime spiritual images should be at most 1.0 MB each; hero/reflection variants should be at most 1.25 MB each.
- Total runtime `assets/images/spiritual` payload should be at most 10 MB after recompression. Store-listing graphics are excluded from the runtime asset budget.
- Feed and Gita scrolling should sustain at least 55 FPS at p95 in release builds on the reference Android device, with no single JS stall over 100 ms during steady scrolling.
- Offline relaunch must render previously cached content without a network error replacing it, and account switching must expose zero entries or mutations from the previous session scope.

Re-measure bundle bytes, asset bytes, cold start, warm resume, tab switch, frame rate, memory, Firestore reads, and Function invocations at each rollout checkpoint. Record device, OS, build profile, and sample count with every before/after result.
