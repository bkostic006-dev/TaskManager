import { Center, Stack, Text, Title } from '@mantine/core';

// Placeholder screen for stage 1: it exists to prove the theme, the fonts and the
// palette render end to end. Stage 6 replaces it with the dashboard.
export default function HomePage() {
  return (
    <Center component="main" mih="100dvh" bg="ink.1" p="xl">
      <Stack align="center" gap="sm">
        <Title order={1} fz={44} fw={700} lts="0.06em" tt="uppercase" c="ink.9">
          Tally
        </Title>
        <Text ff="heading" fz={30} fw={600} lts="0.01em" c="ink.7">
          Your day, counted out loud.
        </Text>
        <Text fz="md" c="ink.7">
          The web app is running.
        </Text>
      </Stack>
    </Center>
  );
}
