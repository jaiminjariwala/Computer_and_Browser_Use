import React from 'react'
import type { LoopState } from '@op-shared/types'
import type { StepItem } from './operator'

export type OperatorEnvironment = 'browser' | 'container-desktop' | 'local'

export function environmentTitle(environment: OperatorEnvironment): string {
    if (environment === 'browser') return 'Working in Browser'
    if (environment === 'local') return 'Working on Your Mac'
    return 'Working in Sandboxed Desktop'
}

export function activeStepLabel(state: LoopState): string {
    switch (state) {
        case 'perceiving': return 'Inspecting the current screen'
        case 'reasoning': return 'Choosing the safest next action'
        case 'awaiting-confirmation': return 'Waiting for your approval'
        case 'acting': return 'Performing the approved action'
        case 'paused': return 'Task paused'
        case 'awaiting-help': return 'Waiting for your input'
        default: return 'Preparing the next step'
    }
}

interface ActivityCardProps {
    steps: ReadonlyArray<{ id: string } & StepItem>
    pending: boolean
    loopState: LoopState
    environment: OperatorEnvironment
}

export function TaskActivityCard({ steps, pending, loopState, environment }: ActivityCardProps): React.JSX.Element {
    const inspection = steps.filter((step) => /^Checked|^Waited/.test(step.label))
    const terminal = steps.filter((step) => step.kind !== 'action')
    const actions = steps.filter((step) => step.kind === 'action' && !inspection.includes(step))

    return (
        <section className="task-card task-activity" aria-label="Live task progress">
            {inspection.length > 0 && <ActivityGroup title="Understanding current state" steps={inspection} />}
            {(actions.length > 0 || pending) && (
                <ActivityGroup
                    title={environmentTitle(environment)}
                    steps={actions}
                    active={pending ? activeStepLabel(loopState) : undefined}
                />
            )}
            {terminal.length > 0 && <ActivityGroup title="Verifying result" steps={terminal} />}
        </section>
    )
}

function ActivityGroup({
    title,
    steps,
    active
}: {
    title: string
    steps: ReadonlyArray<{ id: string } & StepItem>
    active?: string
}): React.JSX.Element {
    return (
        <div className="task-activity__group">
            <h3 className="task-activity__heading">{title}</h3>
            <div role="list">
                {steps.map((step) => {
                    const failed = step.kind === 'failure' || (step.status !== undefined && step.status !== 'success')
                    return (
                        <div className={`task-status${failed ? ' task-status--error' : ''}`} role="listitem" key={step.id}>
                            <span className="task-status__mark" aria-hidden="true">{failed ? '×' : '✓'}</span>
                            <span className="task-status__body">
                                <span>{step.label}</span>
                                {step.sub && <small>{step.sub}</small>}
                                {step.meta && <small>{step.meta}</small>}
                            </span>
                        </div>
                    )
                })}
                {active && (
                    <div className="task-status task-status--active" role="listitem">
                        <span className="task-status__mark" aria-hidden="true">●</span>
                        <span className="task-status__body"><span>{active}</span></span>
                    </div>
                )}
            </div>
        </div>
    )
}
