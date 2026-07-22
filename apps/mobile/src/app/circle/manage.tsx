import { useState } from "react";
import { Alert, Pressable, Share, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { useMutation, useQuery } from "@tanstack/react-query";

import {
  Button,
  Card,
  Divider,
  EmptyState,
  Field,
  Header,
  Loading,
  Screen,
  SectionHeader,
  Text,
} from "../../components/ui";
import {
  deleteCircle,
  getCircleDetail,
  leaveCircle,
  removeCircleMember,
  rotateCircleInvite,
  setCircleMemberRole,
  updateCircle,
} from "../../features/circles/api";
import { useSession } from "../../providers/session";
import { queryClient, qk } from "../../lib/query";
import { colors, radius, spacing } from "../../theme/tokens";
import type { CircleDetail } from "../../types/domain";

const ICONS = ["◉", "⚡", "🏋️", "🔥", "🏃", "🎯"];

export default function ManageCircleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const query = useQuery({
    queryKey: qk.circle(id),
    queryFn: () => getCircleDetail(id),
    enabled: Boolean(id),
  });

  if (query.isLoading) {
    return (
      <Screen>
        <Header title="Manage circle" backLabel="Circle" onBack={router.back} />
        <Loading />
      </Screen>
    );
  }

  if (query.error || !query.data) {
    return (
      <Screen>
        <Header title="Manage circle" backLabel="Circle" onBack={router.back} />
        <EmptyState
          title="Management unavailable"
          body={query.error?.message ?? "Please try again."}
        />
      </Screen>
    );
  }

  const data = query.data;
  const formKey = [
    data.circle.id,
    data.circle.name,
    data.circle.description ?? "",
    data.circle.rules ?? "",
    data.circle.icon,
  ].join(":");

  return (
    <ManageCircleContent
      key={formKey}
      id={id}
      data={data}
      sessionUserId={session?.user.id}
    />
  );
}

function ManageCircleContent({
  id,
  data,
  sessionUserId,
}: {
  id: string;
  data: CircleDetail;
  sessionUserId?: string;
}) {
  const [name, setName] = useState(data.circle.name);
  const [description, setDescription] = useState(
    data.circle.description ?? "",
  );
  const [rules, setRules] = useState(data.circle.rules ?? "");
  const [icon, setIcon] = useState(data.circle.icon);
  const [inviteRevealed, setInviteRevealed] = useState(false);

  const refreshCircle = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.circle(id) }),
      queryClient.invalidateQueries({ queryKey: qk.circles }),
      queryClient.invalidateQueries({ queryKey: qk.plan }),
    ]);
  };

  const updateMutation = useMutation({
    mutationFn: () =>
      updateCircle({
        circleId: id,
        name: name.trim(),
        description: description.trim(),
        rules: rules.trim(),
        icon,
      }),
    onSuccess: refreshCircle,
  });

  const inviteMutation = useMutation({
    mutationFn: () => rotateCircleInvite(id),
    onSuccess: refreshCircle,
  });

  const leaveMutation = useMutation({
    mutationFn: () => leaveCircle(id),
    onSuccess: async () => {
      await refreshCircle();
      router.replace("/circles" as never);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCircle(id),
    onSuccess: async () => {
      await refreshCircle();
      router.replace("/circles" as never);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeCircleMember(id, userId),
    onSuccess: refreshCircle,
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: "member" | "moderator" }) =>
      setCircleMemberRole(id, userId, role),
    onSuccess: refreshCircle,
  });

  const { circle, members, inviteCode, myRole } = data;
  const maskedInvite = inviteCode
    ? `${inviteCode.slice(0, 4)}${"•".repeat(Math.max(4, inviteCode.length - 4))}`
    : null;

  const shareInvite = async () => {
    if (!inviteCode) return;
    const url = Linking.createURL("/circle/join", {
      queryParams: { code: inviteCode },
    });

    await Share.share({
      message: `Join my CalledOut circle “${circle.name}.” Use code ${inviteCode} or open ${url}`,
    });
  };
  const isOwner = myRole === "owner";
  const isModerator = myRole === "moderator";
  const canEdit = isOwner || isModerator;
  const error =
    updateMutation.error ??
    inviteMutation.error ??
    leaveMutation.error ??
    deleteMutation.error ??
    removeMutation.error ??
    roleMutation.error;

  return (
    <Screen>
      <Header
        eyebrow={myRole.toUpperCase()}
        title="Manage circle"
        subtitle="Control the agreement, invitations, and membership without weakening past accountability records."
        backLabel={circle.name}
        onBack={router.back}
      />

      {canEdit ? (
        <>
          <SectionHeader title="Circle identity" />
          <View style={{ gap: spacing.sm }}>
            <Text variant="caption">Circle icon</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {ICONS.map((option) => {
                const active = icon === option;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    onPress={() => setIcon(option)}
                    style={({ pressed }) => ({
                      width: 52,
                      height: 52,
                      borderRadius: radius.md,
                      borderWidth: active ? 2 : 1,
                      borderColor: active ? colors.dark : colors.border,
                      backgroundColor: colors.surface,
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: pressed ? 0.75 : 1,
                    })}
                  >
                    <Text variant="section">{option}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Field
            label="Circle name"
            value={name}
            onChangeText={setName}
            maxLength={60}
          />
          <Field
            label="Description"
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={300}
          />
          <Field
            label="Circle rules"
            placeholder="Example: Live proof only. Callouts stay respectful."
            value={rules}
            onChangeText={setRules}
            multiline
            maxLength={1000}
          />
          <Button
            title="Save circle details"
            loading={updateMutation.isPending}
            disabled={name.trim().length < 2}
            onPress={() => updateMutation.mutate()}
          />

          <SectionHeader title="Private invite" />
          <Card>
            <Text variant="bodyStrong">Invite code</Text>
            <Text style={{ color: colors.textSecondary }}>
              Keep this code private. Refreshing it revokes the old code immediately without removing existing members.
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                inviteRevealed ? "Hide invite code" : "Reveal invite code"
              }
              disabled={!inviteCode}
              onPress={() => setInviteRevealed((current) => !current)}
              style={({ pressed }) => ({
                opacity: !inviteCode ? 0.45 : pressed ? 0.7 : 1,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: radius.md,
                padding: spacing.md,
                gap: spacing.xxs,
              })}
            >
              <Text variant="title">
                {inviteCode
                  ? inviteRevealed
                    ? inviteCode
                    : maskedInvite
                  : "Unavailable"}
              </Text>
              <Text variant="caption" style={{ color: colors.textSecondary }}>
                {inviteCode
                  ? inviteRevealed
                    ? "Tap to hide"
                    : "Tap to reveal"
                  : "Create a new code to invite members"}
              </Text>
            </Pressable>

            <Button
              title="Share invite"
              disabled={!inviteCode}
              onPress={shareInvite}
            />
            <Button
              title="Refresh invite code"
              variant="secondary"
              loading={inviteMutation.isPending}
              onPress={() =>
                Alert.alert(
                  "Refresh invite code?",
                  "The current code will stop working immediately.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Refresh",
                      onPress: () => inviteMutation.mutate(),
                    },
                  ],
                )
              }
            />
          </Card>
        </>
      ) : null}

      <SectionHeader title={`Members · ${members.length}`} />
      <Card style={{ gap: 0 }}>
        {members.map((member, index) => {
          const isSelf = member.user_id === sessionUserId;
          const canRemove =
            !isSelf &&
            member.role !== "owner" &&
            (isOwner || (isModerator && member.role === "member"));

          return (
            <View key={member.id}>
              {index ? <Divider /> : null}
              <View style={{ paddingVertical: spacing.md, gap: spacing.sm }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.md,
                  }}
                >
                  <View style={{ flex: 1, gap: spacing.xxs }}>
                    <Text variant="bodyStrong">
                      {member.profile.display_name}{isSelf ? " · You" : ""}
                    </Text>
                    <Text variant="caption" style={{ color: colors.textSecondary }}>
                      @{member.profile.username} · {member.role}
                    </Text>
                  </View>
                  <Text variant="bodyStrong">
                    {member.circle_completion_rate ?? 0}%
                  </Text>
                </View>

                {isOwner && !isSelf && member.role !== "owner" ? (
                  <Button
                    title={
                      member.role === "moderator"
                        ? "Remove moderator role"
                        : "Make moderator"
                    }
                    variant="secondary"
                    compact
                    loading={roleMutation.isPending}
                    onPress={() =>
                      roleMutation.mutate({
                        userId: member.user_id,
                        role: member.role === "moderator" ? "member" : "moderator",
                      })
                    }
                  />
                ) : null}

                {canRemove ? (
                  <Button
                    title="Remove from circle"
                    variant="ghost"
                    compact
                    loading={removeMutation.isPending}
                    onPress={() =>
                      Alert.alert(
                        `Remove ${member.profile.display_name}?`,
                        "Future promises attached to this circle will become private. Existing misses remain part of the historical record.",
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Remove",
                            style: "destructive",
                            onPress: () => removeMutation.mutate(member.user_id),
                          },
                        ],
                      )
                    }
                  />
                ) : null}
              </View>
            </View>
          );
        })}
      </Card>

      {error ? <Text style={{ color: colors.missed }}>{error.message}</Text> : null}

      <SectionHeader title="Membership" />
      {isOwner ? (
        <Card>
          <Text variant="bodyStrong">Delete circle</Text>
          <Text style={{ color: colors.textSecondary }}>
            The circle disappears for every member. Future promises become private, while completed and missed records remain in account history.
          </Text>
          <Button
            title="Delete circle"
            variant="danger"
            loading={deleteMutation.isPending}
            onPress={() =>
              Alert.alert(
                `Delete ${circle.name}?`,
                "This removes the circle for every member and cannot be undone.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete circle",
                    style: "destructive",
                    onPress: () => deleteMutation.mutate(),
                  },
                ],
              )
            }
          />
        </Card>
      ) : (
        <Card>
          <Text variant="bodyStrong">Leave circle</Text>
          <Text style={{ color: colors.textSecondary }}>
            Future promises attached to this circle become private. Promises whose proof window already opened remain accountable to the circle.
          </Text>
          <Button
            title="Leave circle"
            variant="danger"
            loading={leaveMutation.isPending}
            onPress={() =>
              Alert.alert(
                `Leave ${circle.name}?`,
                "You will lose access to the circle, its activity, and its Wall.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Leave circle",
                    style: "destructive",
                    onPress: () => leaveMutation.mutate(),
                  },
                ],
              )
            }
          />
        </Card>
      )}
    </Screen>
  );
}
