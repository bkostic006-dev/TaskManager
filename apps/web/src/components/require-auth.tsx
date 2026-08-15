'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Center, Loader } from '@mantine/core';

import { useSession } from '@/hooks/use-auth';

/**
 * Client-side gate for a protected page.
 *
 * Deliberately not middleware and not an SSR check: the access token lives in
 * memory in the browser, so the server has no way to know who this is and any
 * server-side answer would be a guess. The trade-off — protected pages are
 * CSR-only — is recorded in the plan and the README.
 *
 * The three states are distinct and the middle one matters: while boot is
 * spending the refresh cookie the answer is *not yet known*, and redirecting
 * then would bounce every hard refresh to the login screen before the session
 * had a chance to come back.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isRestoring } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isRestoring && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isRestoring, router]);

  if (isRestoring || !isAuthenticated) {
    return (
      <Center mih="100dvh" bg="ink.1">
        <Loader color="teal.6" type="dots" aria-label="Loading your session" />
      </Center>
    );
  }

  return <>{children}</>;
}
