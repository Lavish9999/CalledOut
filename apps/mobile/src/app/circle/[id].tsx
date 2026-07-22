import { useCallback, useMemo, useState } from "react";
import { Pressable, Share, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";

import {
  Button,
  Card,
  Divider,
  EmptyState,
  Header,
  Loading,
  Screen,
  SectionHeader,
  Text,
} from "../../components/ui";
import { getCircleDetail } from "../../features/circles/api";
import { rankCircleMembers } from "../../features/circles/metrics";
import { qk } from "../../lib/query";
import { shortDateLabel, timeLabel } from "../../lib/date";
import { colors, radius, spacing } from "../../theme/tokens";
import type {
  ActivityEvent,
  CircleMember,
  CircleUpcomingCommitment,
} from "../../types/domain";

type CircleTab = "overview" | "members" | "activity";

type GroupedActivity = {
  id: string;
  copy: string;
  createdAt: string;
  count: number;
};

type UpcomingGroup = {
  commitment: CircleUpcomingCommitment;
  count: number;
};

const MIN_LEADERBOARD_RESULTS = 3;

function activityCopy(
  eventType: string,
  actor: string,
  payload: Record<string, unknown>,
) {
  const title =
    typeof payload.title === "string" ? payload.title : "a commitment";

  if (eventType === "proof_verified") return `${actor} kept ${title}.`;
  if (eventType === "commitment_missed") return `${actor} missed ${title}.`;
  if (eventType === "redemption_completed")
    return `${actor} answered a callout.`;
  if (eventType === "member_joined") return `${actor} joined the circle.`;
  return `${actor} posted an update.`;
}

function localDateKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function groupActivity(activity: ActivityEvent[]): GroupedActivity[] {
  const groups = new Map<string, GroupedActivity>();

  for (const event of activity) {
    const copy = activityCopy(
      event.event_type,
      event.actor?.display_name ?? "A member",
      event.payload,
    );
    const key = `${copy}|${localDateKey(event.created_at)}`;
    const existing = groups.get(key);

    if (existing) {
      existing.count += 1;
      continue;
    }

    groups.set(key, {
      id: event.id,
      copy,
      createdAt: event.created_at,
      count: 1,
    });
  }

  return [...groups.values()];
}

function groupUpcoming(
  commitments: CircleUpcomingCommitment[],
): UpcomingGroup[] {
  const groups = new Map<string, UpcomingGroup>();

  for (const commitment of commitments) {
    const key = [
      commitment.user_id,
      commitment.title.trim().toLowerCase(),
      commitment.deadline_at,
    ].join("|");
    const existing = groups.get(key);

    if (existing) {
      existing.count += 1;
      continue;
    }

    groups.set(key, { commitment, count: 1 });
  }

  return [...groups.values()];
}

function CircleTabs({
  value,
  onChange,
}: {
  value: CircleTab;
  onChange: (next: CircleTab) => void;
}) {
  const tabs: { key: CircleTab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "members", label: "Members" },
    { key: "activity", label: "Activity" },
  ];

  return (
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      {tabs.map((tab) => {
        const active = value === tab.key;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="button"
            onPress={() => onChange(tab.key)}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 44,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: active ? colors.dark : colors.border,
              backgroundColor: active ? colors.dark : colors.surface,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.92 : 1,
            })}
          >
            <Text
              variant="bodyStrong"
              style={{ color: active ? colors.surface : colors.text }}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MetricCell({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={{ flex: 1, gap: spacing.xxs }}>
      <Text variant="section">{value}</Text>
      <Text variant="caption" style={{ color: colors.textSecondary }}>
        {label}
      </Text>
    </View>
  );
}

function MemberStanding({ member, rank }: { member: CircleMember; rank: number }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: radius.md,
          backgroundColor: rank === 1 ? colors.dark : colors.surfaceMuted,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          variant="bodyStrong"
          style={{ color: rank === 1 ? colors.surface : colors.text }}
        >
          #{rank}
        </Text>
      </View>
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <Text variant="bodyStrong">{member.profile.display_name}</Text>
        <Text variant="caption" style={{ color: colors.textSecondary }}>
          @{member.profile.username} · {member.completed_count ?? 0}/
          {member.scheduled_count ?? 0} kept
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: spacing.xxs }}>
        <Text variant="section">{member.circle_completion_rate ?? 0}%</Text>
        <Text variant="caption" style={{ color: colors.textSecondary }}>
          30-day
        </Text>
      </View>
    </View>
  );
}

function MemberBaseline({ member }: { member: CircleMember }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceMuted,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="flag-outline" size={20} color={colors.text} />
      </View>
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <Text variant="bodyStrong">Current baseline</Text>
        <Text variant="caption" style={{ color: colors.textSecondary }}>
          {member.profile.display_name} · {member.completed_count ?? 0}/
          {member.scheduled_count ?? 0} kept
        </Text>
      </View>
      <Text variant="section">{member.circle_completion_rate ?? 0}%</Text>
    </View>
  );
}

function ActivityList({ activity }: { activity: ActivityEvent[] }) {
  const grouped = groupActivity(activity);

  if (!grouped.length) {
    return (
      <EmptyState
        title="No activity yet"
        body="Verified workouts, misses, redemptions, and new members will appear here."
      />
    );
  }

  return (
    <Card style={{ gap: 0 }}>
      {grouped.map((event, index) => (
        <View key={event.id}>
          {index ? <Divider /> : null}
          <View style={{ paddingVertical: spacing.sm, gap: spacing.xxs }}>
            <Text>
              {event.copy}
              {event.count > 1 ? ` · ${event.count} times` : ""}
            </Text>
            <Text variant="caption" style={{ color: colors.textSecondary }}>
              {shortDateLabel(event.createdAt)} at {timeLabel(event.createdAt)}
            </Text>
          </View>
        </View>
      ))}
    </Card>
  );
}

export default function CircleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [inviteRevealed, setInviteRevealed] = useState(false);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [tab, setTab] = useState<CircleTab>("overview");
  const query = useQuery({
    queryKey: qk.circle(id),
    queryFn: () => getCircleDetail(id),
    enabled: Boolean(id),
  });

  const refetch = query.refetch;
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const visibleActivity = useMemo(
    () =>
      (query.data?.activity ?? []).filter(
        (event) =>
          !(
            event.event_type === "proof_verified" &&
            event.payload.title === "Redemption workout"
          ),
      ),
    [query.data?.activity],
  );

  const standings = useMemo(
    () => rankCircleMembers(query.data?.members ?? []),
    [query.data?.members],
  );

  const qualifyingStandings = useMemo(
    () =>
      standings.filter(
        (member) => (member.scheduled_count ?? 0) >= MIN_LEADERBOARD_RESULTS,
      ),
    [standings],
  );

  const upcomingGroups = useMemo(
    () => groupUpcoming(query.data?.upcoming ?? []),
    [query.data?.upcoming],
  );

  if (query.isLoading) {
    return (
      <Screen>
        <Header title="Circle" backLabel="Circles" onBack={router.back} />
        <Loading />
      </Screen>
    );
  }

  if (query.error || !query.data) {
    return (
      <Screen>
        <Header
          title="Circle unavailable"
          backLabel="Circles"
          onBack={router.back}
        />
        <EmptyState
          title="Could not load this circle"
          body={query.error?.message ?? "Please try again."}
          action={<Button title="Try again" onPress={() => query.refetch()} />}
        />
      </Screen>
    );
  }

  const { circle, members, inviteCode, upcoming, stats, myRole } = query.data;
  const canManage = myRole === "owner" || myRole === "moderator";
  const memberCount = circle.member_count ?? members.length;
  const memberWord = memberCount === 1 ? "MEMBER" : "MEMBERS";
  const maskedInvite = inviteCode
    ? `${inviteCode.slice(0, 4)}${"•".repeat(Math.max(4, inviteCode.length - 4))}`
    : null;
  const shownUpcomingGroups = showAllUpcoming
    ? upcomingGroups
    : upcomingGroups.slice(0, 5);
  const shownPromiseCount = shownUpcomingGroups.reduce(
    (sum, group) => sum + group.count,
    0,
  );
  const baselineMember = qualifyingStandings[0] ?? standings[0] ?? null;

  const shareInvite = async () => {
    if (!inviteCode) return;
    const url = Linking.createURL("/circle/join", {
      queryParams: { code: inviteCode },
    });

    await Share.share({
      message: `Join my CalledOut circle “${circle.name}.” Use code ${inviteCode} or open ${url}`,
    });
  };

  return (
    <Screen>
      <Header
        eyebrow={`${memberCount}/${circle.member_limit} ${memberWord} · ${myRole.toUpperCase()}`}
        title={`${circle.icon} ${circle.name}`}
        subtitle={circle.description ?? "Private accountability circle"}
        backLabel="Circles"
        onBack={router.back}
        action={
          canManage ? (
            <Button
              title="Manage"
              compact
              variant="ghost"
              onPress={() => router.push(`/circle/manage?id=${circle.id}` as never)}
            />
          ) : undefined
        }
      />

      <Card
        style={{
          backgroundColor: colors.surfaceMuted,
          paddingVertical: spacing.md,
          gap: spacing.xs,
        }}
      >
        <Text variant="bodyStrong">Misses are visible to this circle.</Text>
        <Text variant="caption" style={{ color: colors.textSecondary }}>
          Redemption answers the callout. It never removes the original miss.
        </Text>
      </Card>

      <CircleTabs value={tab} onChange={setTab} />

      {tab === "overview" ? (
        <>
          <SectionHeader title="Last 30 days" />
          <Card>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <MetricCell
                value={`${stats.completionRateLast30}%`}
                label="circle consistency"
              />
              <MetricCell value={stats.missedLast30} label="misses" />
              <MetricCell value={stats.openCallouts} label="open callouts" />
            </View>
          </Card>

          <SectionHeader title="Friendly competition" />
          <Card style={{ gap: 0 }}>
            <View style={{ paddingBottom: spacing.sm, gap: spacing.xxs }}>
              <Text variant="bodyStrong">30-day leaderboard</Text>
              <Text variant="caption" style={{ color: colors.textSecondary }}>
                Members qualify after {MIN_LEADERBOARD_RESULTS} resolved promises.
              </Text>
            </View>

            {qualifyingStandings.length >= 2 ? (
              qualifyingStandings.slice(0, 3).map((member, index) => (
                <View key={member.id}>
                  {index ? <Divider /> : null}
                  <MemberStanding member={member} rank={index + 1} />
                </View>
              ))
            ) : (
              <>
                <Text variant="bodyStrong">
                  Invite one more qualifying member to start the leaderboard.
                </Text>
                <Text
                  variant="caption"
                  style={{ color: colors.textSecondary, paddingBottom: spacing.sm }}
                >
                  Friendly competition begins when at least two members have enough results to compare.
                </Text>
                {baselineMember ? <MemberBaseline member={baselineMember} /> : null}
              </>
            )}

            <Button
              title="View all members"
              variant="secondary"
              onPress={() => setTab("members")}
            />
            <Button
              title="Open Circle Wall"
              onPress={() =>
                router.push({
                  pathname: "/wall",
                  params: {
                    circleId: circle.id,
                    circleName: circle.name,
                  },
                } as never)
              }
            />
          </Card>

          <SectionHeader title={`Upcoming promises · ${stats.upcomingCount}`} />
          {upcoming.length ? (
            <>
              <Card style={{ gap: 0 }}>
                {shownUpcomingGroups.map((group, index) => {
                  const { commitment } = group;
                  return (
                    <View key={commitment.id}>
                      {index ? <Divider /> : null}
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: spacing.md,
                          paddingVertical: spacing.sm,
                        }}
                      >
                        <View style={{ flex: 1, gap: spacing.xxs }}>
                          <Text variant="bodyStrong">{commitment.title}</Text>
                          <Text
                            variant="caption"
                            style={{ color: colors.textSecondary }}
                          >
                            {commitment.profile?.display_name ?? "A member"}
                          </Text>
                          {group.count > 1 ? (
                            <Text
                              variant="caption"
                              style={{ color: colors.textSecondary }}
                            >
                              {group.count} matching promises
                            </Text>
                          ) : null}
                        </View>
                        <View style={{ alignItems: "flex-end", gap: spacing.xxs }}>
                          <Text variant="bodyStrong">
                            {shortDateLabel(commitment.deadline_at)}
                          </Text>
                          <Text
                            variant="caption"
                            style={{ color: colors.textSecondary }}
                          >
                            {timeLabel(commitment.deadline_at)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </Card>

              {stats.upcomingCount > 5 ? (
                <>
                  <Text variant="caption" style={{ color: colors.textSecondary }}>
                    Showing {shownPromiseCount} of {stats.upcomingCount} upcoming promises.
                  </Text>
                  <Button
                    title={showAllUpcoming ? "Show next 5" : "View all upcoming promises"}
                    variant="secondary"
                    onPress={() => setShowAllUpcoming((current) => !current)}
                  />
                </>
              ) : null}
            </>
          ) : (
            <EmptyState
              title="No upcoming promises"
              body="Members can attach a new promise to this circle from Today."
            />
          )}

          <SectionHeader title="Circle rules" />
          <Card>
            <Text style={{ color: circle.rules ? colors.text : colors.textSecondary }}>
              {circle.rules || "No extra rules have been added. The circle agreement still applies."}
            </Text>
          </Card>

          {inviteCode ? (
            <>
              <SectionHeader title="Grow the circle" />
              <Card>
                <Text variant="bodyStrong">Invite somebody who will notice</Text>
                <Text style={{ color: colors.textSecondary }}>
                  Codes are private and can be refreshed from Manage Circle.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    inviteRevealed ? "Hide invite code" : "Reveal invite code"
                  }
                  onPress={() => setInviteRevealed((current) => !current)}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.7 : 1,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: radius.md,
                    padding: spacing.md,
                  })}
                >
                  <Text variant="title">
                    {inviteRevealed ? inviteCode : maskedInvite}
                  </Text>
                  <Text variant="caption" style={{ color: colors.textSecondary }}>
                    {inviteRevealed ? "Tap to hide" : "Tap to reveal"}
                  </Text>
                </Pressable>
                <Button title="Share invite" onPress={shareInvite} />
              </Card>
            </>
          ) : null}

          <SectionHeader title="Recent activity" />
          <ActivityList activity={visibleActivity.slice(0, 12)} />
          {visibleActivity.length > 12 ? (
            <Button
              title="See all activity"
              variant="secondary"
              onPress={() => setTab("activity")}
            />
          ) : null}
        </>
      ) : null}

      {tab === "members" ? (
        <>
          <SectionHeader title={`Members · ${members.length}`} />
          <Card style={{ gap: 0 }}>
            {standings.map((member, index) => (
              <View key={member.id}>
                {index ? <Divider /> : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: "/wall/[userId]",
                      params: {
                        userId: member.user_id,
                        circleId: circle.id,
                      },
                    } as never)
                  }
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.md,
                    paddingVertical: spacing.md,
                    opacity: pressed ? 0.72 : 1,
                  })}
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
                    <Text variant="bodyStrong">
                      {member.profile.display_name.slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1, gap: spacing.xxs }}>
                    <Text variant="bodyStrong">{member.profile.display_name}</Text>
                    <Text variant="caption" style={{ color: colors.textSecondary }}>
                      @{member.profile.username} · {member.role}
                    </Text>
                    <Text variant="caption" style={{ color: colors.textSecondary }}>
                      {member.completed_count ?? 0}/{member.scheduled_count ?? 0} kept · {member.missed_count ?? 0} missed
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: spacing.xxs }}>
                    <Text variant="section">{member.circle_completion_rate ?? 0}%</Text>
                    <Text variant="caption" style={{ color: colors.textSecondary }}>
                      30-day
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.textSecondary}
                  />
                </Pressable>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {tab === "activity" ? (
        <>
          <SectionHeader title="Circle activity" />
          <ActivityList activity={visibleActivity} />
        </>
      ) : null}
    </Screen>
  );
}
