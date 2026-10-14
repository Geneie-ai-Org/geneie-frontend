/**
 * Where to send someone right after they sign in: back to the /app page they were turned away
 * from (ProtectedRoute passes it as `location.state.from`), otherwise /app. Only /app paths are
 * honoured so the state can't be used to bounce people elsewhere.
 */
export function postLoginPath(location) {
  const from = location?.state?.from;
  const path = from ? `${from.pathname || ''}${from.search || ''}` : '';
  return path.startsWith('/app') ? path : '/app';
}
