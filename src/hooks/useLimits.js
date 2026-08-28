import { useAuth } from './useAuth';
export function useLimits() {
  return useAuth().limits;
}
