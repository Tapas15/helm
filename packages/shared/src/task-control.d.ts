export type TaskControlActionType = "pause" | "resume" | "cancel" | "retry";
export type TaskStatusType = "queued" | "planning" | "running" | "waiting_approval" | "waiting_input" | "scheduled" | "paused" | "succeeded" | "failed" | "cancelled" | "blocked";
export interface TaskControlTransition {
    action: TaskControlActionType;
    from: readonly TaskStatusType[];
    to: TaskStatusType;
}
export declare const TASK_CONTROL_TRANSITIONS: Record<TaskControlActionType, TaskControlTransition>;
export declare const TERMINAL_TASK_STATUSES: ReadonlySet<TaskStatusType>;
export declare function getTaskControlTransition(action: TaskControlActionType): TaskControlTransition;
export declare function canApplyTaskControlAction(action: TaskControlActionType, from: TaskStatusType): boolean;
export declare function assertTaskControlTransition(action: TaskControlActionType, from: TaskStatusType): TaskControlTransition;
//# sourceMappingURL=task-control.d.ts.map