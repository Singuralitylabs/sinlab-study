import { after } from "next/server";

/**
 * Runs `task` after the response is sent (`after()` extends the serverless function until it
 * finishes, so the work neither delays the response nor is cut off). Outside request scope
 * `after()` throws, so the task just runs inline. The one place that depends on that Next.js
 * behavior; callers must pass a task that handles its own errors.
 */
export async function runAfterResponse(task: () => Promise<unknown>): Promise<void> {
  try {
    after(task);
  } catch {
    await task();
  }
}
