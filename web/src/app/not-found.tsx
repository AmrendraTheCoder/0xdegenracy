import Link from "next/link";

export default function NotFound() {
  return (
    <div className="brut mx-auto max-w-md bg-white p-6 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black">Rugged.</h1>
      <p className="mt-2 text-sm">This game does not exist (or its launch failed).</p>
      <Link href="/create" className="brut-btn mt-4 inline-block bg-hot px-4 py-2 text-white">Make one</Link>
    </div>
  );
}
