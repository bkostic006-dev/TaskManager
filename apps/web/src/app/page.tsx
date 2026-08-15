'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Center, Loader } from '@mantine/core';

/**
 * The root path has no content of its own. It sends the visitor to the
 * dashboard, whose gate decides whether that means the task list or the login
 * screen — so "where do I go when I open the app" is answered in exactly one
 * place instead of two.
 */
export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  return (
    <Center mih="100dvh" bg="ink.1">
      <Loader color="teal.6" type="dots" aria-label="Loading Tally" />
    </Center>
  );
}
