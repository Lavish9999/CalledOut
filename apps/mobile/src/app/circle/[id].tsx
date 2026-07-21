import { Share, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";

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
import { qk } from "../../lib/query";
import { shortDateLabel } from "../../lib/date";
import { colors, spacing } from "../../theme/tokens";

function activityCopy(
  eventType: string,
  actor: string,
  payload: Record<string, unknown>,
) {
  const title =
    typeof payload.title === "string" ? payload.title : "a commitment";

  if (eventType === "proof_verified") return `${actor} verified ${title}.`;
  if (eventType === "commitment_missed") return `${actor} missed ${title}.`;
  if (eventType === "redemption_completed")
    return `${actor} completed a redemption.`;
  if (eventType === "member_joined") return `${actor} joined the circle.`;
  return `${actor} posted an update.`;
}

export default function CircleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({
    queryKey: qk.circle(id),
    queryFn: () => getCircleDetail(id),
    enabled: Boolean(id),
  });

  if (query.isLoading) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  if (query.error || !query.data) {
    return (
      <Screen>
        <Header title="Circle unavailable" />
        <EmptyState
          title="Could not load this circle"
          body={query.error?.message ?? "Please try again."}
        />
        <Button
          title="Go back"
          variant="secondary"
          onPress={() => router.back()}
        />
      </Screen>
    );
  }

  const { circle, members, inviteCode, activity } = query.data;

  return (
    <Screen>
      <Header
        eyebrow={`${circle.member_count ?? members.length}/${circle.member_limit} MEMBERS`}
        title={`${circle.icon} ${circle.name}`}
        subtitle={circle.description ?? "Private accountability circle"}
      />

      {inviteCode ? (
        <Card>
          <Text variant="label" style={{ color: colors.textSecondary }}>
            INVITE CODE
          </Text>
          <Text variant="title">{inviteCode}</Text>
          <Button
            title="Share invite"
            onPress={() =>
              Share.share({
                message: `Join my CalledOut circle “${circle.name}” with code ${inviteCode}.`,
              })
            }
          />
        </Card>
      ) : null}

      <SectionHeader title={`Members · ${members.length}`} />
      <Card style={{ gap: 0 }}>
        {members.map((member, index) => (
          <View key={member.id}>
            {index ? <Divider /> : null}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: spacing.sm,
                gap: spacing.md,
              }}
            >
              <View style={{ flex: 1, gap: spacing.xxs }}>
                <Text variant="bodyStrong">{member.profile.display_name}</Text>
                <Text variant="caption" style={{ color: colors.textSecondary }}>
                  @{member.profile.username}
                </Text>
              </View>
              <Text variant="label">{member.role.toUpperCase()}</Text>
            </View>
          </View>
        ))}
      </Card>

      <SectionHeader title="Recent activity" />
      {activity.length ? (
        <Card style={{ gap: 0 }}>
          {activity.map((event, index) => (
            <View key={event.id}>
              {index ? <Divider /> : null}
              <View style={{ paddingVertical: spacing.sm, gap: spacing.xxs }}>
                <Text>
                  {activityCopy(
                    event.event_type,
                    event.actor?.display_name ?? "A member",
                    event.payload,
                  )}
                </Text>
                <Text variant="caption" style={{ color: colors.textSecondary }}>
                  {shortDateLabel(event.created_at)}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      ) : (
        <EmptyState
          title="No activity yet"
          body="Verified workouts, misses, and redemptions will appear here."
        />
      )}

      <Button title="Done" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
