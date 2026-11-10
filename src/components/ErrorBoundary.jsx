import { Component } from 'react'

// Beklenmeyen bir hata uygulamayı tamamen boşaltmasın diye son savunma hattı. Stiller satır içi (CSS dosyası yok).
const screen = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 16,
  padding: 16,
  background: '#07080c',
  color: '#e6eaf2',
  fontFamily: 'system-ui, sans-serif',
  textAlign: 'center',
  zIndex: 9999,
}
const button = {
  border: 'none',
  background: 'var(--frost, rgba(255, 255, 255, 0.08))',
  color: '#e6eaf2',
  padding: '12px 20px',
  borderRadius: 14,
  font: 'inherit',
  cursor: 'pointer',
  minWidth: 220,
}

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Anfo hatası:', error, info?.componentStack)
  }

  resetData = () => {
    try {
      localStorage.removeItem('anfo:v3')
    } catch {}
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" style={screen}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Bir şey ters gitti</h1>
        <p style={{ opacity: 0.7, margin: 0, maxWidth: 360, lineHeight: 1.5 }}>
          Anfo beklenmeyen bir hatayla karşılaştı. Önce yeniden yüklemeyi dene; sorun sürerse verileri sıfırlayabilirsin.
        </p>
        <button style={button} onClick={() => window.location.reload()}>
          Yeniden yükle
        </button>
        <button style={button} onClick={this.resetData}>
          Verileri sıfırla ve yeniden başlat
        </button>
      </div>
    )
  }
}
