import React, { useState } from 'react'
import type { PermissionSnapshot } from '@op-shared/types'
import { getOperatorBridge } from './bridges'

interface PermissionOnboardingProps {
    permissions: PermissionSnapshot
    busyKind: 'accessibility' | 'screen-recording' | null
    onAllow: (kind: 'accessibility' | 'screen-recording') => void
    onContinue: () => void
    onClose: () => void
}

export function PermissionOnboarding({
    permissions,
    busyKind,
    onAllow,
    onContinue,
    onClose
}: PermissionOnboardingProps): React.JSX.Element {
    const ready = permissions.accessibility === 'granted' && permissions.screenRecording === 'granted'
    const [showScreenDragHelp, setShowScreenDragHelp] = useState(false)

    return (
        <div className="permission-onboarding" role="presentation">
            <section
                className="permission-onboarding__dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="permission-onboarding-title"
            >
                <button
                    type="button"
                    className="permission-onboarding__close"
                    onClick={onClose}
                    aria-label="Close permission setup"
                >
                    ×
                </button>
                <div className="permission-onboarding__appicon" aria-hidden="true">
                    <span>⌁</span>
                </div>
                <h2 id="permission-onboarding-title">Enable Computer or Browser Use</h2>
                <p className="permission-onboarding__intro">
                    Local Mac control needs these permissions to see and operate apps when you approve a task.
                </p>

                <div className="permission-onboarding__permissions">
                    <PermissionRow
                        icon="accessibility"
                        title="Accessibility"
                        description="Allows the agent to operate approved app interfaces"
                        granted={permissions.accessibility === 'granted'}
                        busy={busyKind === 'accessibility'}
                        onAllow={() => onAllow('accessibility')}
                    />
                    <PermissionRow
                        icon="screen"
                        title="Screen Recording"
                        description="Allows the agent to understand what is visible on screen"
                        granted={permissions.screenRecording === 'granted'}
                        busy={busyKind === 'screen-recording'}
                        onAllow={() => {
                            setShowScreenDragHelp(true)
                            onAllow('screen-recording')
                        }}
                    />
                </div>

                {showScreenDragHelp && permissions.screenRecording !== 'granted' && (
                    <div className="permission-drag-help">
                        <span className="permission-drag-help__arrow" aria-hidden="true">↑</span>
                        <span className="permission-drag-help__copy">
                            <strong>Drag the app into Screen Recording</strong>
                            <span>Drop this item into the list in System Settings.</span>
                        </span>
                        <div
                            className="permission-drag-help__app"
                            draggable
                            onDragStart={(event) => {
                                event.dataTransfer.effectAllowed = 'copy'
                                getOperatorBridge()?.startPermissionAppDrag?.()
                            }}
                            aria-label="Drag Computer or Browser Use into System Settings"
                        >
                            <span className="permission-drag-help__appicon" aria-hidden="true">⌁</span>
                            Computer or Browser Use
                        </div>
                    </div>
                )}

                <p className="permission-onboarding__privacy">
                    These permissions stay under macOS control. You can turn them off at any time in Privacy &amp; Security.
                </p>
                <button
                    type="button"
                    className="permission-onboarding__continue"
                    disabled={!ready}
                    onClick={onContinue}
                >
                    Continue to task
                </button>
            </section>
        </div>
    )
}

function PermissionRow({
    icon,
    title,
    description,
    granted,
    busy,
    onAllow
}: {
    icon: 'accessibility' | 'screen'
    title: string
    description: string
    granted: boolean
    busy: boolean
    onAllow: () => void
}): React.JSX.Element {
    return (
        <div className="permission-row">
            <span className={`permission-row__icon permission-row__icon--${icon}`} aria-hidden="true">
                {icon === 'accessibility' ? '●' : '▣'}
            </span>
            <span className="permission-row__copy">
                <strong>{title}</strong>
                <span>{description}</span>
            </span>
            <button
                type="button"
                className={`permission-row__allow${granted ? ' permission-row__allow--granted' : ''}`}
                disabled={granted || busy}
                onClick={onAllow}
            >
                {granted ? 'Allowed' : busy ? 'Opening…' : 'Allow'}
            </button>
        </div>
    )
}
