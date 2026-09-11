import { useEffect, useState } from 'react';
import { fetchBetaSeats } from '@/services/backendApi';

/**
 * Seats left in the closed beta, for the landing page.
 *
 * The request is shared across mounts through a module-level promise: the hero and the
 * pricing CTA both ask, and a visitor should not pay for two identical unauthenticated
 * round trips. It is never refetched within a page view — a seat count that changes under
 * someone mid-scroll is worse than one that is a few seconds stale.
 *
 * Failure is deliberately quiet. `seats` stays null, callers keep their normal CTA, and
 * nothing about a down backend reaches the visitor. This is the opposite of
 * LegalConsentGate, which must fail closed; a seat badge must never gate the page.
 */
let inflight = null;

function loadSeats() {
  if (!inflight) {
    inflight = fetchBetaSeats().catch((error) => {
      inflight = null; // let a later mount retry rather than caching the failure
      throw error;
    });
  }
  return inflight;
}

export function useBetaSeats() {
  const [state, setState] = useState({ seats: null, loading: true });

  useEffect(() => {
    let active = true;
    loadSeats()
      .then((seats) => active && setState({ seats, loading: false }))
      .catch(() => active && setState({ seats: null, loading: false }));
    return () => {
      active = false;
    };
  }, []);

  const { seats, loading } = state;
  return {
    seats,
    loading,
    /** Only true once we actually know the beta is full — never while loading or errored. */
    isFull: Boolean(seats) && !seats.open,
  };
}
