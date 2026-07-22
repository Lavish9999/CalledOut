import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";

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
import { getCommitmentDetail } from "../../features/commitments/api";
import { dateLabel, timeLabel } from "../../lib/date";
import { qk } from "../../lib/query";
import { colors } from "../../theme/tokens";

function proofResultCopy(status: string) {
  if (status === "verified") {
    return "Fresh proof passed the automated checks. Promise kept.";
  }
  if (status === "circle_review") {
    return "Automated checks were not decisive. The accountability circle can review the capture.";
  }
  if (status === "rejected" || status === "more_proof_required") {
    return "This capture did not pass enough checks. Fresh proof can be retaken before the deadline.";
  }
  return "The fresh capture is still being checked.";
}

export default function CommitmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [openedAt] = useState(() => new Date());
  const query = useQuery({
    queryKey: qk.commitment(id),
    queryFn: () => getCommitmentDetail(id),
    enabled: Boolean(id),
  });

  if (query.isLoading) {
    return (
      <Screen>
        <Header title="Commitment" backLabel="Today" onBack={router.back} />
        <Loading />
      </Screen>
    );
  }

  if (query.error || !query.data) {
    return (
      <Screen>
        <Header title="Commitment" backLabel="Today" onBack={router.back} />
        <EmptyState
          title="Could not load this commitment"
          body={query.error?.message ?? "Please try again."}
        />
      </Screen>
    );
  }

  const item = query.data;

  return (
    <Screen>
      <Header
        title={item.title}
        subtitle={`${dateLabel(item.deadline_at)} · ${timeLabel(item.deadline_at)}`}
        backLabel="Today"
        onBack={router.back}
      />

      <Card>
        <StatusPill status={item.status} />
        <Text variant="section">{item.minimum_duration_minutes} minutes</Text>
        <Text style={{ color: colors.textSecondary }}>
          {item.circle?.name ?? "Private commitment"} ·{" "}
          {item.proof_method.replaceAll("_", " ")}
        </Text>
        {item.verified_at ? (
          <Text variant="bodyStrong" style={{ color: colors.verified }}>
            Verified at {timeLabel(item.verified_at)}
          </Text>
        ) : null}
        {item.missed_at ? (
          <Text variant="bodyStrong" style={{ color: colors.missed }}>
            Missed at {timeLabel(item.missed_at)}
          </Text>
        ) : null}
      </Card>

      {item.proof ? (
        <Card>
          <Text variant="label" style={{ color: colors.textSecondary }}>
            PROOF RESULT
          </Text>
          <Text variant="section">
            {item.proof.status === "circle_review"
              ? "Circle review"
              : item.proof.status === "rejected"
                ? "More proof needed"
                : item.proof.status.replaceAll("_", " ")}
          </Text>
          <Text style={{ color: colors.textSecondary }}>
            {proofResultCopy(item.proof.status)}
          </Text>
          <Text variant="caption" style={{ color: colors.textSecondary }}>
            Captured {dateLabel(item.proof.captured_at)} at{" "}
            {timeLabel(item.proof.captured_at)}
          </Text>
          {item.status === "rejected" &&
          new Date(item.deadline_at).getTime() > openedAt.getTime() ? (
            <Button
              title="Retake fresh proof"
              onPress={() =>
                router.push({
                  pathname: "/proof/capture",
                  params: { commitmentId: item.id },
                } as never)
              }
            />
          ) : null}
        </Card>
      ) : null}

      {item.redemption ? (
        <Card>
          <Text variant="label" style={{ color: colors.textSecondary }}>
            REDEMPTION
          </Text>
          <StatusPill status={item.redemption.status} />
          {item.redemption.completed_at ? (
            <Text variant="bodyStrong" style={{ color: colors.verified }}>
              Completed {dateLabel(item.redemption.completed_at)} at{" "}
              {timeLabel(item.redemption.completed_at)}
            </Text>
          ) : (
            <Text style={{ color: colors.textSecondary }}>
              Available until {dateLabel(item.redemption.deadline_at)} at{" "}
              {timeLabel(item.redemption.deadline_at)}
            </Text>
          )}
        </Card>
      ) : null}
    </Screen>
  );
}
