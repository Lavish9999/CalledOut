import { env } from "./env";

export type AnalyticsEvent =
  | "onboarding_started"
  | "onboarding_completed"
  | "account_created"
  | "circle_created"
  | "circle_joined"
  | "invite_shared"
  | "commitment_created"
  | "commitment_edited"
  | "proof_started"
  | "proof_submitted"
  | "proof_verified"
  | "proof_rejected"
  | "proof_sent_to_review"
  | "commitment_missed"
  | "redemption_started"
  | "redemption_completed"
  | "grace_pass_used"
  | "wall_viewed"
  | "reaction_sent"
  | "report_submitted"
  | "paywall_viewed"
  | "subscription_purchase_started"
  | "subscription_purchase_cancelled"
  | "subscription_purchase_failed"
  | "subscription_restore_started"
  | "trial_started"
  | "subscription_started"
  | "subscription_cancelled";
type Props = Record<string, string | number | boolean | null | undefined>;
let distinctId = "anonymous";

async function posthog(event: string, properties: Props = {}) {
  if (!env.posthogKey) return;
  const safe = Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined),
  );
  await fetch(`${env.posthogHost.replace(/\/$/, "")}/capture/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: env.posthogKey,
      event,
      properties: { distinct_id: distinctId, ...safe },
    }),
  }).catch(() => {});
}

export const analytics = {
  capture(event: AnalyticsEvent, properties: Props = {}) {
    if (__DEV__) console.info("[analytics]", event, properties);
    void posthog(event, properties);
  },
  identify(userId: string) {
    distinctId = userId;
    void posthog("$identify", { $anon_distinct_id: "anonymous" });
  },
  reset() {
    distinctId = "anonymous";
  },
  performance(name: string, durationMs: number, properties: Props = {}) {
    void posthog("performance_measurement", {
      name,
      duration_ms: Math.round(durationMs),
      ...properties,
    });
  },
};
