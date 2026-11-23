import { HelmError, HELM_ERROR_CODES } from "./errors.js";

export type TaskControlActionType = "pause" | "resume" | "cancel" | "retry";
export type TaskStatusType =
  | "queued"
  | "planning"
  | "running"
  | "waiting_approval"
  | "waiting_input"
  | "scheduled"
  | "paused"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "blocked";

export interface TaskControlTransition {
  action: TaskControlActionType;
  from: readonly TaskStatusType[];
  to: TaskStatusType;
}

export const TASK_CONTROL_TRANSITIONS: Record<TaskControlActionType, TaskControlTransition> = {
  pause: {
    action: "pause",
    from: ["queued", "planning", "running", "waiting_approval", "waiting_input", "scheduled"],
    to: "paused",
  },
  resume: {
    action: "resume",
    from: ["paused", "blocked", "failed"],
    to: "queued",
  },
  cancel: {
    action: "cancel",
    from: ["queued", "planning", "running", "waiting_approval", "waiting_input", "scheduled", "paused", "blocked", "failed"],
    to: "cancelled",
  },
  retry: {
    action: "retry",
    from: ["failed", "cancelled", "succeeded", "blocked"],
    to: "queued",
  },
};

export const TERMINAL_TASK_STATUSES: ReadonlySet<TaskStatusType> = new Set([
  "succeeded",
  "failed",
  "cancelled",
]);

export function getTaskControlTransition(action: TaskControlActionType): TaskControlTransition {
  return TASK_CONTROL_TRANSITIONS[action];
}

export function canApplyTaskControlAction(
  action: TaskControlActionType,
  from: TaskStatusType,
): boolean {
  return TASK_CONTROL_TRANSITIONS[action].from.includes(from);
}

export function assertTaskControlTransition(
  action: TaskControlActionType,
  from: TaskStatusType,
): TaskControlTransition {
  const transition = TASK_CONTROL_TRANSITIONS[action];
  if (!transition) {
    throw new HelmError({
      code: HELM_ERROR_CODES.INVALID_TRANSITION,
      message: "Unsupported task control action",
      retryable: false,
      context: { action, from },
    });
  }
  if (!transition.from.includes(from)) {
    throw new HelmError({
      code: HELM_ERROR_CODES.INVALID_TRANSITION,
      message: `Cannot ${action} task from status ${from}`,
      retryable: false,
      context: { action, from, to: transition.to, allowedFrom: [...transition.from] },
    });
  }
  return transition;
}
