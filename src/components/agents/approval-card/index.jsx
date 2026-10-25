"use client";;
// beui.dev/components/agents/approval-card

import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  LoaderCircle,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AgentDisclosure } from "@/components/agents/agent-disclosure";
import { ActionSwapRollText } from "@/components/motion/action-swap-roll";
import { Button } from "@/components/motion/button";
import { Checkbox } from "@/components/motion/checkbox";
import { Input } from "@/components/motion/input";
import { RadioGroup, RadioGroupItem } from "@/components/motion/radio";
import { EASE_OUT, SPRING_SWAP } from "@/lib/ease";
import { cn } from "@/lib/utils";

const EMPTY_ANSWER = { selected: [], custom: "" };

function getStatusLabel(status) {
  if (status === "submitting") return "Submitting";
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  if (status === "changes-requested") return "Changes requested";
  if (status === "answered") return "Response submitted";
  return "Input required";
}

function getStatusClass(status) {
  if (status === "approved" || status === "answered") {
    return "text-emerald-600 dark:text-emerald-400";
  }
  if (status === "rejected") return "text-rose-600 dark:text-rose-400";
  if (status === "changes-requested") {
    return "text-amber-600 dark:text-amber-400";
  }
  return "text-muted-foreground";
}

function getStatusBadgeClass(status) {
  if (status === "pending" || status === "changes-requested") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400";
  }
  if (status === "submitting") {
    return "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400";
  }
  if (status === "approved" || status === "answered") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  }
  return "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400";
}

function isAnswered(answer) {
  return answer.selected.length > 0 || Boolean(answer.custom?.trim());
}

function QuestionOptions({
  question,
  answer,
  disabled,
  onChange,
  onSingleSelect
}) {
  const custom = answer.custom ?? "";

  return (
    <div className="mt-3">
      {question.options?.length ? (
        question.multiple ? (
          <div className="grid gap-0.5">
            {question.options.map((option) => (
              <Checkbox
                key={option.value}
                checked={answer.selected.includes(option.value)}
                disabled={disabled || option.disabled}
                label={option.label}
                description={option.description}
                onCheckedChange={(checked) =>
                  onChange({
                    ...answer,
                    selected: checked
                      ? [...answer.selected, option.value]
                      : answer.selected.filter((value) => value !== option.value),
                  })
                }
                className="min-h-9 rounded-lg px-1.5 py-1" />
            ))}
          </div>
        ) : (
          <RadioGroup
            value={answer.selected[0] ?? ""}
            onValueChange={(value) => {
              onChange({ selected: [value], custom: "" });
              onSingleSelect?.();
            }}
            className="gap-0.5">
            {question.options.map((option) => (
              <RadioGroupItem
                key={option.value}
                value={option.value}
                label={option.label}
                description={option.description}
                disabled={disabled || option.disabled}
                className="min-h-9 rounded-lg px-1.5 py-1" />
            ))}
          </RadioGroup>
        )
      ) : null}
      {question.allowCustom ? (
        <Input
          value={custom}
          disabled={disabled}
          placeholder={question.customPlaceholder ?? "Add another response…"}
          onChange={(value) =>
            onChange({
              selected: question.multiple ? answer.selected : [],
              custom: value,
            })
          }
          className={cn("p-0.5", question.options?.length && "mt-1.5")}
          classNames={{
            field:
              "h-10 rounded-xl border-0 bg-background/70 focus-within:bg-background",
            input: "px-3 text-sm",
          }} />
      ) : null}
    </div>
  );
}

function ProgressDots({
  current,
  ids
}) {
  return (
    <span className="flex gap-1.5">
      <span className="sr-only">
        Question {current + 1} of {ids.length}
      </span>
      {ids.map((id, index) => (
        <motion.span
          key={id}
          aria-hidden="true"
          initial={{
            scale: index === current ? 1 : 0.75,
            opacity: index <= current ? 1 : 0.35,
          }}
          animate={{
            scale: index === current ? 1 : 0.75,
            opacity: index <= current ? 1 : 0.35,
          }}
          transition={SPRING_SWAP}
          className="size-1.5 rounded-full bg-foreground" />
      ))}
    </span>
  );
}

export function ApprovalCard({
  title = "Approval required",
  description,
  children,
  questions = [],
  status = "pending",
  answers,
  defaultAnswers = {},
  onAnswersChange,
  step,
  defaultStep = 0,
  onStepChange,
  onSubmit,
  onApprove,
  onReject,
  onRequestChanges,
  onDismiss,
  approveLabel = "Approve",
  submitLabel = "Submit response",
  result,
  className
}) {
  const reduce = useReducedMotion() ?? false;
  const [internalAnswers, setInternalAnswers] =
    useState(defaultAnswers);
  const [internalStep, setInternalStep] = useState(defaultStep);
  const autoAdvanceTimer = useRef(undefined);
  const currentAnswers = answers ?? internalAnswers;
  const currentStep = Math.min(Math.max(0, step ?? internalStep), Math.max(0, questions.length - 1));
  const question = questions[currentStep];
  const questionMode = questions.length > 0;
  const multipleQuestions = questions.length > 1;
  const pending = status === "pending";
  const busy = status === "submitting";
  const interactive = pending || busy;
  const currentAnswer = question
    ? (currentAnswers[question.id] ?? EMPTY_ANSWER)
    : EMPTY_ANSWER;
  const displayTitle = question?.title ?? title;
  const titleKey = question?.id ?? "title"; // not the status: the title stays put when only the status changes
  const statusLabel = getStatusLabel(status);
  // The status icon sits in the badge beside its label, not in the card's left margin.
  const statusIcon = busy ? (
    <LoaderCircle className={cn("size-3", !reduce && "animate-spin")} />
  ) : interactive ? (
    questionMode ? <CircleHelp className="size-3" /> : (
      <svg viewBox="0 0 12 12" className="size-3" fill="none" aria-hidden="true">
        <path d="M6 1.75v5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="6" cy="10.1" r="1" fill="currentColor" />
      </svg>
    )
  ) : status === "rejected" ? (
    <X className="size-3" />
  ) : (
    <Check className="size-3" />
  );

  const clearAutoAdvance = useCallback(() => {
    if (autoAdvanceTimer.current === undefined) return;
    window.clearTimeout(autoAdvanceTimer.current);
    autoAdvanceTimer.current = undefined;
  }, []);

  useEffect(() => clearAutoAdvance, [clearAutoAdvance]);

  const setAnswers = useCallback((next) => {
    if (answers === undefined) setInternalAnswers(next);
    onAnswersChange?.(next);
  }, [answers, onAnswersChange]);

  const setStep = (next) => {
    clearAutoAdvance();
    if (step === undefined) setInternalStep(next);
    onStepChange?.(next);
  };

  const updateCurrentAnswer = (next) => {
    if (!question) return;
    setAnswers({ ...currentAnswers, [question.id]: next });
  };

  const continueQuestion = () => {
    if (currentStep < questions.length - 1) {
      setStep(currentStep + 1);
      return;
    }
    onSubmit?.(currentAnswers);
  };

  const queueAutoAdvance = () => {
    if (
      !question ||
      question.multiple ||
      question.autoAdvance === false ||
      currentStep >= questions.length - 1 ||
      busy
    ) {
      return;
    }

    clearAutoAdvance();
    autoAdvanceTimer.current = window.setTimeout(() => {
      setStep(currentStep + 1);
    }, 240);
  };

  return (
    <div
      data-state={status}
      aria-busy={busy}
      className={cn("flex w-full flex-col overflow-hidden rounded-2xl bg-muted p-4 text-sm", className)}>
      <div className="flex flex-1 items-start gap-3">
        <div className="flex h-full min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 items-start gap-3">
            <h3
              className="min-w-0 flex-1 text-base font-medium leading-5 text-foreground">
              <ActionSwapRollText value={titleKey}>
                {displayTitle}
              </ActionSwapRollText>
            </h3>
            {questionMode && interactive ? (
              multipleQuestions ? (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground/65">
                  {currentStep + 1}/{questions.length}
                </span>
              ) : null
            ) : (
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                  getStatusBadgeClass(status)
                )}>
                <span aria-hidden="true" className="grid place-items-center">{statusIcon}</span>
                {statusLabel}
              </span>
            )}
            {onDismiss ? (
              <button
                type="button"
                aria-label="Dismiss"
                onClick={onDismiss}
                className="grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                <X className="size-4" />
              </button>
            ) : null}
          </div>

          <AgentDisclosure open={interactive} className={interactive ? "flex flex-1 flex-col" : undefined} transition={{ duration: reduce ? 0 : 0.45, ease: [0.4, 0, 0.2, 1] }}>
            {questionMode && question ? (
              <AnimatePresence initial={false} mode="wait">
                <motion.div
                  key={question.id}
                  initial={reduce ? { opacity: 1 } : { opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, x: -6 }}
                  transition={{ duration: reduce ? 0 : 0.2, ease: EASE_OUT }}>
                  {question.description ? (
                    <p className="mt-1 leading-5 text-muted-foreground">
                      {question.description}
                    </p>
                  ) : null}
                  <QuestionOptions
                    question={question}
                    answer={currentAnswer}
                    disabled={busy}
                    onChange={updateCurrentAnswer}
                    onSingleSelect={queueAutoAdvance} />
                </motion.div>
              </AnimatePresence>
            ) : (
              <div>
                {description ? (
                  <p className="mt-1 leading-5 text-muted-foreground">
                    {description}
                  </p>
                ) : null}
                {children ? <div className="mt-3">{children}</div> : null}
              </div>
            )}

            {questionMode ? (
              <div className="mt-4 flex items-center gap-3">
                {multipleQuestions ? (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Previous question"
                      disabled={busy || currentStep === 0}
                      onClick={() => setStep(currentStep - 1)}
                      className="rounded-full">
                      <ArrowLeft className="size-4" />
                    </Button>
                    <ProgressDots current={currentStep} ids={questions.map((item) => item.id)} />
                  </>
                ) : null}
                <Button
                  size={currentStep === questions.length - 1 ? "sm" : "icon"}
                  aria-label={
                    currentStep === questions.length - 1
                      ? "Submit response"
                      : "Next question"
                  }
                  disabled={busy || !isAnswered(currentAnswer)}
                  onClick={continueQuestion}
                  className="ml-auto rounded-full">
                  {busy ? (
                    <LoaderCircle className={cn("size-4", !reduce && "animate-spin")} />
                  ) : currentStep === questions.length - 1 ? (
                    <>
                      {submitLabel}
                      <ArrowRight className="size-3.5" />
                    </>
                  ) : (
                    <ArrowRight className="size-4" />
                  )}
                </Button>
              </div>
            ) : (
              <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-4">
                <Button size="sm" disabled={busy} onClick={onApprove} className="rounded-full">
                  {approveLabel}
                </Button>
                {onRequestChanges ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={onRequestChanges}
                    className="rounded-full">
                    Request changes
                  </Button>
                ) : null}
                {onReject ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={onReject}
                    className="rounded-full text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400">
                    Reject
                  </Button>
                ) : null}
              </div>
            )}
          </AgentDisclosure>

          {!interactive ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {result ?? statusLabel}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
