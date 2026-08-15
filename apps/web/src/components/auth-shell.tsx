import { Box, Paper, SimpleGrid, Stack, Text } from '@mantine/core';

/**
 * The split shell both auth screens share: teal brand panel, form card.
 *
 * Signup is a variant of login rather than a second design, so the only thing
 * that changes between them is `statement` — everything else is fixed here so
 * the two pages cannot drift apart.
 */

/** Decorative use of the numeral signature. Counted, so it reads as a tally. */
const NUMERALS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'));

export function AuthShell({
  statement,
  children,
}: {
  statement: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <SimpleGrid component="main" cols={{ base: 1, sm: 2 }} spacing={0} mih="100dvh">
      <Box
        bg="teal.6"
        c="ink.0"
        p={{ base: 'lg', sm: 44 }}
        pos="relative"
        style={{ overflow: 'hidden' }}
      >
        <Box
          aria-hidden
          pos="absolute"
          top={-28}
          right={-6}
          ff="heading"
          fz={66}
          fw={600}
          lh={1.16}
          ta="right"
          style={{
            zIndex: 1,
            letterSpacing: '0.02em',
            color: 'rgba(251, 252, 252, 0.13)',
            fontVariantNumeric: 'tabular-nums',
            userSelect: 'none',
          }}
        >
          {NUMERALS.map((numeral) => (
            <Box key={numeral}>{numeral}</Box>
          ))}
        </Box>

        <Stack
          justify="space-between"
          gap="xl"
          mih="100%"
          style={{ position: 'relative', zIndex: 2 }}
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

          <Box maw={460}>
            <Text
              component="h2"
              ff="heading"
              fw={700}
              fz={{ base: 38, sm: 52 }}
              lh={1.02}
              m={0}
              mb={18}
              style={{ letterSpacing: '0.01em' }}
            >
              {statement}
            </Text>
            <Text fz={14.5} lh={1.6} maw="38ch" c="rgba(251, 252, 252, 0.82)">
              Every task gets a number and keeps it until it&rsquo;s done. Open the list, see where
              you stand, close the count.
            </Text>
          </Box>

          <Text fz={12.5} c="rgba(251, 252, 252, 0.66)">
            Tally &mdash; task manager for small teams
          </Text>
        </Stack>
      </Box>

      <Stack align="center" justify="center" bg="ink.1" px="md" py={56}>
        <Paper radius="lg" shadow="md" w={392} maw="100%" p={32}>
          {children}
        </Paper>
      </Stack>
    </SimpleGrid>
  );
}
