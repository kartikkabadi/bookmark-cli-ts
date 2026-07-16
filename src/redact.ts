const SENSITIVE_ARGUMENTS = new Set(['--csrf-token', '--cookie-header']);

export function redactSensitiveArguments(
  message: string,
  args: readonly string[] = process.argv.slice(2)
): string {
  let redacted = message;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument || !SENSITIVE_ARGUMENTS.has(argument)) continue;
    const value = args[index + 1];
    if (value) redacted = redacted.replaceAll(value, '<redacted>');
    index += 1;
  }
  return redacted;
}
