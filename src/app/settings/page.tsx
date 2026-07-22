import { redirect } from "next/navigation";

/** Settings landing — workspace admin routes live under /settings/users and /settings/content. */
export default function SettingsIndexPage() {
  redirect("/settings/users");
}
