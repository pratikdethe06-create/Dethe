"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Info,
  Loader2,
  Lock,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { BrandLogo } from "@/components/brand";
import { StaticHostingNotice } from "@/components/static-notice";

import { GoogleG } from "@/components/auth-gate";
import { Toaster, it } from "@/components/toast";
import { WaveBars } from "@/components/voices-ui";
import { isValidEmail, passwordIssue, passwordStrength, safeNext } from "@/lib/validation";
import { apiFetch, apiUrl } from "@/lib/api-base";

type Mode = "login" | "signup";
type FieldName = "name" | "email" | "password";

const URL_ERRORS: Record<string, string> = {
  google_not_configured:
    "Google sign-in isn't enabled on this server yet. Please continue with email, or ask the site owner to add Google credentials.",
  google_cancelled: "Google sign-in was cancelled. You can try again anytime.",
  google_state: "That sign-in attempt expired. Please try again.",
  google_failed: "Google sign-in didn't complete. Please try again or use email.",
  google_unverified: "Your Google account email isn't verified, so we couldn't sign you in.",
  auth_required: "Please sign in to open the Voice Studio.",
};

const STRENGTH_COLORS = ["", "#d9534f", "#e0a03a", "#5aa96b", "#1b7d5d"];

function Field({
  label,
  error,
  children,
  hint,
}: {
  label: string;
  error?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs font-extrabold uppercase tracking-[.12em] text-[#8b7e72]">
      {label}
      <div className="relative mt-2">{children}</div>
      {error ? (
        <span className="mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold normal-case tracking-normal text-[#b3462e]">
          <Info className="size-3.5" /> {error}
        </span>
      ) : (
        hint
      )}
    </label>
  );
}

const inputClass = (invalid?: boolean) =>
  `w-full rounded-xl border bg-white py-3 pl-10 pr-11 text-sm font-medium normal-case tracking-normal text-[#17231f] outline-none transition placeholder:text-[#b3a89c] focus:ring-4 ${
    invalid
      ? "border-[#e3a08e] focus:border-[#b95e42] focus:ring-[#fde6de]"
      : "border-[#e8ded2] focus:border-[#74b596] focus:ring-[#dcefe4]"
  }`;

export default function LoginClient() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));

  const [mode, setMode] = useState<Mode>(params.get("mode") === "signup" ? "signup" : "login");
  const [checking, setChecking] = useState(true);
  const [config, setConfig] = useState<{ google: boolean; email: boolean } | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", remember: true });
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState(() => {
    const code = params.get("error");
    return code ? (URL_ERRORS[code] ?? "Something went wrong. Please try again.") : "";
  });
  const [notice, setNotice] = useState(() =>
    params.get("reset") === "success"
      ? "Your password has been updated. Sign in with your new password."
      : ""
  );
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotError, setForgotError] = useState("");
  const [forgotDone, setForgotDone] = useState<{
    message: string;
    emailConfigured: boolean;
    link?: string;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    apiFetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        if (d?.user) window.location.replace(next);
        else setChecking(false);
      })
      .catch(() => alive && setChecking(false));
    apiFetch("/api/auth/config")
      .then((r) => r.json())
      .then((d) => alive && setConfig(d))
      .catch(() => alive && setConfig({ google: false, email: false }));
    return () => {
      alive = false;
    };
  }, [next]);

  const update = (key: FieldName | "remember", value: string | boolean) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (key !== "remember" && errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
    if (formError) setFormError("");
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setErrors({});
    setFormError("");
    const url = new URL(window.location.href);
    if (m === "signup") url.searchParams.set("mode", "signup");
    else url.searchParams.delete("mode");
    url.searchParams.delete("error");
    router.replace(`${url.pathname}${url.search}`);
  };

  const validate = () => {
    const e: Partial<Record<FieldName, string>> = {};
    if (mode === "signup" && form.name.trim().length < 2) e.name = "Please enter your full name.";
    if (!isValidEmail(form.email)) e.email = "Enter a valid email address.";
    if (mode === "signup") {
      const issue = passwordIssue(form.password);
      if (issue) e.password = issue;
    } else if (!form.password) {
      e.password = "Enter your password.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setFormError("");
    setNotice("");
    if (!validate()) return;
    setBusy(true);
    try {
      const res = await fetch(mode === "signup" ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          remember: form.remember,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message = data?.message || "We couldn't complete that request. Please try again.";
        if (data?.field && (["name", "email", "password"] as string[]).includes(data.field)) {
          setErrors({ [data.field as FieldName]: message });
        } else {
          setFormError(message);
        }
        return;
      }
      const first = String(data?.user?.name ?? "").split(" ")[0];
      it.success(
        mode === "signup"
          ? `Welcome to DetheAi${first ? `, ${first}` : ""}! Opening your Voice Studio…`
          : `Welcome back${first ? `, ${first}` : ""}. Opening your Voice Studio…`
      );
      window.setTimeout(() => window.location.assign(next), 350);
    } catch {
      setFormError("Network error — please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const openForgot = () => {
    setForgotEmail(form.email);
    setForgotError("");
    setForgotDone(null);
    setForgotOpen(true);
  };

  const submitForgot = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setForgotError("");
    if (!isValidEmail(forgotEmail)) {
      setForgotError("Enter the email linked to your account.");
      return;
    }
    setForgotBusy(true);
    try {
      const res = await apiFetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Please try again.");
      setForgotDone(data);
    } catch (err) {
      setForgotError(err instanceof Error ? err.message : "Please try again.");
    } finally {
      setForgotBusy(false);
    }
  };

  const strength = passwordStrength(form.password);
  const googleHref = apiUrl(`/api/auth/google?next=${encodeURIComponent(next)}`);

  if (checking) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#fffaf2]">
        <div className="flex items-center gap-3 text-sm font-semibold text-[#8f8378]">
          <Loader2 className="size-4 animate-spin text-[#1b7d5d]" /> Checking your session…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fffaf2] text-[#17231f]">
      <header className="border-b border-[#eadfd2]/70 bg-[#fffaf2]/90 px-5 py-4 sm:px-8 sm:py-5">
        <div className="container flex items-center justify-between">
          <BrandLogo />
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-bold text-[#6f675e] hover:text-[#1b7d5d]"
          >
            <ArrowLeft className="size-4" /> <span className="hidden sm:inline">Back to</span> DetheAi
          </Link>
        </div>
      </header>

      <main className="grain grid min-h-[calc(100vh-74px)] items-center px-4 py-8 sm:px-8 lg:py-14">
        <div className="container grid max-w-6xl items-center gap-10 lg:grid-cols-[.9fr_1.1fr] lg:gap-14">
          {/* Left: brand story */}
          <section className="hidden lg:block">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#d8e8de] bg-[#eef7f1] px-3.5 py-2 text-xs font-bold text-[#1b7d5d]">
              🇮🇳 Built for India · Loved everywhere
            </span>
            <h1 className="display mt-7 max-w-xl text-6xl font-extrabold leading-[1.02] tracking-[-.06em]">
              Your words deserve a <span className="text-[#1b7d5d]">beautiful voice.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-[#776f66]">
              Create, save, and manage natural voiceovers in one calm, focused studio — in 11 Indian
              languages.
            </p>
            <div className="mt-8 max-w-[260px] rounded-2xl border border-[#eadfd2] bg-[#fffdf8] p-4">
              <WaveBars active className="text-[#1b7d5d]" />
              <p className="mt-2 text-[11px] font-bold uppercase tracking-[.16em] text-[#9a8d80]">
                550 natural voices · ready when you are
              </p>
            </div>
            <div className="mt-8 grid gap-4 text-sm font-semibold text-[#5f574f]">
              <span className="flex items-center gap-3">
                <ShieldCheck className="size-5 text-[#1b7d5d]" /> Secure, server-side voice generation
              </span>
              <span className="flex items-center gap-3">
                <LockKeyhole className="size-5 text-[#1b7d5d]" /> Passwords are hashed — never stored
                in plain text
              </span>
              <span className="flex items-center gap-3">
                <Sparkles className="size-5 text-[#1b7d5d]" /> 10,000 free credits every month, no
                card required
              </span>
            </div>
          </section>

          {/* Right: auth card */}
          <section className="mx-auto w-full max-w-[520px] rounded-[28px] border border-[#eadfd2] bg-[#fffdf8] p-5 shadow-[0_24px_70px_rgba(64,50,34,.1)] sm:p-8">
            <div className="mb-6 lg:hidden">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#d8e8de] bg-[#eef7f1] px-3 py-2 text-[11px] font-bold text-[#1b7d5d]">
                🇮🇳 Built for India · Loved everywhere
              </span>
            </div>

            {/* mode switch */}
            <div className="grid grid-cols-2 rounded-2xl bg-[#f5efe8] p-1 text-sm font-bold">
              {(["login", "signup"] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className={`rounded-xl py-2.5 transition ${
                    mode === m
                      ? "bg-white text-[#17231f] shadow-sm"
                      : "text-[#8f8378] hover:text-[#5f574f]"
                  }`}
                >
                  {m === "login" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>

            <div className="mb-6 mt-6">
              <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#1b7d5d]">
                DetheAi account
              </p>
              <h2 className="display mt-2 text-3xl font-extrabold tracking-[-.04em]">
                {mode === "login" ? "Welcome back" : "Create your account"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#80766d]">
                {mode === "login"
                  ? "Sign in to continue to your Voice Studio."
                  : "Start creating natural voiceovers in minutes — it's free."}
              </p>
            </div>

            <StaticHostingNotice feature="login" className="mb-4" />
            {notice && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-[#dcefe4] bg-[#f4fbf6] px-3.5 py-3 text-sm font-semibold text-[#254b3a]">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#1b7d5d]" /> {notice}
              </div>
            )}
            {formError && (
              <div
                role="alert"
                className="mb-4 flex items-start gap-2 rounded-xl bg-[#fff0e5] px-3.5 py-3 text-sm font-semibold text-[#a14f35]"
              >
                <Info className="mt-0.5 size-4 shrink-0" /> {formError}
              </div>
            )}

            {/* Google */}
            <a
              href={googleHref}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-[#d8cec2] bg-white py-3.5 text-sm font-bold text-[#403831] transition hover:border-[#1b7d5d] hover:bg-[#f7fcf8] active:scale-[.98]"
            >
              <GoogleG className="size-5" />
              Continue with Google
              <ArrowRight className="ml-auto size-4 text-[#1b7d5d]" />
            </a>
            {config && !config.google && (
              <p className="mt-2 text-center text-[11px] font-semibold text-[#a09488]">
                Google sign-in isn't enabled on this server yet — email sign-in works right away.
              </p>
            )}

            <div className="my-6 flex items-center gap-3 text-xs font-semibold text-[#a09488]">
              <span className="h-px flex-1 bg-[#eadfd2]" /> or continue with email{" "}
              <span className="h-px flex-1 bg-[#eadfd2]" />
            </div>

            <form onSubmit={submit} className="space-y-4" noValidate>
              {mode === "signup" && (
                <Field label="Full name" error={errors.name}>
                  <User className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-[#a09488]" />
                  <input
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    className={inputClass(Boolean(errors.name))}
                    placeholder="Your name"
                    autoComplete="name"
                    maxLength={60}
                  />
                </Field>
              )}

              <Field label="Email address" error={errors.email}>
                <Mail className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-[#a09488]" />
                <input
                  type="email"
                  inputMode="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  className={inputClass(Boolean(errors.email))}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </Field>

              <Field
                label="Password"
                error={errors.password}
                hint={
                  mode === "signup" && form.password ? (
                    <span className="mt-2 block normal-case tracking-normal">
                      <span className="flex gap-1">
                        {[1, 2, 3, 4].map((i) => (
                          <span
                            key={i}
                            className="h-1.5 flex-1 rounded-full bg-[#eadfd2] transition-colors"
                            style={{
                              background: i <= strength.score ? STRENGTH_COLORS[strength.score] : undefined,
                            }}
                          />
                        ))}
                      </span>
                      <span className="mt-1 block text-[11px] font-semibold text-[#8f8378]">
                        {strength.label} · at least 8 characters with a letter and a number
                      </span>
                    </span>
                  ) : undefined
                }
              >
                <Lock className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-[#a09488]" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  className={inputClass(Boolean(errors.password))}
                  placeholder={mode === "signup" ? "Create a strong password" : "Your password"}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-3 grid size-7 place-items-center rounded-lg text-[#9a8d80] hover:bg-[#f5efe8] hover:text-[#1b7d5d]"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </Field>

              {mode === "login" && (
                <div className="flex items-center justify-between text-sm">
                  <label className="flex cursor-pointer items-center gap-2 font-semibold text-[#6f675e]">
                    <input
                      type="checkbox"
                      checked={form.remember}
                      onChange={(e) => update("remember", e.target.checked)}
                      className="size-4 rounded border-[#d8cec2] accent-[#1b7d5d]"
                    />
                    Keep me signed in
                  </label>
                  <button
                    type="button"
                    onClick={openForgot}
                    className="font-bold text-[#1b7d5d] hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="flex w-full items-center justify-center rounded-xl bg-[#1b7d5d] py-3.5 text-sm font-bold text-white shadow-[0_8px_18px_rgba(27,125,93,.22)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {busy ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" /> Please wait…
                  </>
                ) : mode === "login" ? (
                  <>
                    Sign in to Voice Studio <ArrowRight className="ml-2 size-4" />
                  </>
                ) : (
                  <>
                    Create free account <ArrowRight className="ml-2 size-4" />
                  </>
                )}
              </button>
            </form>

            <p className="mt-5 text-center text-sm font-semibold text-[#6f675e]">
              {mode === "login" ? (
                <>
                  New to DetheAi?{" "}
                  <button onClick={() => switchMode("signup")} className="text-[#1b7d5d] hover:underline">
                    Create an account
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button onClick={() => switchMode("login")} className="text-[#1b7d5d] hover:underline">
                    Sign in
                  </button>
                </>
              )}
            </p>

            <p className="mt-6 text-center text-[11px] leading-5 text-[#a09488]">
              By continuing, you agree to DetheAi’s terms and privacy policy.
            </p>
          </section>
        </div>
      </main>

      {/* Forgot password */}
      {forgotOpen && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-5">
          <div className="absolute inset-0 bg-[#17231f]/50 backdrop-blur-sm" onClick={() => setForgotOpen(false)} />
          <form
            onSubmit={submitForgot}
            className="modal-pop relative w-full max-w-md rounded-t-[24px] border border-[#eadfd2] bg-[#fffdf8] p-6 sm:rounded-[24px] sm:p-8"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#1b7d5d]">
                  Reset password
                </p>
                <h3 className="display mt-2 text-2xl font-extrabold">Forgot your password?</h3>
              </div>
              <button
                type="button"
                onClick={() => setForgotOpen(false)}
                aria-label="Close"
                className="grid size-9 place-items-center rounded-full bg-[#f5efe8] text-[#6f675e]"
              >
                <X className="size-4" />
              </button>
            </div>

            {forgotDone ? (
              <div className="mt-4 space-y-3">
                <div className="flex items-start gap-2 rounded-xl border border-[#dcefe4] bg-[#f4fbf6] px-3.5 py-3 text-sm font-semibold text-[#254b3a]">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#1b7d5d]" /> {forgotDone.message}
                </div>
                {!forgotDone.emailConfigured && (
                  <p className="rounded-xl bg-[#fff7ed] px-3.5 py-3 text-xs leading-5 text-[#8a5a2b]">
                    Email delivery isn't configured on this server yet, so the link couldn't be
                    emailed. The site owner can enable it by adding an email API key — or you can
                    sign in with Google if your account uses the same email.
                  </p>
                )}
                {forgotDone.link && (
                  <a
                    href={forgotDone.link}
                    className="block break-all rounded-xl border border-[#e8ded2] bg-white px-3.5 py-3 text-xs font-semibold text-[#1b7d5d] underline"
                  >
                    {forgotDone.link}
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setForgotOpen(false)}
                  className="w-full rounded-xl bg-[#1b7d5d] py-3 text-sm font-bold text-white"
                >
                  Back to sign in
                </button>
              </div>
            ) : (
              <>
                <p className="mt-3 text-sm leading-6 text-[#80766d]">
                  Enter the email linked to your account and we’ll send you a secure link to choose
                  a new password. The link is valid for 30 minutes.
                </p>
                <div className="relative mt-4">
                  <Mail className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-[#a09488]" />
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => {
                      setForgotEmail(e.target.value);
                      setForgotError("");
                    }}
                    placeholder="you@example.com"
                    autoFocus
                    className={inputClass(Boolean(forgotError))}
                  />
                </div>
                {forgotError && (
                  <p className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-[#b3462e]">
                    <Info className="size-3.5" /> {forgotError}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={forgotBusy}
                  className="mt-4 flex w-full items-center justify-center rounded-xl bg-[#1b7d5d] py-3 text-sm font-bold text-white disabled:opacity-70"
                >
                  {forgotBusy ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" /> Sending…
                    </>
                  ) : (
                    "Send reset link"
                  )}
                </button>
              </>
            )}
          </form>
        </div>
      )}

      <Toaster />
    </div>
  );
}
