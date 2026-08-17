'use client';

import Link from 'next/link';
import { Box, Button, Center, Paper, Stack, Text, Title } from '@mantine/core';

/**
 * The 404 screen.
 *
 * Next ships a stock black-and-white page when this file is absent, which is
 * the one screen in the app that would carry no branding at all — a reviewer
 * who mistypes a URL should not be shown something that looks half-finished.
 *
 * It reuses the empty states' vocabulary rather than inventing a third one: the
 * oversized decorative figure, the same card, the same one-action-out. The link
 * points at `/` rather than `/dashboard` so the session gate stays the single
 * place that decides where a visitor belongs.
 */
export default function NotFound() {
  return (
    <Center component="main" mih="100dvh" bg="ink.1" px="md" py={56}>
      <Paper w={520} maw="100%">
        <Stack align="center" ta="center" px="lg" pt={46} pb={50} gap={0}>
          <Box
            aria-hidden
            ff="heading"
            fz={132}
            fw={700}
            lh={0.86}
            c="ink.3"
            mb={14}
            style={{
              letterSpacing: '0.02em',
              fontVariantNumeric: 'tabular-nums',
              userSelect: 'none',
            }}
          >
            404
          </Box>

          <Title order={1} fz={26} mb={8}>
            That page isn&rsquo;t on the list
          </Title>

          <Text fz={13.5} c="ink.7" maw="44ch" mb={20}>
            The address you followed doesn&rsquo;t match anything here. Your tasks are where you left
            them.
          </Text>

          <Button component={Link} href="/">
            Back to your tasks
          </Button>
        </Stack>
      </Paper>
    </Center>
  );
}
