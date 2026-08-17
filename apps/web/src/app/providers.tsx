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
          mutations: {
            // TanStack's default `networkMode: 'online'` *pauses* a mutation
            // when the browser reports itself offline, rather than failing it.
            // Ticking a checkbox offline then produced nothing at all — no
            // toast, no error, no visible change — and every paused mutation
            // fired at once on reconnect. The brief asks for feedback that
            // informs the user "of actions or errors", and silence is neither.
            //
            // `'always'` lets the request go out and fail like any other
            // failure, so the error toast these hooks already show is what the
            // user gets. Queueing would be defensible; queueing *silently* is
            // the defect. Reads keep the default: a paused refetch leaves the
            // last page on screen, which is the right answer for a read.
            networkMode: 'always',
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider theme={theme}>
        {/* Bottom-right is the design source's placement: a toast at the top
            covers the app header, which is where the account and the way out
            live. Mantine renders one container per position regardless, so this
            prop only chooses which of them receives a notification. */}
        <Notifications position="bottom-right" limit={3} />
        {children}
      </MantineProvider>
    </QueryClientProvider>
  );
}
