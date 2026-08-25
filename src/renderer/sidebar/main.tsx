import React from 'react'
import { createRoot } from 'react-dom/client'
// Inter (variable), self-hosted so it works offline and within the renderer CSP.
import '@fontsource-variable/inter'
import { App } from './App'
import './styles.css'

class RendererErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { error: Error | null }
> {
    state: { error: Error | null } = { error: null }

    static getDerivedStateFromError(error: Error): { error: Error } {
        return { error }
    }

    componentDidCatch(error: Error): void {
        console.error('Sidebar renderer failed', error)
    }

    render(): React.ReactNode {
        if (!this.state.error) return this.props.children
        return (
            <main style={{ padding: 32, fontFamily: 'Inter, system-ui', color: '#25252a' }}>
                <h1 style={{ fontSize: 20 }}>The interface could not start</h1>
                <p style={{ maxWidth: 720 }}>{this.state.error.message}</p>
                <button type="button" onClick={() => window.location.reload()}>Reload</button>
            </main>
        )
    }
}

const container = document.getElementById('root')
if (container) {
    createRoot(container).render(
        <React.StrictMode>
            <RendererErrorBoundary>
                <App />
            </RendererErrorBoundary>
        </React.StrictMode>
    )
}
