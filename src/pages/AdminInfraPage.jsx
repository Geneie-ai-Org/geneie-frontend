import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useSeo } from '@/hooks/useSeo';
import { adminWhoAmI } from '@/services/backendApi';
import InfraPanel from '@/components/admin/InfraPanel';
import { AdminFrame } from '@/components/admin/adminUi';

/**
 * Unlisted infra page next to the admin tool (/admin-haha/infra).
 *
 * Same access model as AdminPage: the server decides via /api/admin/whoami and every
 * /api/admin/infra/* route is admin-gated server-side; this gate only avoids rendering a
 * page that would 403. Same layout shell as AdminPage so the two read as one tool.
 */
const AdminInfraPage = () => {
  useSeo({ title: 'Infra · Geneie', description: 'Internal tool', path: '/admin-haha/infra', noindex: true });

  const { userId, isAuthReady, userLoading } = useAuth();

  /* null = answer not in yet, so nothing renders instead of flashing the wrong state. */
  const [isAllowed, setIsAllowed] = useState(null);

  useEffect(() => {
    if (!isAuthReady) return;
    if (!userId) {
      setIsAllowed(false);
      return;
    }
    let active = true;
    adminWhoAmI()
      .then(() => active && setIsAllowed(true))
      .catch(() => active && setIsAllowed(false));
    return () => {
      active = false;
    };
  }, [isAuthReady, userId]);

  if (!isAuthReady || userLoading || isAllowed === null) return null;
  if (!isAllowed) return <Navigate to="/app" replace />;

  return (
    <AdminFrame>
      <InfraPanel />
    </AdminFrame>
  );
};

export default AdminInfraPage;
