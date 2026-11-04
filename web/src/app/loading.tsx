import { Loader } from "@/components/ui";

/** Shown instantly on every navigation until the next page streams in. */
export default function Loading() {
  return <Loader fill label="Loading" />;
}
