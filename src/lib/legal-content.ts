import type { UserRole } from './users';

export const LEGAL_SUPPORT_EMAIL = 'geetaparamseva@gmail.com';
/** Licensing / permission requests (proprietary software). */
export const LEGAL_LICENSING_EMAIL = 'Sparshagrawaln@gmail.com';

/** Public GitHub Pages site for store listings and external reviewers. */
export const LEGAL_PAGES_BASE_URL = 'https://sparshagrawal07.github.io/Geeta-param-seva';
export const LEGAL_PRIVACY_URL = `${LEGAL_PAGES_BASE_URL}/privacy-policy.html`;
export const LEGAL_TERMS_URL = `${LEGAL_PAGES_BASE_URL}/terms.html`;

export type LegalAudience = 'member' | 'admin';

export interface LegalSection {
  title: string;
  body: string;
}

function isAdminLegalRole(role: UserRole | null | undefined): boolean {
  return role === 'senior_admin' || role === 'admin';
}

/** Resolve which legal variant to show from the signed-in role. Logged-out → member. */
export function resolveLegalAudience(role: UserRole | null | undefined): LegalAudience {
  return isAdminLegalRole(role) ? 'admin' : 'member';
}

const sharedPrivacyThirdParties: LegalSection = {
  title: 'Third-party services',
  body:
    'We use Google Firebase for authentication, cloud storage (Firestore), Cloud Functions, and Remote Config. Member screens may show Google AdMob banner advertisements (controlled remotely). Push delivery uses Expo Notifications (and related Google/Apple push services). When Hindi is selected, some UI strings may be translated with Google Translate. These providers process data only as needed to run the app and, where applicable, to serve ads.',
};

const sharedPrivacyAdvertising: LegalSection = {
  title: 'Advertising',
  body:
    'On member Home, Seva, and Profile screens we may show small banner ads via Google AdMob. Ads are not shown on sign-in, PIN setup, Aarti/Gita reading screens, notifications, or admin tools. We request non-personalized ads where supported. AdMob and its partners may use device identifiers and similar data under their policies. You can learn more in Google’s advertising policies. We do not place interstitial, rewarded, or video ads that interrupt the app.',
};

const sharedPrivacyContact: LegalSection = {
  title: 'Contact',
  body: `Privacy questions: ${LEGAL_SUPPORT_EMAIL}. Licensing or permission to use the Geeta Param Seva software: ${LEGAL_LICENSING_EMAIL}.`,
};

const sharedPrivacyChildren: LegalSection = {
  title: 'Audience and children',
  body:
    'Geeta Param Seva is a private community app. Access is invitation-only: a phone number must be on the organization roster before sign-in. We do not offer public registration or advertise the app to the general public. Where minors use the app, a parent or guardian should supervise use as required by local law. Contact us if you believe a child’s data was collected without appropriate consent.',
};

export function getPrivacyPolicySections(audience: LegalAudience): LegalSection[] {
  if (audience === 'admin') {
    return [
      {
        title: 'About this policy',
        body:
          'This Privacy Policy explains how Geeta Param Seva handles information for admin and senior admin accounts. Member-facing practices are similar; admin accounts also manage groups, roster entries, and content.',
      },
      {
        title: 'Information we collect',
        body:
          'We collect your mobile phone number, display name, role, assigned groups, personal PIN (stored as a secure hash — not plaintext), device/session identifiers for sole-device sign-in, Expo push tokens when you enable notifications, and in-app activity related to posts, messages, schedules, and alerts you send or manage. Join PINs you generate are shown once to you and stored as hashes. Roster data you enter (names and phone numbers of members/admins) is stored so those people can sign in.',
      },
      {
        title: 'How we use information',
        body:
          'We use this information to authenticate you, enforce one active device session, show and manage group feeds, publish seva posts and messages, schedule or send notifications, manage join PINs and roster access, and keep the service secure and reliable.',
      },
      {
        title: 'Notifications and device data',
        body:
          'If you allow notifications, we store a device push token so reminders and alerts can reach this device. You can turn notifications off in Settings. Signing in on another device ends the previous session and disables that device’s push registration.',
      },
      {
        title: 'Data you manage about others',
        body:
          'As an admin you may add or update roster names and phone numbers, regenerate group join PINs, and publish content to groups. Use this only for legitimate community seva coordination. Do not share join PINs or member contact details outside the organization.',
      },
      sharedPrivacyThirdParties,
      sharedPrivacyAdvertising,
      {
        title: 'Data retention and account deletion',
        body:
          'You can delete your account in Settings. Deletion removes your profile document and Firebase authentication record. Group content you published, roster entries you managed, and some related records may remain for the community or organization. Contact us if you need help with residual data.',
      },
      sharedPrivacyChildren,
      sharedPrivacyContact,
    ];
  }

  return [
    {
      title: 'About this policy',
      body:
        'This Privacy Policy explains how Geeta Param Seva (“we”) collects and uses information for member accounts in this private community app.',
    },
    {
      title: 'Information we collect',
      body:
        'We collect your mobile phone number and group join PIN for sign-in (the PIN is verified server-side and stored as a hash for group access — not as your personal password), your name for your profile, your group membership, and in-app notification history. If you enable push notifications, we store a device push token and device identifier. We also keep a sole active session id so only one device stays signed in.',
    },
    {
      title: 'How we use information',
      body:
        'We use this information to authenticate you, show your group feed (seva updates and messages), deliver alerts you opt into, and keep the service secure and reliable.',
    },
    {
      title: 'Notifications and device data',
      body:
        'Push notifications are optional. You can enable or disable them in Settings. Signing in on another device ends the previous session.',
    },
    sharedPrivacyThirdParties,
    sharedPrivacyAdvertising,
    {
      title: 'Data retention and account deletion',
      body:
        'You can delete your account in Settings. This removes your profile document and authentication record. Some group content or votes associated with your activity may remain visible to group admins. Contact us if you need help with residual data.',
    },
    sharedPrivacyChildren,
    sharedPrivacyContact,
  ];
}

export function getTermsOfServiceSections(audience: LegalAudience): LegalSection[] {
  if (audience === 'admin') {
    return [
      {
        title: 'Acceptance',
        body:
          'By using Geeta Param Seva with an admin or senior admin account, you agree to these Terms of Service and to use admin tools only for Geeta Param Seva community coordination.',
      },
      {
        title: 'Accounts and personal PIN',
        body:
          'Admin access is assigned by the organization. After first sign-in with a join PIN, you must set a personal PIN. Thereafter you sign in with your phone number and personal PIN only. Keep your PIN private. Only one device may stay signed in at a time; a new sign-in ends other sessions.',
      },
      {
        title: 'Admin responsibilities',
        body:
          'You may manage assigned groups (or all groups if you are a senior admin): roster members, join PINs, seva posts, messages, practice, and notifications. Enter accurate roster data. Share join PINs only with intended members. Do not misuse privileges or access groups you are not assigned to manage.',
      },
      {
        title: 'Group join PINs',
        body:
          'Join PINs are temporary access codes (typically valid about 24 hours). Regenerating a PIN invalidates the previous one. Do not post join PINs publicly.',
      },
      {
        title: 'Content and notifications',
        body:
          'Publish only lawful, respectful, and accurate content. Do not send spam, harassment, or misleading alerts. The organization may remove content or revoke admin access for misuse.',
      },
      {
        title: 'Availability',
        body:
          'We aim to keep the service available but do not guarantee uninterrupted operation. Features may change as the app evolves.',
      },
      {
        title: 'Contact',
        body: `Support: ${LEGAL_SUPPORT_EMAIL}. Licensing or permission to use the software: ${LEGAL_LICENSING_EMAIL}.`,
      },
      {
        title: 'Intellectual property',
        body:
          'Geeta Param Seva software, branding, and related materials are proprietary. You may not copy, modify, distribute, or sublicense the software without explicit written permission from Sparsh Agrawal.',
      },
    ];
  }

  return [
    {
      title: 'Acceptance',
      body:
        'By using Geeta Param Seva you agree to these Terms of Service. This is a private community app for Geeta Param Seva.',
    },
    {
      title: 'Accounts',
      body:
        'You may sign in only if your phone number is on the organization roster. Members sign in with mobile number and a group join PIN from an admin. Keep the PIN private. Only one device may stay signed in at a time.',
    },
    {
      title: 'Acceptable use',
      body:
        'Use the app respectfully for community seva coordination. Do not attempt unauthorized access, share another person’s account, or post unlawful, abusive, or misleading content.',
    },
    {
      title: 'Content',
      body:
        'Group feeds may include seva updates, messages, and alerts published by admins. Content is for community members; do not redistribute sensitive group information outside the community without permission.',
    },
    {
      title: 'Advertising',
      body:
        'Member screens may display small banner advertisements. Ads are kept away from primary actions and reading screens. Interstitial, rewarded, and video ads are not used.',
    },
    {
      title: 'Admin accounts',
      body:
        'Admin and senior admin accounts have additional tools and responsibilities. Those terms apply when you use an admin account and are shown when signed in as an admin.',
    },
    {
      title: 'Availability',
      body:
        'We aim to keep the service available but do not guarantee uninterrupted operation. Features may change as the app evolves.',
    },
    {
      title: 'Contact',
      body: `Support: ${LEGAL_SUPPORT_EMAIL}. Licensing or permission to use the software: ${LEGAL_LICENSING_EMAIL}.`,
    },
    {
      title: 'Intellectual property',
      body:
        'Geeta Param Seva software, branding, and related materials are proprietary. You may not copy, modify, distribute, or sublicense the software without explicit written permission from Sparsh Agrawal.',
    },
  ];
}

/** Default exports for compliance tests and static references (member-focused). */
export const privacyPolicySections = getPrivacyPolicySections('member');
export const termsOfServiceSections = getTermsOfServiceSections('member');
