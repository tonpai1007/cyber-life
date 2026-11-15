import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Cyber-Life crashed:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#020205',
          color: '#e8e8ff',
          fontFamily: 'monospace',
          padding: '2rem',
          textAlign: 'center'
        }}>
          <div>
            <h1 style={{ color: '#ff00ff', marginBottom: '1rem', fontSize: '1.5rem' }}>SYSTEM_FAILURE</h1>
            <p style={{ color: '#8888aa', marginBottom: '0.5rem' }}>The cellular automata engine has encountered a critical error.</p>
            <pre style={{ color: '#f8ff00', fontSize: '0.75rem', textAlign: 'left', overflow: 'auto', maxWidth: '600px', background: 'rgba(0,0,0,0.5)', padding: '1rem' }}>
              {this.state.error?.message}
            </pre>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                marginTop: '1rem',
                background: 'transparent',
                border: '1px solid #00f3ff',
                color: '#00f3ff',
                padding: '0.5rem 1.2rem',
                cursor: 'pointer',
                fontFamily: 'monospace'
              }}
            >
              REBOOT_SYSTEM
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
