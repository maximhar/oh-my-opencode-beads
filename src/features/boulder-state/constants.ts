/**
 * Boulder State Constants
 *
 * Module kept for backward compatibility. The boulder state file is still
 * used by other hooks (atlas, prometheus) during migration. New code should
 * use beads (bd) commands for issue tracking and work state.
 */

export const BOULDER_DIR = ".sisyphus"
export const BOULDER_FILE = "boulder.json"
export const BOULDER_STATE_PATH = `${BOULDER_DIR}/${BOULDER_FILE}`

export const NOTEPAD_DIR = "notepads"
export const NOTEPAD_BASE_PATH = `${BOULDER_DIR}/${NOTEPAD_DIR}`

/**
 * @deprecated Use `bd ready` / `bd list` instead of scanning plan files.
 */
export const PROMETHEUS_PLANS_DIR = ".sisyphus/plans"
