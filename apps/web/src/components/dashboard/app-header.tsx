'use client';

import { Avatar, Button, Group, Text } from '@mantine/core';

/** "Dana Whitfield" → "DW". Falls back to the first letter of anything shorter. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
}

export interface AppHeaderProps {
  name: string;
  onLogout: () => void;
  loggingOut: boolean;
}

/**
 * The 64px app bar. There is no nav in it because there is nowhere else to go —
 * the wordmark, the account and the way out are the whole surface.
 */
export function AppHeader({ name, onLogout, loggingOut }: AppHeaderProps) {
  return (
    <Group
      component="header"
      justify="space-between"
      wrap="nowrap"
      h={64}
      px={{ base: 'md', sm: 'lg' }}
      bg="ink.0"
      style={{ borderBottom: '1px solid var(--mantine-color-ink-3)' }}
    >
      <Text ff="heading" fz={24} fw={700} lh={1} tt="uppercase" style={{ letterSpacing: '0.06em' }}>
        Tally
      </Text>

      <Group gap="sm" wrap="nowrap">
        <Text fz={12.5} c="ink.7" visibleFrom="sm">
          {name}
        </Text>
        <Avatar radius="md" color="teal" variant="light" size={30}>
          <Text fz={12} fw={700}>
            {initials(name)}
          </Text>
        </Avatar>
        <Button variant="default" h={30} onClick={onLogout} loading={loggingOut}>
          Log out
        </Button>
      </Group>
    </Group>
  );
}
