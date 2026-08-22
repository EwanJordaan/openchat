/**
 * Optional planner stub — rule based decomposition.
 * Used by run.ts when query contains conjunctions.
 */
export interface PlanResult {
  subTasks: string[];
}

export async function plan(opts: { query: string }): Promise<PlanResult> {
  const q = opts.query.trim();
  if (!q) return { subTasks: [] };

  // Simple rule: split on " and " / " then " / "; "
  const delimiters = /\s+(?:and|then|also|plus)\s+|\s*;\s*/i;
  if (delimiters.test(q)) {
    const parts = q
      .split(delimiters)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5);
    if (parts.length > 1) return { subTasks: parts };
  }

  // Fallback: single task
  return { subTasks: [q] };
}
