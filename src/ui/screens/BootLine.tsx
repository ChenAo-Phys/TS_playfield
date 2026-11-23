/**
 * The start screen's boot line (ui-spec §11.1): "> LINKING WITH DEEPSTRUGGLE · RULES ENGINE ✓ · AI MODEL
 * 3.6 / 5.8 MB · VERIFY · START AI", typewriter phosphor over a 3 px bar, driven by `vm.load`. On an
 * error it turns alert orange with the message, a Retry button and a disclosure with the raw error.
 */
import type { LoadProgress, ViewModel } from "../../game/contract";
import { useI18n } from "../../i18n/react";
import { MODEL_BYTES } from "../../ai/config";
import { isWasmUnsupportedMessage } from "../../ai/errors";
import { Button } from "../common/Button";
import s from "./BootLine.module.css";

export type BootStep = "link" | "engine" | "model" | "verify" | "start" | "ready";

export interface BootLineProps {
  load?: LoadProgress;
  error?: string;
  onRetry(): void;
  // ── extensions ──
  status: ViewModel["status"];
  /** The AI worker is up (the controller cleared `vm.load` after AI progress). */
  aiReady: boolean;
  /** The load stage seen last before an error (picks the ui:error.* message). */
  failedStage?: LoadProgress["stage"] | null;
  className?: string;
}

const MB = MODEL_BYTES / 1e6;

/** Where the boot stands, as a step of the line and a bar fraction (0..1). */
export function bootProgress(status: ViewModel["status"], load: LoadProgress | undefined, aiReady: boolean): { step: BootStep; bar: number } {
  if (status === "boot") return { step: "link", bar: 0.02 };
  if (status === "loading" || load?.stage === "engine") return { step: "engine", bar: 0.08 };
  if (aiReady) return { step: "ready", bar: 1 };
  switch (load?.stage) {
    case "model-download": return { step: "model", bar: 0.15 + 0.65 * (load.fraction ?? 0) };
    case "model-verify": return { step: "verify", bar: 0.84 };
    case "ai-worker": return { step: "start", bar: 0.9 + 0.1 * (load.fraction ?? 0) };
    default: return { step: "model", bar: 0.15 };
  }
}

const ORDER: BootStep[] = ["link", "engine", "model", "verify", "start", "ready"];

/** The ui:error.* message for a failure at `stage` (the raw text goes in the disclosure). */
export function errorKey(stage: LoadProgress["stage"] | null | undefined, error: string | undefined):
  "ui:error.engine" | "ui:error.modelDownload" | "ui:error.modelVerify" | "ui:error.worker" | "ui:error.webassembly" | "ui:error.unexpected" {
  // The AI's own "no WebAssembly SIMD" error (a stable marker), or a browser with no WebAssembly at all. Not a
  // match on the raw text: onnxruntime's errors name its ort-wasm-simd-threaded files (Q-005).
  if (isWasmUnsupportedMessage(error) || (stage === "engine" && /WebAssembly is not defined/i.test(error ?? ""))) return "ui:error.webassembly";
  switch (stage) {
    case "engine": return "ui:error.engine";
    case "model-download": return "ui:error.modelDownload";
    case "model-verify": return error && /sha|checksum|hash/i.test(error) ? "ui:error.modelVerify" : "ui:error.modelDownload";
    case "ai-worker": return "ui:error.worker";
    default: return "ui:error.unexpected";
  }
}

export function BootLine({ load, error, onRetry, status, aiReady, failedStage, className }: BootLineProps) {
  const { t } = useI18n();
  if (status === "error") {
    const key = errorKey(failedStage, error);
    return (
      <div className={[s.boot, s.error, className].filter(Boolean).join(" ")} role="alert">
        <div className={s.line}>
          <span aria-hidden="true">&gt; </span>
          {key === "ui:error.unexpected" ? t(key, { message: error ?? "" }) : t(key)}
        </div>
        <div className={s.errorRow}>
          <Button variant="brass" size="s" onClick={onRetry}>{t("ui:error.retry")}</Button>
          {error ? (
            <details className={s.details}>
              <summary>{t("ui:error.details")}</summary>
              <pre>{error}</pre>
            </details>
          ) : null}
        </div>
      </div>
    );
  }
  const { step, bar } = bootProgress(status, load, aiReady);
  const at = ORDER.indexOf(step);
  const seg = (k: BootStep, text: string) => {
    const i = ORDER.indexOf(k);
    const cls = i < at ? s.done : i === at ? s.now : s.todo;
    return <span className={cls} key={k}>{text}{i < at && k !== "link" ? " ✓" : ""}</span>;
  };
  const model = step === "model" && load?.stage === "model-download" && load.fraction !== null
    ? `${t("ui:start.boot.model")} ${t("ui:loading.megabytes", { done: (MB * (load.fraction ?? 0)).toFixed(1), total: MB.toFixed(1) })}`
    : t("ui:start.boot.model");
  const parts = [
    seg("link", t("ui:start.boot.link")),
    seg("engine", t("ui:start.boot.engine")),
    seg("model", model),
    seg("verify", t("ui:start.boot.verify")),
    seg("start", t("ui:start.boot.start")),
  ];
  return (
    <div className={[s.boot, className].filter(Boolean).join(" ")}>
      <div className={s.line} aria-live="polite">
        <span aria-hidden="true">&gt; </span>
        {parts.flatMap((p, i) => (i ? [<span key={`d${i}`} className={s.dot} aria-hidden="true"> · </span>, p] : [p]))}
      </div>
      <div
        className={s.bar}
        role="progressbar"
        aria-label={t("ui:loading.title")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(bar * 100)}
      >
        <i style={{ width: `${Math.round(bar * 1000) / 10}%` }} />
      </div>
      {step === "ready"
        ? <div className={[s.note, s.ready].join(" ")}>{t("ui:start.boot.ready")}</div>
        : <div className={s.note}>{t("ui:loading.firstTime", { mb: MB.toFixed(1) })}</div>}
    </div>
  );
}
