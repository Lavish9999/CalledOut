type PublicPageKey = 'privacy' | 'terms' | 'community-guidelines' | 'support';

type Section = {
  title: string;
  paragraphs: string[];
};

type Page = {
  eyebrow: string;
  title: string;
  intro: string;
  sections: Section[];
};

const pages: Record<PublicPageKey, Page> = {
  privacy: {
    eyebrow: 'PRIVACY',
    title: 'Privacy Policy',
    intro: 'What CalledOut collects, why it is used, and the controls available to you.',
    sections: [
      {
        title: 'Information you provide',
        paragraphs: [
          'CalledOut stores account information, your profile, commitments, circle membership, reactions, reports, support requests, and the proof you choose to submit.',
          'Fresh proof includes in-app photos, timestamps, and randomized verification prompts. Camera-roll photos are not accepted as standard proof.',
        ],
      },
      {
        title: 'How information is used',
        paragraphs: [
          'We use information to operate commitments, verify proof, calculate records and insights, deliver notifications, prevent fraud, enforce safety rules, provide support, and maintain subscriptions.',
          'CalledOut does not sell personal information. Service providers may process limited information only to operate authentication, storage, notifications, diagnostics, analytics, and App Store purchases.',
        ],
      },
      {
        title: 'Visibility and safety',
        paragraphs: [
          'Proof and activity follow circle membership, public opt-in, and blocking rules. Public profile and public Wall visibility remain off unless you enable them.',
          'Reports are private. Blocking hides both people from each other’s eligible profile, commitment, proof, activity, comment, reaction, and Wall surfaces.',
        ],
      },
      {
        title: 'Retention and deletion',
        paragraphs: [
          'You can request account deletion from Settings inside CalledOut. Social visibility is removed and the account enters the deletion process.',
          'Limited billing, security, fraud-prevention, audit, or legal records may be retained when required. Deleting CalledOut does not automatically cancel an App Store subscription.',
        ],
      },
    ],
  },
  terms: {
    eyebrow: 'LEGAL',
    title: 'Terms of Use',
    intro: 'The rules for using CalledOut and CalledOut Pro.',
    sections: [
      {
        title: 'Using CalledOut',
        paragraphs: [
          'You are responsible for your account, the commitments you create, and the content you submit. Do not manipulate verification, impersonate another person, or interfere with the service.',
          'CalledOut is an accountability tool, not medical advice, emergency assistance, or a guarantee of fitness results. Choose activities appropriate for your health and circumstances.',
        ],
      },
      {
        title: 'Community conduct',
        paragraphs: [
          'Do not harass, threaten, shame, exploit, deceive, or expose another person’s private information. Do not submit illegal, graphic, sexual, hateful, or dangerous content.',
          'CalledOut may remove content, restrict features, suspend accounts, or ban accounts when needed to protect users or the service.',
        ],
      },
      {
        title: 'Subscriptions',
        paragraphs: [
          'CalledOut Pro is optional. Prices, billing periods, trials, and renewal terms are shown before purchase. Payment is handled by your App Store account.',
          'Subscriptions renew unless canceled in App Store subscription settings. Canceling normally keeps Pro active through the paid period. Deleting your CalledOut account does not cancel the App Store subscription.',
        ],
      },
    ],
  },
  'community-guidelines': {
    eyebrow: 'SAFETY',
    title: 'Community Guidelines',
    intro: 'Competitive accountability without abuse.',
    sections: [
      {
        title: 'Keep callouts accountable, not cruel',
        paragraphs: [
          'CalledOut allows direct, competitive accountability. It does not allow harassment, humiliation, threats, stalking, discrimination, or repeated unwanted contact.',
          'Critique the missed commitment. Do not attack someone’s body, identity, health, family, finances, or private life.',
        ],
      },
      {
        title: 'Submit safe, authentic content',
        paragraphs: [
          'Proof must be your own and must not contain sexual content, graphic injury, illegal activity, private information, or people who did not consent to being photographed.',
          'Do not fake proof, reuse another person’s content, manipulate timestamps, impersonate users, spam circles, or coordinate false reports.',
        ],
      },
      {
        title: 'Report and block',
        paragraphs: [
          'Report profiles or content that may violate these guidelines. Reports are private and reviewed by CalledOut.',
          'Block someone when you no longer want eligible profile, Wall, commitment, proof, activity, comment, or reaction interactions with that person.',
        ],
      },
      {
        title: 'Enforcement',
        paragraphs: [
          'CalledOut may warn users, remove content, remove members from circles, limit features, suspend accounts, or permanently ban accounts depending on severity and history.',
          'Urgent danger should be reported to local emergency services. CalledOut is not an emergency response service.',
        ],
      },
    ],
  },
  support: {
    eyebrow: 'SUPPORT',
    title: 'CalledOut Support',
    intro: 'Help with accounts, commitments, proof, safety, and CalledOut Pro.',
    sections: [
      {
        title: 'Contact support in the app',
        paragraphs: [
          'Open CalledOut and go to Profile → Settings & privacy → Contact support. This securely includes your signed-in account context so the team can investigate.',
          'For a safety concern involving another user, open that person’s Wall history and use Report or Block. Reports are private.',
        ],
      },
      {
        title: 'Subscriptions and account deletion',
        paragraphs: [
          'Manage or cancel CalledOut Pro from Profile → Settings & privacy → Subscription & plan.',
          'Request account deletion from Profile → Settings & privacy → Delete account. Deleting the CalledOut account does not cancel an App Store subscription.',
        ],
      },
    ],
  },
};

function pageFromPath(pathname: string): PublicPageKey | null {
  const key = pathname.replace(/^\/+|\/+$/g, '') as PublicPageKey;
  return key in pages ? key : null;
}

export function getPublicPageKey() {
  return pageFromPath(window.location.pathname);
}

export function PublicSite({ pageKey }: { pageKey: PublicPageKey }) {
  const page = pages[pageKey];

  return (
    <main className="public-page">
      <nav className="public-nav" aria-label="CalledOut policies">
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="/community-guidelines">Community Guidelines</a>
        <a href="/support">Support</a>
      </nav>

      <article className="public-document">
        <p className="eyebrow red">{page.eyebrow}</p>
        <h1>{page.title}</h1>
        <p className="public-intro">{page.intro}</p>
        <p className="public-updated">Last updated July 21, 2026</p>

        {page.sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}
      </article>
    </main>
  );
}
