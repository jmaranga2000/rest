"use client";
import { createContext, useContext, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, type ButtonProps } from "./Button";
import { Alert } from "./misc";
import { cn } from "./cn";
import { useToast } from "./Toast";
import { Dialog } from "./Dialog";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; fieldErrors?: Record<string, string[]> } };
export type FormAction<T = unknown> = (input: FormData) => Promise<ActionResult<T>>;
export type ObjectAction<I, T = unknown> = (input: I) => Promise<ActionResult<T>>;

interface FormState { pending: boolean; errors: Record<string, string[]> }
const FormCtx = createContext<FormState>({ pending: false, errors: {} });
export const useFormState = (): FormState => useContext(FormCtx);

/** Label + control + hint + inline error. The error is looked up from the enclosing ActionForm by `name`. */
export function Field({ label, name, hint, required, children, className }: { label: string; name?: string; hint?: ReactNode; required?: boolean; children: ReactNode; className?: string }) {
  const { errors } = useFormState();
  const err = name ? errors[name]?.[0] : undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="block text-[13px] font-medium text-fg" htmlFor={name}>
        {label}{required ? <span className="ml-0.5 text-danger" aria-hidden>*</span> : null}
      </label>
      {children}
      {err ? <p className="text-xs text-danger" role="alert">{err}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function SubmitButton({ children, ...rest }: Omit<ButtonProps, "type" | "loading">) {
  const { pending } = useFormState();
  return <Button type="submit" loading={pending} {...rest}>{children}</Button>;
}

interface ActionFormProps<T> {
  action: FormAction<T>;
  children: ReactNode;
  className?: string;
  successMessage?: string | ((data: T) => string);
  onSuccess?: (data: T) => void;
  /** Navigate after success (e.g. to the created record). */
  redirectTo?: string | ((data: T) => string);
  resetOnSuccess?: boolean;
}

/**
 * The one way forms talk to Server Actions: pending state, field errors, a
 * form-level alert, toast on success and a router refresh so server data updates.
 */
export function ActionForm<T = unknown>({ action, children, className, successMessage, onSuccess, redirectTo, resetOnSuccess }: ActionFormProps<T>) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setErrors({}); setFormError(null);
    start(async () => {
      const res = await action(data);
      if (res.ok) {
        const msg = typeof successMessage === "function" ? successMessage(res.data) : successMessage;
        if (msg) toast.success(msg);
        if (resetOnSuccess) form.reset();
        onSuccess?.(res.data);
        const to = typeof redirectTo === "function" ? redirectTo(res.data) : redirectTo;
        if (to) router.push(to); else router.refresh();
      } else {
        setErrors(res.error.fieldErrors ?? {});
        const hasFieldErrors = res.error.fieldErrors && Object.keys(res.error.fieldErrors).some((k) => k !== "_form");
        setFormError(hasFieldErrors ? "Please fix the highlighted fields." : res.error.message);
        if (res.error.code === "UNAUTHENTICATED") router.push("/login");
      }
    });
  }

  return (
    <FormCtx.Provider value={{ pending, errors }}>
      <form onSubmit={submit} className={className} noValidate>
        {formError ? <div className="mb-4"><Alert tone="danger">{formError}</Alert></div> : null}
        {children}
      </form>
    </FormCtx.Provider>
  );
}

/** Calls an action with a plain object (buttons, toggles, row actions). */
export function useRunAction() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  function run<I, T>(action: ObjectAction<I, T>, input: I, opts: { success?: string; onDone?: (data: T) => void; refresh?: boolean } = {}) {
    start(async () => {
      const res = await action(input);
      if (res.ok) {
        if (opts.success) toast.success(opts.success);
        opts.onDone?.(res.data);
        if (opts.refresh !== false) router.refresh();
      } else {
        toast.error(res.error.message);
        if (res.error.code === "UNAUTHENTICATED") router.push("/login");
      }
    });
  }
  return { run, pending };
}

/** A form inside a modal, opened by any trigger element. */
export function FormDialog<T = unknown>({ trigger, title, description, action, children, submitLabel = "Save", successMessage, size, onSuccess, redirectTo }: {
  trigger: ReactNode; title: string; description?: string; action: FormAction<T>; children: ReactNode; submitLabel?: string;
  successMessage?: string; size?: "sm" | "md" | "lg" | "xl"; onSuccess?: (d: T) => void; redirectTo?: string | ((d: T) => string);
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <span onClick={() => setOpen(true)} className="contents">{trigger}</span>
      <Dialog open={open} onClose={() => setOpen(false)} title={title} description={description} size={size}>
        <ActionForm action={action} successMessage={successMessage} redirectTo={redirectTo} onSuccess={(d) => { setOpen(false); onSuccess?.(d); }}>
          <div className="space-y-4">{children}</div>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <SubmitButton>{submitLabel}</SubmitButton>
          </div>
        </ActionForm>
      </Dialog>
    </>
  );
}

/** Button that asks for confirmation, then runs an action with fixed input. */
export function ConfirmButton<I, T>({ action, input, title, description, confirmLabel = "Confirm", children, variant = "outline", size = "sm", danger, successMessage, icon, reasonLabel }: {
  action: ObjectAction<I & { reason?: string }, T>; input: I; title: string; description?: string; confirmLabel?: string; children: ReactNode;
  variant?: ButtonProps["variant"]; size?: ButtonProps["size"]; danger?: boolean; successMessage?: string; icon?: ReactNode;
  /** When set, asks for a free-text reason which is sent as `reason`. */ reasonLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { run, pending } = useRunAction();
  return (
    <>
      <Button variant={variant} size={size} icon={icon} onClick={() => setOpen(true)}>{children}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title} description={description} size="sm"
        footer={<>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant={danger ? "danger" : "primary"} loading={pending} disabled={!!reasonLabel && reason.trim().length < 3}
            onClick={() => run(action, reasonLabel ? { ...input, reason: reason.trim() } : (input as I & { reason?: string }), { success: successMessage, onDone: () => setOpen(false) })}>{confirmLabel}</Button>
        </>}>
        {reasonLabel ? (
          <div className="space-y-1.5">
            <label className="block text-[13px] font-medium" htmlFor="confirm-reason">{reasonLabel}</label>
            <textarea id="confirm-reason" className="control" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
        ) : <p className="text-sm text-muted">This action is recorded in the audit log.</p>}
      </Dialog>
    </>
  );
}
