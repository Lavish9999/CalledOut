import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { Button, Card, Field, Header, Screen, Text } from "../../components/ui";
import { colors, radius, spacing } from "../../theme/tokens";
import { useOnboarding } from "../../state/onboarding";
import type { WorkoutType } from "../../types/domain";
import { completeProfile, finishOnboarding } from "../../features/profile/api";
import { createRecurringCommitment } from "../../features/commitments/api";
import { useSession } from "../../providers/session";
import { analytics } from "../../lib/analytics";
import { registerPushToken } from "../../lib/notifications";

const workouts: [WorkoutType, string][] = [
  ["gym", "Gym"],
  ["running", "Running"],
  ["walking", "Walking"],
  ["cycling", "Cycling"],
  ["sports", "Sports"],
  ["home", "Home workout"],
  ["swimming", "Swimming"],
  ["mobility", "Yoga or mobility"],
  ["other", "Other"],
];
const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const st = useOnboarding();
  const { session, refreshProfile } = useSession();

  async function finish() {
    setLoading(true);
    try {
      await completeProfile({
        display_name: st.displayName,
        username: st.username,
        bio: st.bio,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        workout_types: st.workouts,
      });
      await createRecurringCommitment({
        title: st.workouts[0] === "running" ? "Run" : "Workout",
        workout_type: st.workouts[0] ?? "gym",
        days_of_week: st.days,
        deadline_hour: st.deadlineHour,
        minimum_duration_minutes: st.minimumDuration,
        proof_method: "live_photo",
        requires_location: false,
      });
      await finishOnboarding();
      analytics.capture("onboarding_completed");
      await refreshProfile();
      if (session) registerPushToken(session.user.id).catch(() => {});
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Please try again.";
      console.error("Onboarding failed", error);
      Alert.alert("Could not finish setup", message);
    } finally {
      setLoading(false);
    }
  }

  const progress = (step + 1) / 5;

  return (
    <Screen>
      <View
        style={{ height: 4, backgroundColor: colors.border, borderRadius: 2 }}
      >
        <View
          style={{
            height: 4,
            width: `${progress * 100}%`,
            backgroundColor: colors.text,
            borderRadius: 2,
          }}
        />
      </View>

      {step === 0 ? (
        <>
          <Header eyebrow="1 OF 5" title="How it works" />
          <Card>
            <Text variant="section">1. Schedule your workout</Text>
            <Text style={{ color: colors.textSecondary }}>
              Make the commitment before pressure starts.
            </Text>
          </Card>
          <Card>
            <Text variant="section">2. Submit fresh proof</Text>
            <Text style={{ color: colors.textSecondary }}>
              No old camera-roll receipts.
            </Text>
          </Card>
          <Card>
            <Text variant="section">3. Miss it and face The Wall</Text>
            <Text style={{ color: colors.textSecondary }}>
              Only the promise you made is judged.
            </Text>
          </Card>
        </>
      ) : step === 1 ? (
        <>
          <Header eyebrow="2 OF 5" title="Your profile" />
          <Field
            label="Display name"
            value={st.displayName}
            onChangeText={(value) => st.set("displayName", value)}
          />
          <Field
            label="Username"
            value={st.username}
            autoCapitalize="none"
            onChangeText={(value) =>
              st.set("username", value.replace(/[^a-zA-Z0-9_]/g, ""))
            }
          />
          <Field
            label="Short bio (optional)"
            value={st.bio}
            onChangeText={(value) => st.set("bio", value)}
            multiline
          />
        </>
      ) : step === 2 ? (
        <>
          <Header eyebrow="3 OF 5" title="What counts as a workout for you?" />
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}
          >
            {workouts.map(([key, label]) => {
              const active = st.workouts.includes(key);
              return (
                <Pressable
                  key={key}
                  onPress={() =>
                    st.set(
                      "workouts",
                      active
                        ? st.workouts.filter((workout) => workout !== key)
                        : [...st.workouts, key],
                    )
                  }
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: active ? colors.text : colors.border,
                    backgroundColor: active ? colors.dark : colors.surface,
                  }}
                >
                  <Text
                    style={{ color: active ? colors.surface : colors.text }}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : step === 3 ? (
        <>
          <Header
            eyebrow="4 OF 5"
            title="Choose your days"
            subtitle="You can edit future commitments later."
          />
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}
          >
            {dayLabels.map((label, index) => {
              const active = st.days.includes(index);
              return (
                <Pressable
                  key={label}
                  onPress={() =>
                    st.set(
                      "days",
                      active
                        ? st.days.filter((day) => day !== index)
                        : [...st.days, index],
                    )
                  }
                  style={{
                    width: 52,
                    height: 52,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: active ? colors.text : colors.border,
                    backgroundColor: active ? colors.dark : colors.surface,
                  }}
                >
                  <Text
                    variant="caption"
                    style={{ color: active ? colors.surface : colors.text }}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Field
            label="Deadline hour (0–23)"
            value={String(st.deadlineHour)}
            keyboardType="number-pad"
            onChangeText={(value) =>
              st.set(
                "deadlineHour",
                Math.min(23, Math.max(0, Number(value) || 0)),
              )
            }
          />
          <Field
            label="Minimum minutes"
            value={String(st.minimumDuration)}
            keyboardType="number-pad"
            onChangeText={(value) =>
              st.set("minimumDuration", Math.max(1, Number(value) || 1))
            }
          />
        </>
      ) : (
        <>
          <Header
            eyebrow="5 OF 5"
            title="Private by default"
            subtitle="Proof is visible only to circle members unless you explicitly change it."
          />
          <Card>
            <Text variant="card">Camera</Text>
            <Text>
              Fresh in-app proof only. Camera-roll photos cannot satisfy standard
              commitments.
            </Text>
          </Card>
          <Card>
            <Text variant="card">Safety controls</Text>
            <Text>
              Reports are private. Blocking separates both people across eligible
              accountability and social surfaces.
            </Text>
          </Card>
          <Card>
            <Text variant="card">Community rules</Text>
            <Text>
              No body shaming, threats, harassment, dangerous-exercise pressure,
              doxxing, or posting people without permission.
            </Text>
          </Card>
        </>
      )}

      <View style={{ gap: spacing.sm, marginTop: "auto" }}>
        <Button
          title={step === 4 ? "Create first commitment" : "Continue"}
          loading={loading}
          disabled={
            (step === 1 && (!st.displayName || st.username.length < 3)) ||
            (step === 2 && !st.workouts.length) ||
            (step === 3 && !st.days.length)
          }
          onPress={() => (step < 4 ? setStep(step + 1) : finish())}
        />
        {step > 0 ? (
          <Button
            title="Back"
            variant="ghost"
            onPress={() => setStep(step - 1)}
          />
        ) : null}
      </View>
    </Screen>
  );
}
