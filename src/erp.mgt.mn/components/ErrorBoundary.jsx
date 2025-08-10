import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error(error, info);
  }

  render() {
    if (this.state.hasError) {
      const message = this.state.error?.message || 'Something went wrong';
      return <div style={{ color: 'red' }}>{message}</div>;
    }
    return this.props.children;
  }
}
