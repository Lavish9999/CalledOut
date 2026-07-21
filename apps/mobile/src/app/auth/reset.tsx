import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import {
  Button,
  Field,
  Header,
  Loading,
  Screen,
  Text,
} from "../../components/ui";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/tokens";

export default function ResetPassword() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const visibleError =
    error || (!code ? "The reset link is invalid or incomplete." : "");
  useEffect(() => {
    if (!code) return;
    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error: exchangeError }) => {
        if (exchangeError) setError(exchangeError.message);
        else setReady(true);
      });
  }, [code]);
  if (!ready && !visibleError)
    return (
      <Screen>
        <Loading />
        <Text style={{ textAlign: "center" }}>Verifying reset link…</Text>
      </Screen>
    );
  return (
    <Screen>
      <Header
        title="Choose a new password"
        subtitle="Use at least 10 characters."
      />
      {visibleError ? (
        <Text style={{ color: colors.missed }}>{visibleError}</Text>
      ) : (
        <>
          <Field
            label="New password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <Button
            title="Update password"
            disabled={password.length < 10}
            onPress={async () => {
              const { error: updateError } = await supabase.auth.updateUser({
                password,
              });
              if (updateError) setError(updateError.message);
              else router.replace("/");
            }}
          />
        </>
      )}
    </Screen>
  );
}
