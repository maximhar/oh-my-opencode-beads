/**
 * Boulder State Types
 *
 * Legacy BoulderState is retained for backward compatibility with
 * atlas hooks and other consumers. New beads-oriented types are
 * defined here for the migrated start-work flow.
 */

/**
 * @deprecated Prefer ActiveWorkState for new code.
 * Retained for backward compatibility with atlas hooks.
 */
export interface BoulderState {
  /** Absolute path to the active plan file */
  active_plan: string
  /** ISO timestamp when work started */
  started_at: string
  /** Session IDs that have worked on this plan */
  session_ids: string[]
  /** Plan name derived from filename */
  plan_name: string
  /** Agent type to use when resuming (e.g., 'atlas') */
  agent?: string
}

/**
 * @deprecated Use beads issue status instead.
 */
export interface PlanProgress {
  /** Total number of checkboxes */
  total: number
  /** Number of completed checkboxes */
  completed: number
  /** Whether all tasks are done */
  isComplete: boolean
}

/**
 * Beads-oriented active work state.
 *
 * Tracks which beads issue is currently being worked on in this session,
 * replacing the old plan-file-centric BoulderState for start-work flows.
 */
export interface ActiveWorkState {
  /** Beads issue ID currently being worked (e.g., "beads-abc") */
  active_issue_id: string | null
  /** Human-readable title of the active issue */
  active_issue_title: string | null
  /** ISO timestamp when the current work session started */
  started_at: string
  /** Session IDs that have worked on this issue */
  session_ids: string[]
  /** Agent type to use (e.g., 'atlas') */
  agent?: string
}
