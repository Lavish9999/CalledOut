import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Loading, Screen, Text } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/tokens';

export default function AuthCallback() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [error, setError] = useState('');
  const visibleError = error || (!code ? 'The sign-in link is missing its authorization code. Request a new link.' : '');
  useEffect(() => {
    if (!code) return;
    supabase.auth.exchangeCodeForSession(code).then(({ error: exchangeError }) => {
      if (exchangeError) setError(exchangeError.message);
      else router.replace('/');
    });
  }, [code]);
  return <Screen>{visibleError ? <><Text variant="title">Link could not be completed</Text><Text style={{ color: colors.missed }}>{visibleError}</Text><Button title="Back to sign in" onPress={() => router.replace('/(auth)/sign-in')} /></> : <><Loading /><Text style={{ textAlign: 'center' }}>Securing your session…</Text></>}</Screen>;
}
