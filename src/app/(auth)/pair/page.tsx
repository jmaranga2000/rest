import { PairForm } from "./PairForm";
export const metadata = { title: "Pair this device" };
export default function PairPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Pair this device</h1>
      <p className="mb-8 mt-1.5 text-sm text-muted">A manager creates a 6-digit code in Terminals. Enter it here once; this device then signs staff in with PINs.</p>
      <PairForm />
    </>
  );
}
