/**
 * A fence longer than any backtick run in the content, so submitted code (a Markdown README with
 * its own ``` blocks, a template literal containing them) cannot close it early and turn the rest
 * into prompt text at the same level as the instructions.
 */
export function fenceFor(content: string): string {
  // reduce, not Math.max(...runs): a long submission can have more runs than the argument limit.
  const longestRun = (content.match(/`+/g) ?? []).reduce(
    (max, run) => Math.max(max, run.length),
    0
  );
  return "`".repeat(Math.max(3, longestRun + 1));
}
