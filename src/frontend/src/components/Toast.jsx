import { createContext, useContext, useState, useCallback } from 'react';
import * as ToastRadix from '@radix-ui/react-toast';

const ToastCtx = createContext(null);

/**
 * Wrap the app root with <ToastProvider> and call useToast() from any component.
 *
 * const toast = useToast();
 * toast('Saved successfully', 'success');
 * toast('Something went wrong', 'error');
 */
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const add = useCallback((message, type = 'default') => {
    const id = Date.now() + Math.random();
    setItems(prev => [...prev, { id, message, type, open: true }]);
  }, []);

  function dismiss(id) {
    setItems(prev => prev.map(t => t.id === id ? { ...t, open: false } : t));
    // Remove from state after animation
    setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), 400);
  }

  return (
    <ToastCtx.Provider value={add}>
      <ToastRadix.Provider swipeDirection="right" duration={4000}>
        {children}
        {items.map(t => (
          <ToastRadix.Root
            key={t.id}
            open={t.open}
            onOpenChange={(open) => { if (!open) dismiss(t.id); }}
            className={`toast-root toast-root--${t.type}`}
          >
            <ToastRadix.Description asChild>
              <span className="toast-message">{t.message}</span>
            </ToastRadix.Description>
            <ToastRadix.Close asChild>
              <button className="toast-close" aria-label="Dismiss">×</button>
            </ToastRadix.Close>
          </ToastRadix.Root>
        ))}
        <ToastRadix.Viewport className="toast-viewport" />
      </ToastRadix.Provider>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const fn = useContext(ToastCtx);
  if (!fn) throw new Error('useToast must be used inside <ToastProvider>');
  return fn;
}
