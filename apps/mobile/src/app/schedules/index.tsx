import { Alert, Pressable, View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";

import {
  Button,
  Card,
  EmptyState,
  Header,
  Loading,
  Screen,
  StatusPill,
  Text,
} from "../../components/ui";
import {
  endCommitmentSchedule,
  getCommitmentSchedules,
} from "../../features/commitments/api";
import { queryClient, qk } from "../../lib/query";
import { colors, spacing } from "../../theme/tokens";
import type { CommitmentSchedule } from "../../types/domain";

const weekdayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function localTimeLabel(value: string) {
  const [hourValue = "0", minuteValue = "0"] = value.split(":");
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

function weekdayLabel(days: number[]) {
  if (days.length === 7) return "Every day";
  if (days.length === 1) return `Every ${weekdayNames[days[0]]}`;
  return days.map((day) => weekdayNames[day].slice(0, 3)).join(", ");
}

function proofMethodLabel(value: string) {
  if (value === "live_photo") return "Fresh live photo";
  return value.replaceAll("_", " ");
}

function ScheduleCard({ item }: { item: CommitmentSchedule }) {
  const endMutation = useMutation({
    mutationFn: () => endCommitmentSchedule(item.id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.schedules }),
        queryClient.invalidateQueries({ queryKey: qk.today }),
        queryClient.invalidateQueries({ queryKey: qk.plan }),
      ]);
    },
    onError: (error) => {
      Alert.alert(
        "Could not end schedule",
        error instanceof Error ? error.message : "Please try again.",
      );
    },
  });

  function confirmEnd() {
    Alert.alert(
      "End this schedule?",
      "Future promises that have not reached their proof window will be removed. Anything already on the clock stays in place.",
      [
        { text: "Keep schedule", style: "cancel" },
        {
          text: "End schedule",
          style: "destructive",
          onPress: () => endMutation.mutate(),
        },
      ],
    );
  }

  return (
    <Card>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: spacing.md,
        }}
      >
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text variant="section">{item.title}</Text>
          <Text style={{ color: colors.textSecondary }}>
            {weekdayLabel(item.days_of_week)}
          </Text>
        </View>
        <StatusPill status="active" />
      </View>

      <View style={{ gap: spacing.xs }}>
        <Text variant="bodyStrong">
          Due {localTimeLabel(item.deadline_local)} ·{" "}
          {item.minimum_duration_minutes} min
        </Text>
        <Text variant="caption" style={{ color: colors.textSecondary }}>
          {proofMethodLabel(item.proof_method)} opens{" "}
          {item.proof_window_minutes / 60} hour
          {item.proof_window_minutes === 60 ? "" : "s"} before ·{" "}
          {item.circle?.name ?? "Private"}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`End ${item.title} recurring schedule`}
        disabled={endMutation.isPending}
        onPress={confirmEnd}
        style={({ pressed }) => ({
          minHeight: 52,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
          opacity: endMutation.isPending ? 0.45 : pressed ? 0.7 : 1,
        })}
      >
        <Text variant="bodyStrong" style={{ color: colors.missed }}>
          {endMutation.isPending ? "Ending schedule…" : "End schedule"}
        </Text>
      </Pressable>
    </Card>
  );
}

export default function SchedulesScreen() {
  const query = useQuery({
    queryKey: qk.schedules,
    queryFn: getCommitmentSchedules,
  });

  return (
    <Screen>
      <Header
        eyebrow="RECURRING PROMISES"
        title="Schedules"
        subtitle="Each schedule creates a promise on its selected weekdays."
        backLabel="Today"
        onBack={router.back}
      />

      {query.isLoading ? (
        <Loading />
      ) : query.error ? (
        <EmptyState
          title="Could not load schedules"
          body={query.error.message}
          action={<Button title="Try again" onPress={() => query.refetch()} />}
        />
      ) : query.data?.length ? (
        <>
          {query.data.map((schedule) => (
            <ScheduleCard
              key={schedule.id}
              item={schedule as CommitmentSchedule}
            />
          ))}
          <Button
            title="Create another schedule"
            onPress={() => router.push("/commitment/new")}
          />
        </>
      ) : (
        <EmptyState
          title="No active schedules"
          body="Make a recurring promise and CalledOut will put it on the clock every matching weekday."
          action={
            <Button
              title="Create commitment"
              onPress={() => router.push("/commitment/new")}
            />
          }
        />
      )}
    </Screen>
  );
}
