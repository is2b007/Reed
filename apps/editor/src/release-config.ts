export function resolveReleasePlatform(
  args: readonly string[],
  fallback: NodeJS.Platform,
): NodeJS.Platform {
  const splitFlag = args.indexOf("--platform");
  if (splitFlag >= 0 && args[splitFlag + 1]) return args[splitFlag + 1] as NodeJS.Platform;

  const inlineFlag = args.find((argument) => argument.startsWith("--platform="));
  const inlineValue = inlineFlag?.slice("--platform=".length).trim();
  return inlineValue ? inlineValue as NodeJS.Platform : fallback;
}
