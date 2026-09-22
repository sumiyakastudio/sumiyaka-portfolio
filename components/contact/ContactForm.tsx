"use client";

import { useState, useCallback, useActionState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { submitContact, type ContactState } from "@/app/contact/actions";
import ContactRunner from "./ContactRunner";
import styles from "./ContactForm.module.css";

const BUDGET_OPTIONS = [
  "〜10万円",
  "10万円〜20万円",
  "20万円〜30万円",
  "30万円〜50万円",
  "50万円〜",
  "未定・相談したい",
] as const;

const DEADLINE_OPTIONS = [
  "1ヶ月以内",
  "1〜2ヶ月",
  "2〜3ヶ月",
  "3ヶ月以上",
  "未定・相談したい",
] as const;

interface FormErrors {
  name?: string;
  email?: string;
  message?: string;
}

type Phase = "form" | "confirm" | "sending" | "runner" | "done";

const transition = { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const };

function validateField(field: string, value: string): string | undefined {
  switch (field) {
    case "name":
      if (!value.trim()) return "氏名を入力してください";
      if (value.length > 100) return "100文字以内で入力してください";
      return undefined;
    case "email":
      if (!value.trim()) return "メールアドレスを入力してください";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
        return "メールアドレスを正しく入力してください";
      return undefined;
    case "message":
      if (!value.trim()) return "ご相談内容を入力してください";
      if (value.length > 5000) return "5000文字以内で入力してください";
      return undefined;
    default:
      return undefined;
  }
}

const initialState: ContactState = { success: false, error: "" };

interface FormValues {
  name: string;
  email: string;
  budget: string;
  deadline: string;
  message: string;
}

export default function ContactForm() {
  const [form, setForm] = useState<FormValues>({ name: "", email: "", budget: "", deadline: "", message: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [phase, setPhase] = useState<Phase>("form");
  const formRef = useRef<HTMLFormElement>(null);
  const pendingFormDataRef = useRef<FormData | null>(null);

  const handleAction = useCallback(
    async (prev: ContactState, formData: FormData): Promise<ContactState> => {
      // If in confirm phase, this is the actual submission
      if (pendingFormDataRef.current) {
        setPhase("sending");
        const result = await submitContact(prev, pendingFormDataRef.current);
        pendingFormDataRef.current = null;
        if (result.success) {
          setPhase("runner");
        } else {
          setPhase("form");
        }
        return result;
      }

      // Client-side validation
      const name = formData.get("name") as string;
      const email = formData.get("email") as string;
      const message = formData.get("message") as string;
      const budget = formData.get("budget") as string;
      const deadline = formData.get("deadline") as string;

      const newErrors: FormErrors = {};
      const nameErr = validateField("name", name ?? "");
      const emailErr = validateField("email", email ?? "");
      const msgErr = validateField("message", message ?? "");
      if (nameErr) newErrors.name = nameErr;
      if (emailErr) newErrors.email = emailErr;
      if (msgErr) newErrors.message = msgErr;

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return { success: false, error: "" };
      }

      setErrors({});
      // Show confirm modal
      pendingFormDataRef.current = formData;
      setPhase("confirm");
      return { success: false, error: "" };
    },
    [],
  );

  const [state, formAction, isPending] = useActionState(handleAction, initialState);

  const handleConfirmSend = useCallback(() => {
    // Re-submit with the stored formData
    if (formRef.current && pendingFormDataRef.current) {
      formRef.current.requestSubmit();
    }
  }, []);

  const handleConfirmCancel = useCallback(() => {
    pendingFormDataRef.current = null;
    setPhase("form");
  }, []);

  const handleRunnerComplete = useCallback(() => {
    setPhase("done");
  }, []);

  const handleChange = useCallback(
    (field: keyof FormValues, value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      if (field in errors && errors[field as keyof FormErrors]) {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    },
    [errors],
  );

  return (
    <div className={styles.wrapper}>
      <AnimatePresence mode="wait">
        {phase === "runner" ? (
          <motion.div
            key="runner"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
          >
            <ContactRunner onComplete={handleRunnerComplete} />
          </motion.div>
        ) : phase === "done" ? (
          <motion.div
            key="success"
            className={styles.successState}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={transition}
          >
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className={styles.successCheck}>
              <circle cx="24" cy="24" r="22" stroke="#111" strokeWidth="2" />
              <polyline
                points="14,24 22,32 34,18"
                stroke="#111"
                strokeWidth="2.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="40"
                strokeDashoffset="40"
              >
                <animate attributeName="stroke-dashoffset" from="40" to="0" dur="0.6s" fill="freeze" begin="0.2s" />
              </polyline>
            </svg>
            <h3 className={styles.successTitle}>THANK YOU.</h3>
            <p className={styles.successText}>
              お問い合わせを受け付けました。<br />
              通常24時間以内にご返信します。
            </p>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            ref={formRef}
            className={styles.form}
            action={formAction}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={transition}
            noValidate
          >
            {/* honeypot — ボットが埋める隠しフィールド。実ユーザー/スクリーンリーダーには露出しない */}
            <div className={styles.hp} aria-hidden="true">
              <label htmlFor="contact-hp">この項目は空のままにしてください</label>
              <input
                id="contact-hp"
                name="contact_hp"
                type="text"
                tabIndex={-1}
                autoComplete="off"
              />
            </div>

            {/* NAME */}
            <div className={styles.field}>
              <label htmlFor="contact-name" className={styles.label}>
                NAME <span className={styles.labelSep}>—</span> <span className={styles.labelJp}>氏名</span>
                <span className={styles.required}>*</span>
              </label>
              <input
                id="contact-name"
                name="name"
                type="text"
                className={styles.input}
                value={form.name}
                onChange={(e) => handleChange("name", e.target.value)}
                placeholder="氏名をご記入ください"
                autoComplete="name"
                required
                disabled={phase === "sending"}
              />
              <span className={styles.error} aria-live="polite">{errors.name ?? ""}</span>
            </div>

            {/* EMAIL */}
            <div className={styles.field}>
              <label htmlFor="contact-email" className={styles.label}>
                EMAIL <span className={styles.labelSep}>—</span> <span className={styles.labelJp}>メールアドレス</span>
                <span className={styles.required}>*</span>
              </label>
              <input
                id="contact-email"
                name="email"
                type="email"
                className={styles.input}
                value={form.email}
                onChange={(e) => handleChange("email", e.target.value)}
                placeholder="example@email.com"
                autoComplete="email"
                required
                disabled={phase === "sending"}
              />
              <span className={styles.error} aria-live="polite">{errors.email ?? ""}</span>
            </div>

            {/* BUDGET */}
            <div className={styles.field}>
              <label htmlFor="contact-budget" className={styles.label}>
                BUDGET <span className={styles.labelSep}>—</span> <span className={styles.labelJp}>ご予算</span>
              </label>
              <div className={styles.selectWrap}>
                <select
                  id="contact-budget"
                  name="budget"
                  className={styles.select}
                  value={form.budget}
                  onChange={(e) => handleChange("budget", e.target.value)}
                  disabled={phase === "sending"}
                >
                  <option value="" disabled>選択してください</option>
                  {BUDGET_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* DEADLINE */}
            <div className={styles.field}>
              <label htmlFor="contact-deadline" className={styles.label}>
                DEADLINE <span className={styles.labelSep}>—</span> <span className={styles.labelJp}>ご希望納期</span>
              </label>
              <div className={styles.selectWrap}>
                <select
                  id="contact-deadline"
                  name="deadline"
                  className={styles.select}
                  value={form.deadline}
                  onChange={(e) => handleChange("deadline", e.target.value)}
                  disabled={phase === "sending"}
                >
                  <option value="" disabled>選択してください</option>
                  {DEADLINE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* MESSAGE */}
            <div className={styles.field}>
              <label htmlFor="contact-message" className={styles.label}>
                MESSAGE <span className={styles.labelSep}>—</span> <span className={styles.labelJp}>ご相談内容</span>
                <span className={styles.required}>*</span>
              </label>
              <textarea
                id="contact-message"
                name="message"
                className={styles.textarea}
                value={form.message}
                onChange={(e) => handleChange("message", e.target.value)}
                placeholder="ご相談内容をご記入ください"
                rows={6}
                required
                disabled={phase === "sending"}
              />
              <span className={styles.error} aria-live="polite">{errors.message ?? ""}</span>
            </div>

            {/* Server Error */}
            <AnimatePresence>
              {state.error && phase === "form" && (
                <motion.div
                  className={styles.serverError}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {state.error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* 返信目安 — 送信前に見える位置に置く（送信完了画面と同一文言） */}
            <p className={styles.replyNote}>通常24時間以内にご返信します。</p>

            {/* Submit */}
            <button
              type="submit"
              className={styles.submit}
              disabled={phase === "sending" || isPending}
            >
              {phase === "sending" || isPending ? (
                <span className={styles.spinner} />
              ) : (
                "SEND →"
              )}
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Confirm Modal */}
      <AnimatePresence>
        {phase === "confirm" && (
          <motion.div
            className={styles.confirmOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <motion.div
              className={styles.confirmModal}
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.97 }}
              transition={transition}
            >
              <h3 className={styles.confirmTitle}>送信内容の確認</h3>
              <div className={styles.confirmHr} />
              <dl className={styles.confirmList}>
                <div className={styles.confirmItem}>
                  <dt className={styles.confirmDt}>氏名</dt>
                  <dd className={styles.confirmDd}>{form.name}</dd>
                </div>
                <div className={styles.confirmItem}>
                  <dt className={styles.confirmDt}>メールアドレス</dt>
                  <dd className={styles.confirmDd}>{form.email}</dd>
                </div>
                <div className={styles.confirmItem}>
                  <dt className={styles.confirmDt}>ご予算</dt>
                  <dd className={styles.confirmDd}>{form.budget || "未選択"}</dd>
                </div>
                <div className={styles.confirmItem}>
                  <dt className={styles.confirmDt}>ご希望納期</dt>
                  <dd className={styles.confirmDd}>{form.deadline || "未選択"}</dd>
                </div>
                <div className={styles.confirmItem}>
                  <dt className={styles.confirmDt}>ご相談内容</dt>
                  <dd className={`${styles.confirmDd} ${styles.confirmDdMessage}`}>{form.message}</dd>
                </div>
              </dl>
              <div className={styles.confirmActions}>
                <button type="button" className={styles.confirmCancel} onClick={handleConfirmCancel}>
                  修正する
                </button>
                <button type="button" className={styles.confirmSend} onClick={handleConfirmSend}>
                  送信する →
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
