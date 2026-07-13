import { redirect } from "next/navigation";

export default function LegacySecurityRedirect() {
  redirect("/admin/security/settings");
}
