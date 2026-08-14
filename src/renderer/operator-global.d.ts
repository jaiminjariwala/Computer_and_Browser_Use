import type { OperatorBridge } from '@op-shared/types'

/**
 * Global typing for the operator preload bridge.
 *
 * The merged operator engine exposes its renderer-facing API on
 * `window.operator` (in addition to Computer or Browser Use's own `window.glass`). Both
 * bridges are injected by the single preload (`src/preload/index.ts`). This
 * declaration lets the sidebar and the Control_Indicator overlay use
 * `window.operator` with full type safety.
 */
declare global {
    interface Window {
        operator?: OperatorBridge
    }
}

export { }
