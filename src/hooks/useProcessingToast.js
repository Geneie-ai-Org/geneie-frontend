import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

/**
 * Shows a sonner loading toast while `isVisible` is true, updating its message
 * in place when `message` changes, and dismissing it when hidden or unmounted.
 * Replaces the old <ProcessingNotification> overlay component.
 */
export function useProcessingToast(message, isVisible) {
  const idRef = useRef(null);

  useEffect(() => {
    if (isVisible && message) {
      idRef.current = toast.loading(
        message,
        idRef.current != null ? { id: idRef.current } : undefined
      );
    } else if (idRef.current != null) {
      toast.dismiss(idRef.current);
      idRef.current = null;
    }
  }, [message, isVisible]);

  // Dismiss on unmount.
  useEffect(
    () => () => {
      if (idRef.current != null) {
        toast.dismiss(idRef.current);
        idRef.current = null;
      }
    },
    []
  );
}
