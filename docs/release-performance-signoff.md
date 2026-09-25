# Release performance and platform sign-off

This is a release sign-off checklist, not a record of completed device testing. Do not check an item without attaching the raw trace or Maestro output and recording the device, OS, build commit, build type, and sample count.

## Build and evidence prerequisites

- [ ] Use a local, production-mode Android or iOS build with Hermes. Do not use Expo Go or a development build for final numbers.
- [ ] Record commit, app version, device model, OS version, free storage, battery/thermal state, and whether the device was rebooted.
- [ ] Build with `EXPO_PUBLIC_LOCAL_PROFILE=1` to enable the local `[local-perf]` samples. The utility uses local User Timing marks and device logs only; it performs no telemetry or network writes.
- [ ] Capture at least five cold-start runs and ten warm-navigation runs. Report median and p95, not the best run.
- [ ] Keep an unmodified trace/output artifact with the release ticket.

Useful local log filters:

```sh
adb logcat | rg '\[local-perf\]'
```

On iOS, filter the Xcode device console for `[local-perf]`.

## Android Studio release scenarios

Use **Android Studio > Profiler > Add session > System Trace** against an installed release APK on a mid-tier physical Android device.

1. **Cold start and cached Home**
   - Force-stop the app before every sample.
   - Start tracing, launch the app, and stop after Home is fully interactive.
   - Repeat once online with a warm cache and once in airplane mode after priming Home.
   - Record time to first frame, time to fully displayed, main-thread stalls, JS-thread stalls, and the `app.root.ready` / `screen.home.cached-ready` samples.
2. **Warm tab lifecycle**
   - Start on Home, then switch Home → Seva → Home 20 times at a steady pace.
   - Confirm each tab preserves scroll/form state, no blocking spinner replaces cached content, and only one mounted instance is retained.
   - In System Trace, inspect the **Frames**, **Main Thread**, and React Native/Hermes tracks. Target cached presentation under 100 ms with no JS stall over 100 ms.
3. **Feed and Gita scrolling**
   - Record a System Trace while flinging Seva for 30 seconds.
   - Open Gita, open a representative long chapter, and fling for 30 seconds.
   - Inspect slow/frozen frames and frame timeline. Target at least 55 FPS at p95 during steady scrolling.
4. **Memory stability**
   - Use **Profiler > Memory**. Capture a baseline heap, perform 20 Home/Seva switches plus five Gita open/back cycles, force GC, and capture another heap.
   - Investigate retained screen/component growth or an upward native-memory trend. Frozen tabs may retain one mounted screen by design; repeated copies are a failure.
5. **Refresh/badge behavior**
   - Use **Profiler > Network Inspector** plus Firebase emulator/log evidence where available.
   - Background/foreground the app five times and switch tabs 20 times.
   - Tab focus must not trigger badge fetches. Foreground/network recovery must be coalesced by the refresh coordinator and respect its cooldown.

## Instruments release scenarios

Run on both a supported iPhone and an iOS 26+ Liquid Glass-capable iPhone when available.

1. **Cold launch**
   - Use **Instruments > App Launch** with a release build.
   - Force-quit before each of five runs and capture launch through interactive Home.
   - Record launch phases, hangs, and `app.root.ready` / `screen.home.cached-ready`.
2. **Theme and Liquid Glass**
   - Use **Core Animation** while switching light ↔ dark ten times on Home, Seva, and Profile.
   - Verify the native tab bar remains Liquid Glass, does not dim/flicker, and remains at full ancestor opacity.
   - Repeat with **Settings > Accessibility > Motion > Reduce Motion** enabled; content opacity dissolves must be absent.
3. **Warm tab and scrolling**
   - Use **Time Profiler** plus **Core Animation** for 20 Home/Seva switches, a 30-second Seva fling, and a 30-second Gita chapter fling.
   - Check main-thread samples, hangs over 100 ms, hitch rate, and preserved tab state.
4. **Memory**
   - Use **Allocations** for 20 tab switches and five Gita open/back cycles.
   - Mark generations before and after the loop and investigate repeated retained screen trees.

## Maestro Android smoke flow

The checked-in `.maestro/android-release-smoke.yaml` flow uses external placeholders and contains no credentials:

```sh
maestro test \
  -e USER_PHONE_DIGITS=REDACTED_10_DIGITS \
  -e USER_GROUP_PIN=REDACTED_PIN \
  .maestro/android-release-smoke.yaml
```

The flow signs in, primes Home/Seva/Gita, enables Android airplane mode, and verifies those already-mounted/cached surfaces remain available. If the flow aborts while offline, manually disable airplane mode. Offline process-relaunch is intentionally a manual sign-off item because the current profile bootstrap still performs a Firestore read.

## Final sign-off

- [ ] Android release traces meet the startup, cached-screen, scrolling, memory, and refresh expectations above.
- [ ] iOS release traces meet the launch, scrolling, memory, reduced-motion, and Liquid Glass expectations above.
- [ ] Maestro Android smoke flow passes with a dedicated test account.
- [ ] Online sign-in, cached Home, Seva, bundled Gita, and in-session offline navigation pass.
- [ ] Any exception includes owner, rationale, before/after evidence, and an expiry release.
