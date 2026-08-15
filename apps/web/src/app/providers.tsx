'use client';

import { useState } from 'react';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { theme } from '@/theme';

/**
 * Every client-side provider the app needs, in one client boundary so
 * `layout.tsx` stays a server component.
 *
 * The `QueryClient` is created in state rather than at module scope: a module
 * singleton is shared across requests on the server, which would leak one
 * user's cache into another's render.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // No client-side retry. The gateway already retries idempotent
            // reads upstream, and a 4xx — which is most of what a client sees —
            // is not made truer by asking again.
            retry: false,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider theme={theme}>
        <Notifications position="top-right" limit={3} />
        {children}
      </MantineProvider>
    </QueryClientProvider>
  );
}
