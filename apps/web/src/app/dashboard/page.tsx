'use client';

import { useRouter } from 'next/navigation';
import { Box, Button, Group, Stack, Text, Title } from '@mantine/core';

import { RequireAuth } from '@/components/require-auth';
import { useLogout, useSession } from '@/hooks/use-auth';

/**
 * Stage 5 placeholder. It exists to prove a session survives a hard refresh and
 * can be ended again — the task list, the toolbar and everything else in
 * `design/mockups/dashboard.html` is stage 6's.
 */
function Dashboard() {
  const router = useRouter();
  const { user } = useSession();
  const logout = useLogout();

  function handleLogout() {
    logout.mutate(undefined, { onSettled: () => router.replace('/login') });
  }

  return (
    <Box mih="100dvh" bg="ink.1">
      <Group
        component="header"
        justify="space-between"
        h={64}
        px="lg"
        bg="ink.0"
        style={{ borderBottom: '1px solid var(--mantine-color-ink-3)' }}
      >
        <Text
          ff="heading"
          fz={24}
          fw={700}
          lh={1}
          tt="uppercase"
          style={{ letterSpacing: '0.06em' }}
        >
          Tally
        </Text>
        <Button variant="default" h={30} onClick={handleLogout} loading={logout.isPending}>
          Log out
        </Button>
      </Group>

      <Stack p="xl" gap="xs">
        <Title order={1}>Tasks</Title>
        <Text c="ink.7">Signed in as {user?.name}</Text>
      </Stack>
    </Box>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <Dashboard />
    </RequireAuth>
  );
}
