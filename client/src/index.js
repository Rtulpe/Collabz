import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Enhance global error suppression for Monaco/network failover overlays
window.onunhandledrejection = function (event) {
  // Suppress known cancellation/failover errors
  if (
    event && event.reason && typeof event.reason === 'object' && (
      event.reason.type === 'cancelation' ||
      event.reason.msg === 'operation is manually canceled' ||
      event.reason.message === 'operation is manually canceled'
    )
  ) {
    event.preventDefault && event.preventDefault();
    return true;
  }
  // Suppress string-based cancellation errors
  if (
    typeof event.reason === 'string' &&
    (event.reason.includes('cancelation') || event.reason.includes('cancellation') || event.reason.includes('manually canceled'))
  ) {
    event.preventDefault && event.preventDefault();
    return true;
  }
  // Otherwise, log for real debugging
  console.error('Unhandled promise rejection:', event.reason || event);
};

// Suppress Monaco/React overlays for cancellation/failover
window.onerror = function (message, source, lineno, colno, error) {
  if (
    (error && error.type === 'cancelation') ||
    (error && error.msg === 'operation is manually canceled') ||
    (error && error.message === 'operation is manually canceled') ||
    (typeof message === 'string' && (message.includes('cancelation') || message.includes('cancellation') || message.includes('manually canceled')))
  ) {
    return true; // Suppress overlay
  }
  // Let real errors through
  return false;
};

// Patch Monaco's error overlay if present (defensive, in case Monaco surfaces overlays)
if (window.MonacoEnvironment && window.MonacoEnvironment.onUnexpectedError) {
  const orig = window.MonacoEnvironment.onUnexpectedError;
  window.MonacoEnvironment.onUnexpectedError = function (error) {
    if (
      (error && error.type === 'cancelation') ||
      (error && error.msg === 'operation is manually canceled') ||
      (error && error.message === 'operation is manually canceled')
    ) {
      return;
    }
    orig(error);
  };
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
