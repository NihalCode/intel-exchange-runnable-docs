import { redirect } from "next/navigation";

export default function LegacyJobsRedirect() {
  redirect("/admin/documentation-agent/sync-jobs");
}
