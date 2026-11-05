import Link from "next/link";
import { RegisterForm } from "./RegisterForm";
export const metadata = { title: "Start your free trial" };
export default function RegisterPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Start your free trial</h1>
      <p className="mb-8 mt-1.5 text-sm text-muted">14 days, every Professional feature, no card needed.</p>
      <RegisterForm />
      <p className="mt-8 text-center text-sm text-muted">Already have an account? <Link className="font-medium text-primary hover:underline" href="/login">Sign in</Link></p>
    </>
  );
}
