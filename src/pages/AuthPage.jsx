import React from 'react';
import AuthForm from '@/components/AuthForm';
import AuthPageLayout from '@/components/chat/AuthPageLayout';
import { useSeo } from '@/hooks/useSeo';

const AuthPage = () => {
  useSeo({
    title: 'Sign in — Geneie',
    description: 'Sign in to Geneie to upload variant files and analyze your genomic data.',
    path: '/auth',
    noindex: true,
  });

  return (
    <AuthPageLayout showHomeLink>
      <AuthForm />
    </AuthPageLayout>
  );
};

export default AuthPage;
