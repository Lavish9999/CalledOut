import { env } from "./env";
import { analytics } from "./analytics";

function sentryEndpoint(dsn: string) {
  try {
    const url = new URL(dsn);
    const project = url.pathname.replace("/", "");
    return {
      url: `${url.protocol}//${url.host}/api/${project}/store/`,
      key: url.username,
    };
  } catch {
    return null;
  }
}

export async function captureException(
  error: unknown,
  context: Record<string, unknown> = {},
) {
  const normalized = error instanceof Error ? error : new Error(String(error));
  if (__DEV__) console.error(normalized, context);
  if (!env.sentryDsn) return;
  const endpoint = sentryEndpoint(env.sentryDsn);
  if (!endpoint) return;
  await fetch(endpoint.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sentry-auth": `Sentry sentry_version=7,sentry_key=${endpoint.key},sentry_client=calledout-mobile/0.1.0`,
    },
    body: JSON.stringify({
      event_id: crypto.randomUUID().replaceAll("-", ""),
      timestamp: new Date().toISOString(),
      platform: "javascript",
      level: "error",
      exception: {
        values: [
          {
            type: normalized.name,
            value: normalized.message,
            stacktrace: {
              frames: (normalized.stack ?? "")
                .split("\n")
                .slice(1)
                .map((line) => ({ filename: line.trim() })),
            },
          },
        ],
      },
      contexts: { calledout: context },
    }),
  }).catch(() => {});
}

export function installGlobalErrorHandler() {
  const errorUtils = (
    globalThis as {
      ErrorUtils?: {
        getGlobalHandler?: () => (error: Error, fatal?: boolean) => void;
        setGlobalHandler?: (
          handler: (error: Error, fatal?: boolean) => void,
        ) => void;
      };
    }
  ).ErrorUtils;
  if (!errorUtils?.setGlobalHandler) return;
  const previous = errorUtils.getGlobalHandler?.();
  errorUtils.setGlobalHandler((error, fatal) => {
    void captureException(error, { fatal: Boolean(fatal) });
    previous?.(error, fatal);
  });
}

export async function measured<T>(
  name: string,
  task: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  try {
    return await task();
  } catch (error) {
    void captureException(error, { operation: name });
    throw error;
  } finally {
    analytics.performance(name, Date.now() - started);
  }
}
