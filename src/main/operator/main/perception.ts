/**
 * Perception Service (Task 7) — public surface.
 *
 * Evolved from the Computer or Browser Use `capture.ts` pipeline vendored in Task 2. Reuse
 * rule (Req 19): a one-time copy Computer or Browser Use now owns and evolves; it imports
 * from `@op-shared/types` and never references the `computer-or-browser-use` project.
 *
 * This used to be one large module; it is now a thin barrel over `./perception/*`
 * so importers keep importing from `'./perception'` unchanged. The public API is
 * identical:
 *  - `./perception/capture`     — Electron `NativeImage`/capture seams.
 *  - `./perception/observation` — pure crop geometry + Observation assembly.
 *  - `./perception/service`     — the `PerceptionService` shell (fail-closed).
 */

export type { CaptureImage } from './perception/capture'

export {
    clampRect,
    isValidBounds,
    isValidScaleFactor,
    buildObservation
} from './perception/observation'
export type {
    ImageSize,
    CaptureMode,
    DisplayInfo,
    RawCapture
} from './perception/observation'

export { PerceptionService } from './perception/service'
export type {
    PerceptionSuccess,
    PerceptionFailure,
    PerceptionResult,
    IdGenerator,
    Clock,
    CaptureOptions,
    PerceptionServiceDeps
} from './perception/service'
