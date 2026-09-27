"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, Info, Loader2, Lock } from "lucide-react";
import { BrandLogo } from "@/components/brand";
import { Toaster, it } from "@/components/toast";
import { passwordIssue, passwordStrength } from "@/lib/validation";
import { apiFetch } from "@/lib/api-base";

const STRENGTH_COLORS = ["", "#d9534f", "#e0a03a", "#5aa96b", "#1b7d5d"];

export default function ResetPasswordClient() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<"checking" | "valid" | "invalid" | "done">("checking");
  const [emailHint, setEmailHint] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }
    let alive = true;
    apiFetch(`/api/auth/reset?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d?.valid) {
          setEmailHint(d.email ?? "");
          setStatus("valid");
        } else setStatus("invalid");
      })
      .catch(() => alive && setStatus("invalid"));
    return () => {
      alive = false;
    };
  }, [token]);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError("");
    const issue = passwordIssue(password);
    if (issue) return setError(issue);
    if (password !== confirm) return setError("Passwords don't match.");
    setBusy(true);
    try {
      const res = await apiFetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Could not update your password.");
      setStatus("done");
      it.success("Password updated. Redirecting to sign in…");
      window.setTimeout(() => window.location.assign("/login?reset=success"), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update your password.");
    } finally {
      setBusy(false);
    }
  };

  const strength = passwordStrength(password);

  return (
    <div className="min-h-screen bg-[#fffaf2] text-[#17231f]">
      <header className="border-b border-[#eadfd2]/70 px-5 py-4 sm:px-8 sm:py-5">
        <div className="container flex items-center justify-between">
          <BrandLogo />
          <Link href="/login" className="flex items-center gap-2 text-sm font-bold text-[#6f675e] hover:text-[#1b7d5d]">
            <ArrowLeft className="size-4" /> Back to sign in
          </Link>
        </div>
      </header>

      <main className="grain grid min-h-[calc(100vh-74px)] place-items-center px-4 py-10 sm:px-8">
        <section className="w-full max-w-[480px] rounded-[28px] border border-[#eadfd2] bg-[#fffdf8] p-6 shadow-[0_24px_70px_rgba(64,50,34,.1)] sm:p-8">
          <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#1b7d5d]">
            Reset password
          </p>

          {status === "checking" && (
            <div className="mt-6 flex items-center gap-3 text-sm font-semibold text-[#8f8378]">
              <Loader2 className="size-4 animate-spin text-[#1b7d5d]" /> Checking your reset link…
            </div>
          )}

          {status === "invalid" && (
            <>
              <h1 className="display mt-2 text-3xl font-extrabold tracking-[-.04em]">
                This link isn't valid anymore
              </h1>
              <p className="mt-3 text-sm leading-6 text-[#80766d]">
                Reset links expire after 30 minutes and can only be used once. Request a new one
                from the sign-in page.
              </p>
              <Link
                href="/login"
                className="mt-6 flex w-full items-center justify-center rounded-xl bg-[#1b7d5d] py-3.5 text-sm font-bold text-white"
              >
                Back to sign in <ArrowRight className="ml-2 size-4" />
              </Link>
            </>
          )}

          {(status === "valid" || status === "done") && (
            <>
              <h1 className="display mt-2 text-3xl font-extrabold tracking-[-.04em]">
                Choose a new password
              </h1>
              {emailHint && (
                <p className="mt-2 text-sm text-[#80766d]">
                  for <span className="font-bold text-[#403831]">{emailHint}</span>
                </p>
              )}

              {status === "done" ? (
                <div className="mt-6 flex items-start gap-2 rounded-xl border border-[#dcefe4] bg-[#f4fbf6] px-3.5 py-3 text-sm font-semibold text-[#254b3a]">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#1b7d5d]" /> Your password has
                  been updated. Redirecting you to sign in…
                </div>
              ) : (
                <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
                  <label className="block text-xs font-extrabold uppercase tracking-[.12em] text-[#8b7e72]">
                    New password
                    <div className="relative mt-2">
                      <Lock className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-[#a09488]" />
                      <input
                        type={show ? "text" : "password"}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setError("");
                        }}
                        autoComplete="new-password"
                        placeholder="At least 8 characters"
                        className="w-full rounded-xl border border-[#e8ded2] bg-white py-3 pl-10 pr-11 text-sm font-medium normal-case tracking-normal outline-none focus:border-[#74b596] focus:ring-4 focus:ring-[#dcefe4]"
                      />
                      <button
                        type="button"
                        onClick={() => setShow((v) => !v)}
                        className="absolute right-3 top-3 grid size-7 place-items-center rounded-lg text-[#9a8d80] hover:bg-[#f5efe8] hover:text-[#1b7d5d]"
                        aria-label={show ? "Hide password" : "Show password"}
                      >
                        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                    {password && (
                      <span className="mt-2 block normal-case tracking-normal">
                        <span className="flex gap-1">
                          {[1, 2, 3, 4].map((i) => (
                            <span
                              key={i}
                              className="h-1.5 flex-1 rounded-full bg-[#eadfd2]"
                              style={{ background: i <= strength.score ? STRENGTH_COLORS[strength.score] : undefined }}
                            />
                          ))}
                        </span>
                        <span className="mt-1 block text-[11px] font-semibold text-[#8f8378]">
                          {strength.label} · include a letter and a number
                        </span>
                      </span>
                    )}
                  </label>

                  <label className="block text-xs font-extrabold uppercase tracking-[.12em] text-[#8b7e72]">
                    Confirm password
                    <div className="relative mt-2">
                      <Lock className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-[#a09488]" />
                      <input
                        type={show ? "text" : "password"}
                        value={confirm}
                        onChange={(e) => {
                          setConfirm(e.target.value);
                          setError("");
                        }}
                        autoComplete="new-password"
                        placeholder="Repeat your new password"
                        className="w-full rounded-xl border border-[#e8ded2] bg-white py-3 pl-10 pr-3 text-sm font-medium normal-case tracking-normal outline-none focus:border-[#74b596] focus:ring-4 focus:ring-[#dcefe4]"
                      />
                    </div>
                  </label>

                  {error && (
                    <p role="alert" className="flex items-start gap-2 rounded-xl bg-[#fff0e5] px-3.5 py-3 text-sm font-semibold text-[#a14f35]">
                      <Info className="mt-0.5 size-4 shrink-0" /> {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={busy}
                    className="flex w-full items-center justify-center rounded-xl bg-[#1b7d5d] py-3.5 text-sm font-bold text-white shadow-[0_8px_18px_rgba(27,125,93,.22)] disabled:opacity-70"
                  >
                    {busy ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" /> Updating…
                      </>
                    ) : (
                      <>
                        Update password <ArrowRight className="ml-2 size-4" />
                      </>
                    )}
                  </button>
                </form>
              )}
            </>
          )}
        </section>
      </main>
      <Toaster />
    </div>
  );
}
