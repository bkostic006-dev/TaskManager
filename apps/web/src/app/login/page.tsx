'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Anchor, Button, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';

import { AuthShell } from '@/components/auth-shell';
import { useLogin, useSession } from '@/hooks/use-auth';
import { fieldError } from '@/lib/form-errors';

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated } = useSession();
  const login = useLogin();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Covers both arrivals: someone who is already signed in and typed the URL,
  // and the moment a successful login populates the session store.
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, router]);

  const error = login.error;
  const isCredentialFailure = error?.statusCode === 401;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    login.mutate(
      { email, password },
      {
        onSuccess: (auth) => {
          notifications.show({
            color: 'teal',
            title: `Welcome back, ${auth.user.name.split(' ')[0]}`,
            message: 'Your list is where you left it.',
          });
        },
        onError: (failure) => {
          // A credential or validation failure is stated in the form, where the
          // fields that caused it are. Anything else — the gateway down, a
          // timeout — has nothing to do with what was typed, so it gets a toast.
          if (failure.statusCode !== 401 && failure.statusCode !== 400) {
            notifications.show({
              color: 'brass',
              autoClose: false,
              title: "Couldn't log you in",
              message: failure.message,
            });
          }
        },
      },
    );
  }

  return (
    <AuthShell
      statement={
        <>
          Your day,
          <br />
          counted out loud.
        </>
      }
    >
      <Title order={1} mb={6}>
        Log in
      </Title>
      <Text c="ink.7" fz={13.5} mb="lg">
        Pick up where you left off.
      </Text>

      {error !== null && (
        <Alert
          role="alert"
          mb="lg"
          title={
            isCredentialFailure ? "That email and password don't match." : 'Check the form below.'
          }
        >
          {isCredentialFailure ? 'Check the password, and try Log in again.' : error.message}
        </Alert>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <Stack gap="md">
          <TextInput
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
            error={fieldError(error, 'email')}
            disabled={login.isPending}
            required
            withAsterisk={false}
          />

          <PasswordInput
            label="Password"
            autoComplete="current-password"
            placeholder="••••••••••"
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            error={fieldError(error, 'password')}
            disabled={login.isPending}
            required
            withAsterisk={false}
          />

          <Button type="submit" fullWidth loading={login.isPending}>
            Log in
          </Button>
        </Stack>
      </form>

      <Text
        ta="center"
        c="ink.7"
        fz={13}
        mt="lg"
        pt={18}
        style={{ borderTop: '1px solid var(--mantine-color-ink-3)' }}
      >
        New here?{' '}
        <Anchor component={Link} href="/signup">
          Create an account
        </Anchor>
      </Text>
    </AuthShell>
  );
}
