import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";

import {
  Button,
  Card,
  Divider,
  Field,
  Header,
  Loading,
  Screen,
  SectionHeader,
  Text,
} from "../../components/ui";
import {
  createOneTimeCommitment,
  createRecurringCommitment,
} from "../../features/commitments/api";
import { getCircles } from "../../features/circles/api";
import { getPlanOverview } from "../../features/subscription/api";
import { queryClient, qk } from "../../lib/query";
import { analytics } from "../../lib/analytics";
import {
  dateFromOffset,
  firstOccurrenceLabel,
  formatWeekdaySelection,
  localDateKey,
  nextWeeklyDeadline,
  oneTimeDateLabel,
  todayDeadlinePassed,
  weekdayOptions,
} from "../../lib/recurrence";
import { colors, radius, spacing } from "../../theme/tokens";

const proofWindowChoices = [
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
  { minutes: 240, label: "4 hours" },
  { minutes: 480, label: "8 hours" },
];

const oneTimeOffsets = [0, 1, 2, 3, 4, 5, 6];

type RecurrenceMode = "once" | "weekly";

function timeFromMinutes(totalMinutes: number) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

function oneTimeDateTimeLabel(date: Date, baseDate = new Date()) {
  const start = new Date(baseDate);
  start.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const offset = Math.round((target.getTime() - start.getTime()) / 86_400_000);
  const dateLabel = oneTimeDateLabel(offset, baseDate);
  return `${dateLabel} at ${timeFromMinutes(date.getHours() * 60 + date.getMinutes())}`;
}

function Stepper({
  label,
  value,
  onDecrease,
  onIncrease,
  decreaseDisabled,
  increaseDisabled,
}: {
  label: string;
  value: string;
  onDecrease: () => void;
  onIncrease: () => void;
  decreaseDisabled?: boolean;
  increaseDisabled?: boolean;
}) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text variant="caption">{label}</Text>
      <Card
        style={{
          minHeight: 76,
          padding: spacing.sm,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label.toLowerCase()}`}
          disabled={decreaseDisabled}
          onPress={onDecrease}
          style={({ pressed }) => ({
            width: 48,
            height: 48,
            borderRadius: radius.md,
            backgroundColor: colors.surfaceMuted,
            alignItems: "center",
            justifyContent: "center",
            opacity: decreaseDisabled ? 0.35 : pressed ? 0.7 : 1,
          })}
        >
          <Ionicons name="remove" size={22} color={colors.text} />
        </Pressable>

        <Text variant="section">{value}</Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label.toLowerCase()}`}
          disabled={increaseDisabled}
          onPress={onIncrease}
          style={({ pressed }) => ({
            width: 48,
            height: 48,
            borderRadius: radius.md,
            backgroundColor: colors.surfaceMuted,
            alignItems: "center",
            justifyContent: "center",
            opacity: increaseDisabled ? 0.35 : pressed ? 0.7 : 1,
          })}
        >
          <Ionicons name="add" size={22} color={colors.text} />
        </Pressable>
      </Card>
    </View>
  );
}

export default function NewCommitment() {
  const planQuery = useQuery({ queryKey: qk.plan, queryFn: getPlanOverview });
  const circlesQuery = useQuery({ queryKey: qk.circles, queryFn: getCircles });
  const circleSelectionInitialized = useRef(false);

  const todayWeekday = new Date().getDay();
  const [recurrenceMode, setRecurrenceMode] =
    useState<RecurrenceMode>("weekly");
  const [now, setNow] = useState(() => new Date());
  const [selectedDays, setSelectedDays] = useState<number[]>([todayWeekday]);
  const [oneTimeOffset, setOneTimeOffset] = useState(0);
  const [title, setTitle] = useState("Workout");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [deadlineHour, setDeadlineHour] = useState(20);
  const [proofWindowMinutes, setProofWindowMinutes] = useState(240);
  const [circleId, setCircleId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (
      !circleSelectionInitialized.current &&
      circlesQuery.data &&
      circlesQuery.data.length > 0
    ) {
      circleSelectionInitialized.current = true;
      setCircleId(circlesQuery.data[0].id);
    }
  }, [circlesQuery.data]);

  const atScheduleLimit = Boolean(
    planQuery.data &&
    planQuery.data.activeScheduleCount >= planQuery.data.scheduleLimit,
  );

  const effectiveRecurrenceMode: RecurrenceMode =
    atScheduleLimit && recurrenceMode === "weekly" ? "once" : recurrenceMode;

  const deadlineTime = timeFromMinutes(deadlineHour * 60);
  const proofOpenTime = timeFromMinutes(deadlineHour * 60 - proofWindowMinutes);
  const proofOpensPreviousDay = deadlineHour * 60 - proofWindowMinutes < 0;
  const selectedCircle = circlesQuery.data?.find(
    (circle) => circle.id === circleId,
  );
  const validTitle = title.trim().length >= 1 && title.trim().length <= 80;
  const hasSelectedDays = selectedDays.length > 0;
  const oneTimeDate = dateFromOffset(oneTimeOffset);
  const oneTimeDeadline = new Date(oneTimeDate);
  oneTimeDeadline.setHours(deadlineHour, 0, 0, 0);
  const oneTimeProofOpen = new Date(
    oneTimeDeadline.getTime() - proofWindowMinutes * 60_000,
  );
  const oneTimeDeadlinePassed =
    effectiveRecurrenceMode === "once" &&
    oneTimeDeadline.getTime() <= now.getTime();
  const weeklyLabel = formatWeekdaySelection(selectedDays);
  const weeklyFirstDeadline = nextWeeklyDeadline(
    selectedDays,
    deadlineHour,
    now,
  );
  const weeklySkipsToday =
    effectiveRecurrenceMode === "weekly" &&
    todayDeadlinePassed(selectedDays, deadlineHour, now);
  const firstDeadline =
    effectiveRecurrenceMode === "weekly"
      ? weeklyFirstDeadline
      : oneTimeDeadline;
  const firstPromiseLabel = firstDeadline
    ? firstOccurrenceLabel(firstDeadline, now)
    : "Choose at least one workout day";
  const recurrenceLabel =
    effectiveRecurrenceMode === "weekly"
      ? weeklyLabel
      : oneTimeDateLabel(oneTimeOffset);
  const promiseTiming = `${recurrenceLabel} · ${durationMinutes} min · due ${deadlineTime}`;
  const proofTiming =
    effectiveRecurrenceMode === "weekly"
      ? `Live photo opens at ${proofOpenTime}${
          proofOpensPreviousDay ? " the day before" : ""
        }`
      : `Live photo opens ${oneTimeDateTimeLabel(oneTimeProofOpen)}`;

  const consequenceCopy = selectedCircle
    ? `Miss the deadline and you will appear on ${selectedCircle.name}'s Wall.`
    : "Miss the deadline and it becomes part of your private record.";

  const mutation = useMutation({
    mutationFn: async () => {
      const shared = {
        title: title.trim(),
        workout_type: "gym" as const,
        deadline_hour: deadlineHour,
        minimum_duration_minutes: durationMinutes,
        proof_window_minutes: proofWindowMinutes,
        proof_method: "live_photo" as const,
        requires_location: false,
        circle_id: circleId,
      };

      if (effectiveRecurrenceMode === "weekly") {
        return createRecurringCommitment({
          ...shared,
          days_of_week: selectedDays,
        });
      }

      return createOneTimeCommitment({
        ...shared,
        commitment_date: localDateKey(oneTimeDate),
      });
    },
    onSuccess: async () => {
      analytics.capture("commitment_created", {
        recurring: effectiveRecurrenceMode === "weekly",
        selected_days:
          effectiveRecurrenceMode === "weekly"
            ? selectedDays.length
            : undefined,
        proof_window_minutes: proofWindowMinutes,
        circle_id: circleId,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.today }),
        queryClient.invalidateQueries({ queryKey: qk.plan }),
        queryClient.invalidateQueries({ queryKey: qk.schedules }),
      ]);

      Alert.alert(
        effectiveRecurrenceMode === "weekly"
          ? "Schedule created"
          : "Promise created",
        effectiveRecurrenceMode === "weekly"
          ? `Your first promise is ${firstPromiseLabel}.`
          : `Your promise is due ${firstPromiseLabel}.`,
        [{ text: "Done", onPress: () => router.back() }],
      );
    },
    onError: (cause) =>
      setError(cause instanceof Error ? cause.message : "Please try again."),
  });

  function chooseRecurrence(next: RecurrenceMode) {
    if (next === "weekly" && atScheduleLimit) {
      if (planQuery.data?.isPro) {
        Alert.alert(
          "Schedule limit reached",
          "CalledOut Pro supports up to 5 active recurring schedules. End one before creating another.",
          [
            { text: "Not now", style: "cancel" },
            {
              text: "View schedules",
              onPress: () => router.push("/schedules"),
            },
          ],
        );
      } else {
        router.push("/paywall?source=schedule_limit" as never);
      }
      return;
    }

    setRecurrenceMode(next);
    setError("");
  }

  function toggleWeekday(day: number) {
    setSelectedDays((current) => {
      if (current.includes(day)) {
        return current.length === 1
          ? current
          : current.filter((value) => value !== day);
      }
      return [...current, day].sort((left, right) => left - right);
    });
  }

  function confirmCommitment() {
    Alert.alert(
      "Lock this in?",
      `${promiseTiming}\nFirst promise: ${firstPromiseLabel}\n\n${consequenceCopy}\n\nOnce proof opens, this promise cannot be edited.`,
      [
        { text: "Not yet", style: "cancel" },
        {
          text: "Lock it in",
          onPress: () => mutation.mutate(),
        },
      ],
    );
  }

  const formInvalid =
    !validTitle ||
    (effectiveRecurrenceMode === "weekly" && !hasSelectedDays) ||
    oneTimeDeadlinePassed;

  return (
    <Screen>
      <Header
        title="Make the promise"
        subtitle="Choose one day or a weekly pattern. Once proof opens, the promise is locked."
        backLabel="Today"
        onBack={router.back}
      />

      {planQuery.isLoading ? (
        <Loading />
      ) : (
        <>
          <View style={{ gap: spacing.sm }}>
            <SectionHeader title="Repeats" />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {[
                {
                  mode: "once" as const,
                  title: "One time",
                  body: "Does not use a schedule",
                },
                {
                  mode: "weekly" as const,
                  title: "Weekly",
                  body: `${planQuery.data?.activeScheduleCount ?? 0}/${
                    planQuery.data?.scheduleLimit ?? 1
                  } schedules used`,
                },
              ].map((choice) => {
                const selected = effectiveRecurrenceMode === choice.mode;
                const locked = choice.mode === "weekly" && atScheduleLimit;
                return (
                  <Pressable
                    key={choice.mode}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, disabled: locked }}
                    onPress={() => chooseRecurrence(choice.mode)}
                    style={({ pressed }) => ({
                      flex: 1,
                      opacity: pressed ? 0.75 : 1,
                    })}
                  >
                    <Card
                      style={{
                        minHeight: 104,
                        padding: spacing.md,
                        borderWidth: selected ? 2 : 1,
                        borderColor: selected ? colors.text : colors.border,
                        justifyContent: "space-between",
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: spacing.xs,
                        }}
                      >
                        <Text variant="bodyStrong">{choice.title}</Text>
                        <Ionicons
                          name={
                            locked
                              ? "lock-closed"
                              : selected
                                ? "radio-button-on"
                                : "radio-button-off"
                          }
                          size={18}
                          color={locked ? colors.textSecondary : colors.text}
                        />
                      </View>
                      <Text
                        variant="caption"
                        style={{ color: colors.textSecondary }}
                      >
                        {choice.body}
                      </Text>
                    </Card>
                  </Pressable>
                );
              })}
            </View>

            {effectiveRecurrenceMode === "weekly" ? (
              <View style={{ gap: spacing.xs }}>
                <Text variant="caption">Workout days</Text>
                <View style={{ flexDirection: "row", gap: spacing.xxs }}>
                  {weekdayOptions.map((day) => {
                    const selected = selectedDays.includes(day.value);
                    return (
                      <Pressable
                        key={day.value}
                        accessibilityRole="checkbox"
                        accessibilityLabel={day.long}
                        accessibilityState={{ checked: selected }}
                        onPress={() => toggleWeekday(day.value)}
                        style={({ pressed }) => ({
                          flex: 1,
                          opacity: pressed ? 0.75 : 1,
                        })}
                      >
                        <View
                          style={{
                            minHeight: 52,
                            borderRadius: radius.md,
                            borderWidth: selected ? 2 : 1,
                            borderColor: selected ? colors.text : colors.border,
                            backgroundColor: colors.surface,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Text variant="bodyStrong">{day.narrow}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
                <Text variant="caption" style={{ color: colors.textSecondary }}>
                  {weeklyLabel}. Multiple days still count as one recurring
                  schedule.
                </Text>
                <Card
                  style={{
                    padding: spacing.sm,
                    backgroundColor: weeklySkipsToday
                      ? colors.surfaceMuted
                      : colors.surface,
                  }}
                >
                  <Text variant="bodyStrong">
                    First promise: {firstPromiseLabel}
                  </Text>
                  {weeklySkipsToday ? (
                    <Text
                      variant="caption"
                      style={{ color: colors.textSecondary }}
                    >
                      Today’s {deadlineTime} deadline has already passed, so no
                      promise will appear on Today until the next selected day.
                    </Text>
                  ) : (
                    <Text
                      variant="caption"
                      style={{ color: colors.textSecondary }}
                    >
                      This is the first promise that will appear on Today.
                    </Text>
                  )}
                </Card>
              </View>
            ) : (
              <View style={{ gap: spacing.xs }}>
                <Text variant="caption">Promise date</Text>
                <View style={{ flexDirection: "row", gap: spacing.xxs }}>
                  {oneTimeOffsets.map((offset) => {
                    const date = dateFromOffset(offset);
                    const selected = oneTimeOffset === offset;
                    const weekday = new Intl.DateTimeFormat("en-US", {
                      weekday: "narrow",
                    }).format(date);
                    return (
                      <Pressable
                        key={offset}
                        accessibilityRole="radio"
                        accessibilityLabel={oneTimeDateLabel(offset)}
                        accessibilityState={{ selected }}
                        onPress={() => {
                          setOneTimeOffset(offset);
                          setError("");
                        }}
                        style={({ pressed }) => ({
                          flex: 1,
                          opacity: pressed ? 0.75 : 1,
                        })}
                      >
                        <View
                          style={{
                            minHeight: 62,
                            borderRadius: radius.md,
                            borderWidth: selected ? 2 : 1,
                            borderColor: selected ? colors.text : colors.border,
                            backgroundColor: colors.surface,
                            alignItems: "center",
                            justifyContent: "center",
                            gap: spacing.xxs,
                          }}
                        >
                          <Text variant="caption">{weekday}</Text>
                          <Text variant="bodyStrong">{date.getDate()}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
                <Text variant="caption" style={{ color: colors.textSecondary }}>
                  {oneTimeDateLabel(oneTimeOffset)}. This promise will not
                  repeat.
                </Text>
              </View>
            )}
          </View>

          <Field
            label="What are you committing to?"
            value={title}
            onChangeText={setTitle}
            placeholder="Upper body, 5K run, leg day…"
            maxLength={80}
            error={
              title.length > 0 && !validTitle
                ? "Use 1–80 characters."
                : undefined
            }
          />

          <View style={{ gap: spacing.lg }}>
            <Stepper
              label="Minimum workout time"
              value={`${durationMinutes} min`}
              decreaseDisabled={durationMinutes <= 5}
              increaseDisabled={durationMinutes >= 360}
              onDecrease={() =>
                setDurationMinutes((current) => Math.max(5, current - 5))
              }
              onIncrease={() =>
                setDurationMinutes((current) => Math.min(360, current + 5))
              }
            />

            <Stepper
              label="Deadline"
              value={deadlineTime}
              decreaseDisabled={deadlineHour <= 0}
              increaseDisabled={deadlineHour >= 23}
              onDecrease={() => {
                setDeadlineHour((current) => Math.max(0, current - 1));
                setError("");
              }}
              onIncrease={() => {
                setDeadlineHour((current) => Math.min(23, current + 1));
                setError("");
              }}
            />
            {oneTimeDeadlinePassed ? (
              <Text variant="caption" style={{ color: colors.missed }}>
                Choose a later deadline or another day.
              </Text>
            ) : null}
          </View>

          <View style={{ gap: spacing.sm }}>
            <SectionHeader title="Who holds you accountable" />
            <Text variant="caption" style={{ color: colors.textSecondary }}>
              Circle promises can put a miss on The Wall. Private promises are
              visible only to you.
            </Text>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: spacing.sm,
              }}
            >
              {[
                { id: null, name: "Private" },
                ...(circlesQuery.data ?? []),
              ].map((circle) => {
                const selected = circle.id === circleId;
                return (
                  <Pressable
                    key={circle.id ?? "private"}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      circleSelectionInitialized.current = true;
                      setCircleId(circle.id);
                    }}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.75 : 1,
                      minWidth: "47%",
                      flexGrow: 1,
                    })}
                  >
                    <Card
                      style={{
                        padding: spacing.md,
                        borderWidth: selected ? 2 : 1,
                        borderColor: selected ? colors.text : colors.border,
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Text variant="bodyStrong">{circle.name}</Text>
                      <Ionicons
                        name={selected ? "radio-button-on" : "radio-button-off"}
                        size={18}
                        color={colors.text}
                      />
                    </Card>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ gap: spacing.sm }}>
            <SectionHeader title="Proof" />
            <Card
              style={{
                padding: spacing.md,
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: radius.md,
                  backgroundColor: colors.surfaceMuted,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="camera" size={21} color={colors.text} />
              </View>
              <View style={{ flex: 1, gap: spacing.xxs }}>
                <Text variant="bodyStrong">Fresh live photo</Text>
                <Text variant="caption" style={{ color: colors.textSecondary }}>
                  Camera capture only. No photo-library uploads.
                </Text>
              </View>
            </Card>
          </View>

          <View style={{ gap: spacing.sm }}>
            <SectionHeader title="Proof opens" />
            <Text variant="caption" style={{ color: colors.textSecondary }}>
              Choose how long before the deadline fresh proof becomes available.
            </Text>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: spacing.sm,
              }}
            >
              {proofWindowChoices.map((choice) => {
                const selected = choice.minutes === proofWindowMinutes;
                const locked = !planQuery.data?.isPro && choice.minutes !== 240;

                return (
                  <Pressable
                    key={choice.minutes}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, disabled: locked }}
                    onPress={() => {
                      if (locked) {
                        router.push("/paywall?source=custom_window" as never);
                        return;
                      }
                      setProofWindowMinutes(choice.minutes);
                    }}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.75 : 1,
                      width: "47%",
                    })}
                  >
                    <Card
                      style={{
                        padding: spacing.md,
                        borderWidth: selected ? 2 : 1,
                        borderColor: selected ? colors.text : colors.border,
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Text variant="bodyStrong">{choice.label}</Text>
                      <Ionicons
                        name={
                          locked
                            ? "lock-closed"
                            : selected
                              ? "radio-button-on"
                              : "radio-button-off"
                        }
                        size={18}
                        color={locked ? colors.textSecondary : colors.text}
                      />
                    </Card>
                  </Pressable>
                );
              })}
            </View>
            <Text variant="caption" style={{ color: colors.textSecondary }}>
              {effectiveRecurrenceMode === "weekly"
                ? `Proof opens at ${proofOpenTime}${
                    proofOpensPreviousDay ? " the day before" : ""
                  } for each ${deadlineTime} deadline.`
                : `${proofTiming} for the ${deadlineTime} deadline.`}
            </Text>
          </View>

          <Card style={{ borderWidth: 2, borderColor: colors.text }}>
            <Text variant="label" style={{ color: colors.textSecondary }}>
              THE PROMISE
            </Text>
            <Text variant="section">{promiseTiming}</Text>
            <Text style={{ color: colors.textSecondary }}>
              First promise: {firstPromiseLabel}
            </Text>
            <Text style={{ color: colors.textSecondary }}>
              {proofTiming} · {selectedCircle?.name ?? "Private"}
            </Text>
            <Divider />
            <Text variant="bodyStrong">{consequenceCopy}</Text>
            <Text variant="caption" style={{ color: colors.textSecondary }}>
              Redemption answers the callout. It never erases the original miss.
            </Text>
          </Card>

          {error ? <Text style={{ color: colors.missed }}>{error}</Text> : null}
          <Button
            title="Lock it in"
            loading={mutation.isPending}
            disabled={formInvalid}
            onPress={confirmCommitment}
          />
        </>
      )}
    </Screen>
  );
}
