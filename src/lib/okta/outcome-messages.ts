/** Admin-facing copy for Okta Add user outcomes. Safe for UI. */
export function addUserOutcomeMessage(setupStatus: string): string {
  switch (setupStatus) {
    case "new_user_activation_email_sent":
      return "User added to Cyware Docs Users. Okta sent an account setup email.";
    case "existing_staged_activation_email_sent":
      return "Existing staged Okta user was added to Cyware Docs Users. Okta sent an account setup email.";
    case "existing_provisioned_activation_email_resent":
      return "User was added to Cyware Docs Users. Okta resent the pending account setup email.";
    case "existing_recovery_activation_email_resent":
      return "User was added to Cyware Docs Users. Okta resent the pending setup email.";
    case "existing_recovery_pending":
      return "The user was added to Cyware Docs Users, but their existing Okta recovery process is still pending.";
    case "existing_active_access_granted":
      return "Existing Okta user was added to Cyware Docs Users. They can sign in with their current Okta password and Okta Verify.";
    case "existing_password_expired":
      return "The user was added to Cyware Docs Users, but their Okta password is expired. They must complete Okta's password-change flow.";
    case "existing_locked_out":
      return "The Okta account is locked. It must be unlocked before the user can sign in.";
    case "existing_suspended":
      return "The Okta account is suspended. It was not automatically unsuspended.";
    case "existing_deprovisioned_activation_email_sent":
      return "The existing deprovisioned Okta user was reactivated and sent a setup email.";
    default:
      return "User added to Cyware Docs Users.";
  }
}
