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
 * Tracks which beads epic is currently active for this session,
 * replacing the old plan-file-centric BoulderState for start-work flows.
 */
export interface ActiveWorkState {
  /** Beads epic ID currently active (e.g., "beads-abc") */
  active_epic_id: string | null
  /** Human-readable title of the active epic */
  active_epic_title: string | null
  /** ISO timestamp when the current work session started */
  started_at: string
  /** Session IDs that have worked in this active epic */
  session_ids: string[]
  /** Agent type to use (e.g., 'atlas') */
  agent?: string
}
