/**
 * Metadata of every system email. The WORDING (subject and body) is not here: the
 * default text of each email in each language lives in i18n/locales/<code>.js
 * under `mail`, and any edits an admin makes are stored per email per language.
 */
const systemEmailsMock = [
  {
    id: 'auth-password-reset',
    // Key of this email in the locale files (mail.passwordReset, emails.items.passwordReset).
    mailKey: 'passwordReset',
    eventKey: 'auth.passwordResetRequested',
    // Key of the group name in the locale files (emails.group.account).
    group: 'account',
    whenSent: 'A user requests a password reset link.',
    whoReceives: 'The user who requested it',
    isEnabled: true,
    variables: ['{{user_name}}', '{{reset_link}}', '{{expires_in}}', '{{app_name}}', '{{company}}', '{{support_email}}'],
  },
  {
    id: 'auth-password-changed',
    // Key of this email in the locale files (mail.passwordChanged, emails.items.passwordChanged).
    mailKey: 'passwordChanged',
    eventKey: 'auth.passwordChanged',
    // Key of the group name in the locale files (emails.group.account).
    group: 'account',
    whenSent: 'A user successfully changes their password.',
    whoReceives: 'The user whose password changed',
    isEnabled: true,
    variables: ['{{user_name}}', '{{changed_at}}', '{{app_name}}', '{{support_email}}'],
  },
  {
    id: 'auth-new-sign-in',
    // Key of this email in the locale files (mail.newSignIn, emails.items.newSignIn).
    mailKey: 'newSignIn',
    eventKey: 'auth.newSignIn',
    // Key of the group name in the locale files (emails.group.account).
    group: 'account',
    whenSent: 'A login happens from a device or location not seen before.',
    whoReceives: 'The account owner',
    isEnabled: true,
    variables: ['{{user_name}}', '{{device}}', '{{location}}', '{{signed_in_at}}', '{{app_name}}'],
  },
  {
    id: 'users-invited',
    // Key of this email in the locale files (mail.invited, emails.items.invited).
    mailKey: 'invited',
    eventKey: 'users.invited',
    // Key of the group name in the locale files (emails.group.team).
    group: 'team',
    whenSent: 'A Super Admin or Admin invites a new user.',
    whoReceives: 'The invited user',
    isEnabled: true,
    variables: ['{{user_name}}', '{{invited_by}}', '{{company}}', '{{role}}', '{{accept_link}}', '{{app_name}}'],
  },
  {
    id: 'users-created-admin-copy',
    // Key of this email in the locale files (mail.userAdded, emails.items.userAdded).
    mailKey: 'userAdded',
    eventKey: 'users.created',
    // Key of the group name in the locale files (emails.group.team).
    group: 'team',
    whenSent: 'A new user is created in the workspace.',
    whoReceives: 'All Super Admins',
    isEnabled: true,
    variables: ['{{new_user_name}}', '{{new_user_email}}', '{{role}}', '{{added_by}}', '{{users_url}}'],
  },
  {
    id: 'users-role-changed',
    // Key of this email in the locale files (mail.roleChanged, emails.items.roleChanged).
    mailKey: 'roleChanged',
    eventKey: 'users.roleChanged',
    // Key of the group name in the locale files (emails.group.team).
    group: 'team',
    whenSent: "A user's role is changed.",
    whoReceives: 'The affected user',
    isEnabled: false,
    variables: ['{{user_name}}', '{{old_role}}', '{{new_role}}', '{{changed_by}}', '{{app_name}}'],
  },
  {
    id: 'social-account-connected',
    // Key of this email in the locale files (mail.accountConnected, emails.items.accountConnected).
    mailKey: 'accountConnected',
    eventKey: 'social.accountConnected',
    // Key of the group name in the locale files (emails.group.social).
    group: 'social',
    whenSent: 'A social account is successfully connected.',
    whoReceives: 'All Super Admins',
    isEnabled: true,
    variables: ['{{provider}}', '{{account_name}}', '{{connected_by}}', '{{connected_at}}', '{{accounts_url}}'],
  },
  {
    id: 'social-token-expired',
    // Key of this email in the locale files (mail.tokenExpired, emails.items.tokenExpired).
    mailKey: 'tokenExpired',
    eventKey: 'social.tokenExpired',
    // Key of the group name in the locale files (emails.group.social).
    group: 'social',
    whenSent: "A platform's API token expires or is revoked.",
    whoReceives: 'All Super Admins',
    isEnabled: true,
    variables: ['{{provider}}', '{{account_name}}', '{{accounts_url}}', '{{app_name}}'],
  },
  {
    id: 'posts-published',
    // Key of this email in the locale files (mail.postPublished, emails.items.postPublished).
    mailKey: 'postPublished',
    eventKey: 'posts.published',
    // Key of the group name in the locale files (emails.group.publishing).
    group: 'publishing',
    whenSent: 'A post finishes publishing.',
    whoReceives: 'The post author',
    isEnabled: false,
    variables: ['{{post_excerpt}}', '{{platforms}}', '{{published_at}}', '{{post_url}}'],
  },
  {
    id: 'posts-failed',
    // Key of this email in the locale files (mail.postFailed, emails.items.postFailed).
    mailKey: 'postFailed',
    eventKey: 'posts.failed',
    // Key of the group name in the locale files (emails.group.publishing).
    group: 'publishing',
    whenSent: 'Publishing fails because the provider refused, or the connection broke.',
    whoReceives: 'The post author and all Super Admins',
    isEnabled: true,
    variables: ['{{post_excerpt}}', '{{platforms}}', '{{error_reason}}', '{{posts_url}}'],
  },
  {
    id: 'approvals-requested',
    // Key of this email in the locale files (mail.approvalRequested, emails.items.approvalRequested).
    mailKey: 'approvalRequested',
    eventKey: 'approvals.requested',
    // Key of the group name in the locale files (emails.group.approvals).
    group: 'approvals',
    whenSent: 'A post is submitted for approval.',
    whoReceives: 'Users who can approve content',
    isEnabled: true,
    variables: ['{{submitted_by}}', '{{post_excerpt}}', '{{approvals_url}}'],
  },
  {
    id: 'approvals-completed',
    // Key of this email in the locale files (mail.approvalDecided, emails.items.approvalDecided).
    mailKey: 'approvalDecided',
    eventKey: 'approvals.completed',
    // Key of the group name in the locale files (emails.group.approvals).
    group: 'approvals',
    whenSent: 'A submitted post is approved or rejected.',
    whoReceives: 'The post author',
    isEnabled: true,
    variables: ['{{decision}}', '{{post_excerpt}}', '{{reviewer}}', '{{reason}}', '{{posts_url}}'],
  },
  {
    id: 'inbox-new-comment',
    // Key of this email in the locale files (mail.newComment, emails.items.newComment).
    mailKey: 'newComment',
    eventKey: 'inbox.newComment',
    // Key of the group name in the locale files (emails.group.engagement).
    group: 'engagement',
    whenSent: 'A new comment comes in on a connected account.',
    whoReceives: 'Users assigned to Inbox',
    isEnabled: false,
    variables: ['{{commenter_name}}', '{{comment_text}}', '{{post_excerpt}}', '{{inbox_url}}'],
  },
];

export default systemEmailsMock.map((email) => ({ ...email, images: [] }));
