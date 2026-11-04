import { redirect } from "next/navigation";

/** Discover is the home page now; keep old /discover links working. */
export default function DiscoverPage() {
  redirect("/");
}
