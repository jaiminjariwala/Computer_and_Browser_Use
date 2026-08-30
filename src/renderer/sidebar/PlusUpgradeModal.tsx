import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface PlusUpgradeModalProps {
    onClose: () => void
}

function CheckIcon(): React.JSX.Element {
    return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="m4.5 10.3 3.2 3.2 7.8-7.8" />
        </svg>
    )
}

export function PlusUpgradeModal({ onClose }: PlusUpgradeModalProps): React.JSX.Element {
    const [checkoutBusy, setCheckoutBusy] = useState(false)
    const [checkoutError, setCheckoutError] = useState('')
    useEffect(() => {
        const onKey = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    return createPortal(
        <div className="plus-upgrade" role="dialog" aria-modal="true" aria-labelledby="plus-upgrade-title">
            <button type="button" className="plus-upgrade__backdrop" onClick={onClose} aria-label="Close upgrade" />
            <article className="plus-plan-card">
                <button type="button" className="plus-plan-card__close" onClick={onClose} aria-label="Close upgrade">×</button>
                <div>
                    <span className="plus-plan-card__eyebrow">Computer and Browser Use</span>
                    <h2 id="plus-upgrade-title">Plus</h2>
                    <div className="plus-plan-card__price"><sup>$</sup><strong>24.99</strong><span>USD / month</span></div>
                    <p>Managed AI and a coding agent for everyday chat, code, vision, and computer-use tasks.</p>
                </div>

                <div className="plus-plan-card__speed">
                    <span>Response speed</span>
                    <strong>Standard</strong>
                </div>

                <button
                    type="button"
                    className="plus-plan-card__checkout"
                    disabled={checkoutBusy}
                    onClick={() => {
                        setCheckoutBusy(true)
                        setCheckoutError('')
                        void window.glass.startPlusCheckout()
                            .then(onClose)
                            .catch((error: unknown) => {
                                setCheckoutError(error instanceof Error ? error.message : 'Checkout could not be opened.')
                            })
                            .finally(() => setCheckoutBusy(false))
                    }}
                >
                    {checkoutBusy ? 'Opening secure checkout…' : 'Upgrade to Plus'}
                </button>
                {checkoutError && <p className="plus-plan-card__error" role="alert">{checkoutError}</p>}

                <ul>
                    {[
                        'Managed models without pasting provider keys',
                        'Coding agent with an automatic right-side code workspace',
                        'Basic coding questions and working code generation',
                        'Automatic cost-aware model routing',
                        'One Plus usage allowance shared across every model',
                        'The actual model used shown with each response',
                        'Computer and browser use',
                        'Image, screenshot, PDF, and file understanding',
                        'Conversation history and memory'
                    ].map((feature) => (
                        <li key={feature}><CheckIcon /><span>{feature}</span></li>
                    ))}
                </ul>

                <p className="plus-plan-card__notice">Cancel anytime in the billing portal.</p>
            </article>
        </div>,
        document.body
    )
}
