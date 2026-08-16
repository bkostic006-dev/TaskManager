'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Anchor, Button, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { PASSWORD_MIN_LENGTH } from '@tally/contracts';

import { AuthShell } from '@/components/auth-shell';
import { useSession, useSignup } from '@/hooks/use-auth';
import { fieldError, isFormFailure } from '@/lib/form-errors';

/** The mockup's field-level copy for the one conflict this form can hit. */
const EMAIL_TAKEN = 'That email is already registered. Log in instead, or use a different address.';

export default function SignupPage() {
  const router = useRouter();
  const { isAuthenticated } = useSession();
  const signup = useSignup();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, router]);

  const error = signup.error;
  const isEmailTaken = error?.statusCode === 409;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    signup.mutate(
      { name, email, password },
      {
        onSuccess: () => {
          notifications.show({
            color: 'teal',
            title: 'Account created',
            message: 'Start counting.',
          });
        },
        onError: (failure) => {
          // Either the form says it or the toast does. A throttled signup is not
          // a problem with the name, email or password that was typed.
          if (!isFormFailure(failure)) {
            notifications.show({
              color: 'brass',
              autoClose: false,
              title: "Couldn't create your account",
              message: failure.message,
            });
          }
        },
      },
    );
  }

  return (
    <AuthShell statement={<>47 open. Nothing lost.</>}>
      <Title order={1} mb={6}>
        Create your account
      </Title>
      <Text c="ink.7" fz={13.5} mb="lg">
        Two fields and you&rsquo;re counting.
      </Text>

      {error !== null && isFormFailure(error) && !isEmailTaken && (
        <Alert role="alert" mb="lg" title="Check the form below.">
          {error.message}
        </Alert>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <Stack gap="md">
          <TextInput
            label="Your name"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            error={fieldError(error, 'name')}
            disabled={signup.isPending}
            autoFocus
            required
            withAsterisk={false}
          />

          <TextInput
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
            error={isEmailTaken ? EMAIL_TAKEN : fieldError(error, 'email')}
            disabled={signup.isPending}
            required
            withAsterisk={false}
          />

          <PasswordInput
            label="Password"
            autoComplete="new-password"
            placeholder="••••••••••"
            description={`At least ${PASSWORD_MIN_LENGTH} characters.`}
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            error={fieldError(error, 'password')}
            disabled={signup.isPending}
            required
            withAsterisk={false}
          />

          <Button type="submit" fullWidth loading={signup.isPending}>
            Create account
          </Button>
        </Stack>
      </form>

      <Text c="ink.7" fz={12.5} mt="md" ta="center">
        By creating an account you agree to the Terms and the Privacy Policy.
      </Text>

      <Text
        ta="center"
        c="ink.7"
        fz={13}
        mt="lg"
        pt={18}
        style={{ borderTop: '1px solid var(--mantine-color-ink-3)' }}
      >
        Already have an account?{' '}
        <Anchor component={Link} href="/login">
          Log in
        </Anchor>
      </Text>
    </AuthShell>
  );
}
