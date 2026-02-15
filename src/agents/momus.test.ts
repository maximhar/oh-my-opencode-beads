import { describe, test, expect } from "bun:test"
import { MOMUS_SYSTEM_PROMPT } from "./momus"

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

describe("MOMUS_SYSTEM_PROMPT policy requirements", () => {
  test("should treat SYSTEM DIRECTIVE as ignorable/stripped", () => {
    // given
    const prompt = MOMUS_SYSTEM_PROMPT
    
    // when / #then
    // Should mention that system directives are ignored
    expect(prompt.toLowerCase()).toMatch(/system directive.*ignore|ignore.*system directive/)
    // Should give examples of system directive patterns
    expect(prompt).toMatch(/<system-reminder>|system-reminder/)
  })

  test("should accept beads issue references as valid input", () => {
    // given
    const prompt = MOMUS_SYSTEM_PROMPT

    // when / #then
    expect(prompt.toLowerCase()).toMatch(/beads|bd show|issue graph/)
    // Extraction policy should be mentioned
    expect(prompt.toLowerCase()).toMatch(/extract|search|find/)
  })

  test("should accept beads issue context as valid input", () => {
    // given
    const prompt = MOMUS_SYSTEM_PROMPT

    // when / #then
    // Should mention beads issue content as valid
    expect(prompt.toLowerCase()).toMatch(/beads|bd show|issue/)
    // Should describe inline plan content as acceptable
    expect(prompt.toLowerCase()).toMatch(/inline/)
  })

  test("should NOT teach that conversational issue wrappers are invalid", () => {
    // given
    const prompt = MOMUS_SYSTEM_PROMPT

    // when / #then
    // In RED phase, this will FAIL because current prompt explicitly lists this as INVALID
    const invalidExample = "Please review issue oh-my-opencode-beads-abc"
    const rejectionTeaching = new RegExp(
      `reject.*${escapeRegExp(invalidExample)}`,
      "i",
    )
    
    // We want the prompt to NOT reject this anymore. 
    // If it's still in the "INVALID" list, this test should fail.
    expect(prompt).not.toMatch(rejectionTeaching)
  })

  test("should handle ambiguity and 'no plan content found' rejection", () => {
    // given
    const prompt = MOMUS_SYSTEM_PROMPT

    // when / #then
    // Should mention what happens when multiple references are found
    expect(prompt.toLowerCase()).toMatch(/multiple|ambiguous|2\+|two/)
    // Should mention rejection if no plan content found
    expect(prompt.toLowerCase()).toMatch(/no plan content|no plan.*found|reject/)
  })
})
