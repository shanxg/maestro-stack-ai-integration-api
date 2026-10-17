// 🪵 LOG CAPTURE: Records everything the API asks to log, so a test can check what would reach the
// log files (issue #53). The suites run with LOG_LEVEL=silent, so pino writes nothing; spying on the
// logger's methods still records every call, whatever the level. console.* is watched too, so a
// stray console call that bypasses the logger is caught as well.
import { jest } from '@jest/globals';

type Spied = { mock: { calls: unknown[][] }; mockRestore: () => void };
const LOGGER_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const;

// Turn one logged argument into text, including the fields of an Error (message, detail and
// any other own property), which JSON.stringify alone would drop.
function describe(value: unknown): string {
  if (value instanceof Error) {
    return JSON.stringify({ ...value, message: value.message, stack: value.stack });
  }
  try {
    return typeof value === 'string'
      ? value
      : JSON.stringify(value, (_key, inner) => (inner instanceof Error ? { ...inner, message: inner.message } : inner));
  } catch {
    return String(value);
  }
}

export function captureLogs(logger: Record<(typeof LOGGER_LEVELS)[number], unknown>) {
  // pino's methods have overloaded signatures that jest.spyOn cannot infer; viewing the logger as a
  // map of plain functions lets the spies replace them with a no-op that the type-checker accepts.
  const loggerMethods = logger as unknown as Record<string, (...args: unknown[]) => unknown>;
  const spies: Spied[] = [
    ...LOGGER_LEVELS.map(
      (level) => jest.spyOn(loggerMethods, level).mockImplementation(() => undefined) as unknown as Spied
    ),
    ...CONSOLE_METHODS.map((method) => jest.spyOn(console, method).mockImplementation(() => {}) as unknown as Spied)
  ];

  return {
    // Every recorded call, one line per call, ready for toContain / not.toContain checks.
    text: () => spies.flatMap((spy) => spy.mock.calls.map((call) => call.map(describe).join(' '))).join('\n'),
    // The raw argument lists of the logger's error calls (for checks on the logged error object).
    errorCalls: () => (spies[LOGGER_LEVELS.indexOf('error')] as Spied).mock.calls,
    restore: () => spies.forEach((spy) => spy.mockRestore())
  };
}
