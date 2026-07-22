import { router, useLocalSearchParams } from "expo-router";

import {
  Button,
  Card,
  Header,
  Screen,
  SectionHeader,
  Text,
} from "../../../components/ui";
import { useSession } from "../../../providers/session";
import { colors, spacing } from "../../../theme/tokens";

type DocumentKey = "privacy" | "terms" | "community";

type LegalDocument = {
  eyebrow: string;
  title: string;
  subtitle: string;
  sections: { title: string; paragraphs: string[] }[];
};

const documents: Record<DocumentKey, LegalDocument> = {
  privacy: {
    eyebrow: "PRIVACY",
    title: "Privacy Policy",
    subtitle: "What CalledOut collects, why it is used, and the controls you have.",
    sections: [
      {
        title: "Information you provide",
        paragraphs: [
          "CalledOut stores account information, your profile, commitments, circle membership, reactions, support requests, and the proof you choose to submit.",
          "Fresh proof may include photos, short video, timestamps, verification prompts, and optional location signals when a commitment requires them. Exact location is not displayed to friends.",
        ],
      },
      {
        title: "How information is used",
        paragraphs: [
          "We use this information to operate commitments, verify proof, calculate records and insights, deliver notifications, prevent fraud, enforce safety rules, provide support, and maintain subscriptions.",
          "CalledOut does not sell personal information. Service providers may process limited information only to operate authentication, storage, notifications, diagnostics, analytics, and purchases.",
        ],
      },
      {
        title: "Visibility and safety",
        paragraphs: [
          "Your proof and activity follow circle membership, public opt-in, and blocking rules. Public profile and public Wall visibility remain off unless you enable them.",
          "Reports are private. Blocking hides both people from each other's eligible profile, commitment, proof, activity, and Wall surfaces.",
        ],
      },
      {
        title: "Retention and deletion",
        paragraphs: [
          "You can request account deletion from Settings. Your social visibility is removed and the account enters the deletion process.",
          "Limited billing, security, fraud-prevention, audit, or legal records may be retained when required to protect users, resolve disputes, or comply with law. Deleting CalledOut does not automatically cancel an App Store or Play Store subscription.",
        ],
      },
      {
        title: "Your choices",
        paragraphs: [
          "You can change public visibility, manage blocked accounts, report safety concerns, restore purchases, manage your subscription, and request account deletion inside the app.",
          "Signed-in users can send privacy questions through Settings → Contact support.",
        ],
      },
    ],
  },
  terms: {
    eyebrow: "LEGAL",
    title: "Terms of Use",
    subtitle: "The rules for using CalledOut and CalledOut Pro.",
    sections: [
      {
        title: "Using CalledOut",
        paragraphs: [
          "You are responsible for your account, the commitments you create, and the content you submit. Use accurate proof and do not attempt to manipulate verification, impersonate another person, or interfere with the service.",
          "CalledOut is an accountability tool, not medical advice, emergency assistance, or a guarantee of fitness results. Choose activities appropriate for your health and circumstances.",
        ],
      },
      {
        title: "Community conduct",
        paragraphs: [
          "Do not harass, threaten, shame, exploit, deceive, or expose another person's private information. Do not submit illegal, graphic, sexual, hateful, or dangerous content.",
          "CalledOut may remove content, restrict features, suspend accounts, or ban accounts when needed to protect users or the service.",
        ],
      },
      {
        title: "Subscriptions",
        paragraphs: [
          "CalledOut Pro is optional. Prices, billing periods, trials, and renewal terms are shown before purchase. Payment is handled by your app store account and subscriptions renew unless canceled in the store's subscription settings.",
          "Canceling stops future renewal but normally keeps Pro active through the paid period. Deleting your CalledOut account does not cancel the store subscription, so manage the subscription first.",
        ],
      },
      {
        title: "Service changes and responsibility",
        paragraphs: [
          "Features may change as CalledOut improves. We work to keep the service available and accurate, but network, device, store, and third-party service failures can occur.",
          "To the extent permitted by law, CalledOut is provided without guarantees that every verification, notification, ranking, or insight will be uninterrupted or error-free.",
        ],
      },
      {
        title: "Questions",
        paragraphs: [
          "Signed-in users can submit questions through Settings → Contact support.",
        ],
      },
    ],
  },
  community: {
    eyebrow: "SAFETY",
    title: "Community Guidelines",
    subtitle: "Competitive accountability without abuse.",
    sections: [
      {
        title: "Keep callouts accountable, not cruel",
        paragraphs: [
          "CalledOut allows direct, competitive accountability. It does not allow harassment, humiliation, threats, stalking, discrimination, or repeated unwanted contact.",
          "Critique the missed commitment. Do not attack someone's body, identity, health, family, finances, or private life.",
        ],
      },
      {
        title: "Submit safe, authentic content",
        paragraphs: [
          "Proof must be your own and must not contain sexual content, graphic injury, illegal activity, private information, or people who did not consent to being recorded.",
          "Do not fake proof, reuse another person's content, manipulate timestamps, impersonate users, spam circles, or coordinate false reports.",
        ],
      },
      {
        title: "Use report and block",
        paragraphs: [
          "Report profiles or content that may violate these guidelines. Reports are private and reviewed by CalledOut.",
          "Block someone when you no longer want eligible profile, Wall, commitment, proof, or activity interactions with that person. You can manage blocked accounts in Settings.",
        ],
      },
      {
        title: "Enforcement",
        paragraphs: [
          "CalledOut may warn users, remove content, remove members from circles, limit features, suspend accounts, or permanently ban accounts depending on severity and history.",
          "Urgent danger should be reported to local emergency services. CalledOut is not an emergency response service.",
        ],
      },
    ],
  },
};

function isDocumentKey(value: string | undefined): value is DocumentKey {
  return value === "privacy" || value === "terms" || value === "community";
}

export default function LegalDocumentScreen() {
  const params = useLocalSearchParams<{ document?: string }>();
  const { session } = useSession();
  const key: DocumentKey = isDocumentKey(params.document)
    ? params.document
    : "privacy";
  const document = documents[key];

  return (
    <Screen>
      <Header
        eyebrow={document.eyebrow}
        title={document.title}
        subtitle={document.subtitle}
        backLabel={session ? "Settings" : "Create account"}
        onBack={router.back}
      />

      <Text variant="caption" style={{ color: colors.textSecondary }}>
        Last updated July 21, 2026
      </Text>

      {document.sections.map((section) => (
        <Card key={section.title} style={{ gap: spacing.sm }}>
          <SectionHeader title={section.title} />
          {section.paragraphs.map((paragraph) => (
            <Text key={paragraph} style={{ color: colors.textSecondary }}>
              {paragraph}
            </Text>
          ))}
        </Card>
      ))}

      {session ? (
        <Button
          title="Contact support"
          variant="secondary"
          onPress={() => router.push("/settings/support" as never)}
        />
      ) : (
        <Button
          title="Back to create account"
          variant="secondary"
          onPress={router.back}
        />
      )}
    </Screen>
  );
}
