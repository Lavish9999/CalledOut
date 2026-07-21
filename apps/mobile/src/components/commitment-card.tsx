import { View } from "react-native";
import { router } from "expo-router";

import { Button, Card, StatusPill, Text } from "./ui";
import { colors, spacing } from "../theme/tokens";
import type {
  Commitment,
  RedemptionLink,
  RedemptionStatus,
} from "../types/domain";
import { deadlineLabel, timeLabel } from "../lib/date";

const actionableStatuses = new Set(["proof_window_open", "upcoming"]);
const processingStatuses = new Set(["proof_submitted", "under_review"]);

export function CommitmentCard({ item }: { item: Commitment }) {
  const actionable = actionableStatuses.has(item.status);
  const processing = processingStatuses.has(item.status);

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
            Due {timeLabel(item.deadline_at)} · {item.minimum_duration_minutes}{" "}
            min
          </Text>
        </View>
        <StatusPill status={item.status} />
      </View>

      {item.status === "verified" ? (
        <Text variant="bodyStrong" style={{ color: colors.verified }}>
          Verified at {item.verified_at ? timeLabel(item.verified_at) : "—"}
        </Text>
      ) : processing ? (
        <Text style={{ color: colors.textSecondary }}>
          Proof received. Verification is in progress.
        </Text>
      ) : actionable ? (
        <>
          <Text variant="display">{deadlineLabel(item.deadline_at)}</Text>
          <Text style={{ color: colors.textSecondary }}>
            remaining · {item.circle?.name ?? "Private commitment"}
          </Text>
          <Button
            title="Submit proof"
            onPress={() =>
              router.push({
                pathname: "/proof/capture",
                params: { commitmentId: item.id },
              } as never)
            }
          />
        </>
      ) : item.status === "missed" ? (
        <>
          <Text>You missed this commitment.</Text>
          <Button
            title="Start redemption"
            variant="danger"
            onPress={() => router.push(`/redemption/${item.id}` as never)}
          />
        </>
      ) : null}
    </Card>
  );
}

export function RedemptionJourneyCard({
  source,
  redemption,
  redemptionCommitment,
}: {
  source: Commitment;
  redemption: RedemptionLink;
  redemptionCommitment?: Commitment;
}) {
  const status: RedemptionStatus = redemption.status;
  const completed = status === "completed" || source.status === "redeemed";
  const inProgress = status === "in_progress";
  const available = status === "available";

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
          <Text variant="section">{source.title}</Text>
          <Text style={{ color: colors.textSecondary }}>
            Missed at{" "}
            {source.missed_at
              ? timeLabel(source.missed_at)
              : timeLabel(source.deadline_at)}
          </Text>
        </View>
        <StatusPill
          status={completed ? "redeemed" : inProgress ? "redeeming" : status}
        />
      </View>

      {completed ? (
        <>
          <Text variant="bodyStrong" style={{ color: colors.verified }}>
            Redemption completed
          </Text>
          <Text style={{ color: colors.textSecondary }}>
            The original miss remains recorded, but you answered the callout.
          </Text>
        </>
      ) : inProgress && redemptionCommitment ? (
        <>
          <Text variant="bodyStrong">Redemption workout</Text>
          <Text style={{ color: colors.textSecondary }}>
            {redemptionCommitment.minimum_duration_minutes} min · due{" "}
            {timeLabel(redemptionCommitment.deadline_at)}
          </Text>
          {processingStatuses.has(redemptionCommitment.status) ? (
            <Text style={{ color: colors.textSecondary }}>
              Redemption proof is being checked.
            </Text>
          ) : (
            <Button
              title="Submit redemption proof"
              onPress={() =>
                router.push({
                  pathname: "/proof/capture",
                  params: { commitmentId: redemptionCommitment.id },
                } as never)
              }
            />
          )}
        </>
      ) : available ? (
        <>
          <Text style={{ color: colors.textSecondary }}>
            Redemption is available until {timeLabel(redemption.deadline_at)}.
          </Text>
          <Button
            title="Start redemption"
            variant="danger"
            onPress={() => router.push(`/redemption/${source.id}` as never)}
          />
        </>
      ) : (
        <Text style={{ color: colors.textSecondary }}>
          This redemption is no longer available.
        </Text>
      )}
    </Card>
  );
}

export function CompletedCommitmentRow({ item }: { item: Commitment }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <Text variant="bodyStrong">{item.title}</Text>
        <Text variant="caption" style={{ color: colors.textSecondary }}>
          {item.status === "verified" && item.verified_at
            ? `Verified at ${timeLabel(item.verified_at)}`
            : item.status.replaceAll("_", " ")}
        </Text>
      </View>
      <StatusPill status={item.status} />
    </View>
  );
}
