let tail: Promise<unknown> = Promise.resolve();

export function enqueueTTSRequest<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task, task);
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  input: RequestInfo,
  init: RequestInit,
  attempts = 3,
): Promise<Response> {
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) {
      await sleep(800 * attempt);
    }

    const response = await fetch(input, init);
    if (response.ok) return response;

    lastResponse = response;
    if (response.status !== 500 && response.status !== 502 && response.status !== 503) {
      return response;
    }
  }

  return lastResponse ?? new Response(null, { status: 500 });
}
