#!/usr/bin/env node
import process from "node:process";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { Argument, Command, Option } from "commander";
import {
  ReedError,
  ReedProject,
  checkpointProjectGit,
  createProjectGitBranch,
  createProjectPullRequestHandoff,
  exportGameData,
  exportProjectJson,
  exportPixelCrushers,
  exportScreenplay,
  exportVoicePackage,
  getVoiceBudget,
  getSchemaDescriptor,
  initializeProjectGit,
  inspectProjectGit,
  setProjectGitRemote,
  validateProject,
  GAME_EXPORT_FORMATS,
  type GameExportFormat,
  type MutationSource,
} from "@reed/core";

interface GlobalOptions {
  project: string;
  json: boolean;
  source: MutationSource;
}

function integer(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) throw new Error(`Expected an integer, received ${value}`);
  return parsed;
}

function globals(command: Command): GlobalOptions {
  return command.optsWithGlobals<GlobalOptions>();
}

function print(value: unknown, command: Command): void {
  if (globals(command).json) {
    process.stdout.write(`${JSON.stringify({ ok: true, data: value }, null, 2)}\n`);
    return;
  }
  if (typeof value === "string") process.stdout.write(`${value}\n`);
  else process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function useProject<T>(command: Command, action: (project: ReedProject) => Promise<T> | T): Promise<T> {
  const project = await ReedProject.open(globals(command).project);
  try {
    return await action(project);
  } finally {
    project.close();
  }
}

const program = new Command()
  .name("reed")
  .description("Offline project tools for the Reed branching dialogue editor")
  .version("0.2.3")
  .option("-p, --project <directory>", "Reed project folder", process.cwd())
  .option("--json", "print a stable machine-readable envelope", false)
  .addOption(new Option("--source <source>", "mutation source").choices(["human", "agent", "system"]).default("human"));

program.command("init")
  .description("create a Reed project")
  .argument("[directory]", "project directory", ".")
  .requiredOption("--name <name>", "project name")
  .requiredOption("--slug <slug>", "stable project slug")
  .option("--languages <codes>", "comma-separated language codes", "en,el,it,de,griko")
  .option("--default-language <code>", "default writing language", "en")
  .action(async (directory: string, options: { name: string; slug: string; languages: string; defaultLanguage: string }, command: Command) => {
    const project = await ReedProject.create(path.resolve(directory), {
      name: options.name, slug: options.slug,
      languages: options.languages.split(",").map((value) => value.trim()).filter(Boolean),
      defaultLanguage: options.defaultLanguage,
    });
    try { print({ project: project.getProject(), paths: project.paths }, command); } finally { project.close(); }
  });

program.command("update-project")
  .description("update versioned project identity and language settings")
  .option("--name <name>", "project name")
  .option("--slug <slug>", "stable project slug")
  .option("--languages <codes>", "comma-separated language codes")
  .option("--default-language <code>", "default writing language")
  .addOption(new Option("--pull-requests <provider>", "pull request workflow").choices(["disabled", "github"]))
  .option("--pr-base <branch>", "pull request base branch")
  .option("--expected-version <number>", "project version", integer)
  .action(async (options: { name?: string; slug?: string; languages?: string; defaultLanguage?: string; pullRequests?: "disabled" | "github"; prBase?: string; expectedVersion?: number }, command: Command) => {
    if (!options.name && !options.slug && !options.languages && !options.defaultLanguage && !options.pullRequests && !options.prBase) throw new Error("Provide at least one project setting to update");
    print(await useProject(command, (project) => project.updateProject({
      name: options.name, slug: options.slug,
      languages: options.languages?.split(",").map((value) => value.trim()).filter(Boolean),
      defaultLanguage: options.defaultLanguage, pullRequestProvider: options.pullRequests, pullRequestBaseBranch: options.prBase,
      expectedVersion: options.expectedVersion, source: globals(command).source,
    })), command);
  });

program.command("add-level")
  .description("add a level")
  .argument("<name>")
  .option("--sort-order <number>", "display order", integer, 0)
  .option("--expected-version <number>", "project version", integer)
  .action(async (name: string, options: { sortOrder: number; expectedVersion?: number }, command: Command) => {
    print(await useProject(command, (project) => project.createLevel({ name, ...options, source: globals(command).source })), command);
  });

program.command("add-scene")
  .description("add a scene and freeze its Line ID prefix")
  .argument("<name>")
  .requiredOption("--slug <slug>")
  .option("--level-id <id>")
  .option("--partition-id <id>")
  .option("--beat-ref <reference>", "beat-sheet reference", "")
  .option("--sort-order <number>", "display order", integer, 0)
  .option("--expected-version <number>", "project version", integer)
  .action(async (name: string, options: { slug: string; levelId?: string; partitionId?: string; beatRef: string; sortOrder: number; expectedVersion?: number }, command: Command) => {
    print(await useProject(command, (project) => project.createScene({ name, ...options, source: globals(command).source })), command);
  });

program.command("update-scene")
  .description("update scene metadata without changing its permanent Line ID prefix")
  .argument("<scene-id>")
  .option("--name <name>")
  .option("--beat-ref <reference>", "local beat-sheet reference")
  .option("--sort-order <number>", "display order", integer)
  .option("--expected-version <number>", "project version", integer)
  .action(async (id: string, options: { name?: string; beatRef?: string; sortOrder?: number; expectedVersion?: number }, command: Command) => {
    print(await useProject(command, (project) => project.updateScene({ id, ...options, source: globals(command).source })), command);
  });

program.command("add-partition")
  .description("reserve a stable Pixel Crushers Base ID range")
  .argument("<name>")
  .addOption(new Option("--scope <scope>").choices(["project", "level", "scene"]).default("project"))
  .option("--scope-id <id>")
  .requiredOption("--base-id <number>", "first ID in the reserved range", integer)
  .option("--range-size <number>", "number of IDs reserved", integer, 100000)
  .option("--export-order <number>", "database export order", integer, 0)
  .option("--expected-version <number>", "project version", integer)
  .action(async (name: string, options: { scope: "project" | "level" | "scene"; scopeId?: string; baseId: number; rangeSize: number; exportOrder: number; expectedVersion?: number }, command: Command) => {
    print(await useProject(command, (project) => project.createPartition({
      name, scopeType: options.scope, scopeId: options.scopeId ?? null, baseId: options.baseId,
      rangeSize: options.rangeSize, exportOrder: options.exportOrder, expectedVersion: options.expectedVersion, source: globals(command).source,
    })), command);
  });

program.command("add-conversation")
  .description("add a conversation with its permanent numeric ID and start node")
  .argument("<title>")
  .requiredOption("--scene-id <id>")
  .option("--description <text>", "conversation description", "")
  .option("--expected-version <number>", "project version", integer)
  .action(async (title: string, options: { sceneId: string; description: string; expectedVersion?: number }, command: Command) => {
    print(await useProject(command, (project) => project.createConversation({ title, ...options, source: globals(command).source })), command);
  });

program.command("update-conversation")
  .description("update a conversation title or description")
  .argument("<conversation-id>")
  .option("--title <title>")
  .option("--description <text>")
  .option("--expected-version <number>", "conversation version", integer)
  .action(async (id: string, options: { title?: string; description?: string; expectedVersion?: number }, command: Command) => {
    print(await useProject(command, (project) => project.updateConversation({ id, ...options, source: globals(command).source })), command);
  });

program.command("add-node")
  .description("add a dialogue or choice node")
  .argument("<conversation-id>")
  .addOption(new Option("--kind <kind>").choices(["line", "choice", "group"]).default("line"))
  .option("--speaker-id <id>")
  .option("--listener-id <id>")
  .option("--language <code>")
  .option("--text <text>")
  .option("--menu-text <text>")
  .option("--terminal", "mark as a deliberate end", false)
  .option("--x <number>", "canvas x", Number, 0)
  .option("--y <number>", "canvas y", Number, 0)
  .option("--expected-version <number>", "conversation version", integer)
  .action(async (conversationId: string, options: Record<string, unknown>, command: Command) => {
    const input = {
      conversationId, kind: options.kind, speakerCharacterId: options.speakerId, listenerCharacterId: options.listenerId,
      spokenLanguage: options.language, text: options.text, menuText: options.menuText, isTerminal: options.terminal,
      x: options.x, y: options.y, expectedVersion: options.expectedVersion, source: globals(command).source,
    };
    print(await useProject(command, (project) => project.addNode(input as Parameters<ReedProject["addNode"]>[0])), command);
  });

program.command("link")
  .description("link two nodes, including cross-conversation links")
  .argument("<origin-node-id>")
  .argument("<destination-node-id>")
  .option("--priority <number>", "choice order", integer, 0)
  .option("--expected-version <number>", "origin conversation version", integer)
  .option("--force", "confirm a change involving final content", false)
  .action(async (originNodeId: string, destinationNodeId: string, options: { priority: number; expectedVersion?: number; force: boolean }, command: Command) => {
    print(await useProject(command, (project) => project.linkNodes({ originNodeId, destinationNodeId, ...options, source: globals(command).source })), command);
  });

program.command("unlink")
  .description("remove a graph link")
  .argument("<link-id>")
  .option("--expected-version <number>", "origin conversation version", integer)
  .option("--force", "confirm a change involving final content", false)
  .action(async (linkId: string, options: { expectedVersion?: number; force: boolean }, command: Command) => {
    print(await useProject(command, (project) => project.unlinkNodes({ linkId, ...options, source: globals(command).source })), command);
  });

program.command("update-node")
  .description("update dialogue logic, context, layout, or tags")
  .argument("<line-id>")
  .option("--speaker-id <id>")
  .option("--listener-id <id>")
  .option("--language <code>")
  .option("--sequence <text>")
  .option("--conditions <lua>")
  .option("--script <lua>")
  .option("--context <text>")
  .option("--voice-comment <text>")
  .option("--pronunciation <text>")
  .option("--tags <tags>", "comma-separated tags")
  .option("--terminal <value>", "true or false")
  .option("--x <number>", "canvas x", Number)
  .option("--y <number>", "canvas y", Number)
  .option("--expected-version <number>", "conversation version", integer)
  .option("--force", "confirm editing final metadata", false)
  .action(async (lineId: string, options: Record<string, unknown>, command: Command) => {
    print(await useProject(command, (project) => project.updateNode({
      lineId, speakerCharacterId: options.speakerId as string | undefined, listenerCharacterId: options.listenerId as string | undefined,
      spokenLanguage: options.language as string | undefined, sequence: options.sequence as string | undefined,
      conditions: options.conditions as string | undefined, userScript: options.script as string | undefined,
      contextComment: options.context as string | undefined, voiceComment: options.voiceComment as string | undefined,
      pronunciation: options.pronunciation as string | undefined,
      tags: typeof options.tags === "string" ? options.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : undefined,
      isTerminal: typeof options.terminal === "string" ? options.terminal === "true" : undefined,
      x: options.x as number | undefined, y: options.y as number | undefined,
      expectedVersion: options.expectedVersion as number | undefined, force: Boolean(options.force), source: globals(command).source,
    })), command);
  });

program.command("delete-node")
  .description("delete a node after exact Line ID confirmation")
  .argument("<line-id>")
  .requiredOption("--confirm <line-id>")
  .option("--expected-version <number>", "conversation version", integer)
  .option("--force", "confirm deleting final content", false)
  .action(async (lineId: string, options: { confirm: string; expectedVersion?: number; force: boolean }, command: Command) => {
    print(await useProject(command, (project) => project.deleteNode({ lineId, confirmation: options.confirm, expectedVersion: options.expectedVersion, force: options.force, source: globals(command).source })), command);
  });

program.command("import-conversation")
  .description("import and auto-layout a complete conversation graph from JSON")
  .argument("[file]", "JSON file; omit or use - for stdin", "-")
  .action(async (file: string, _options: unknown, command: Command) => {
    const raw = file === "-" ? await new Promise<string>((resolve) => {
      let value = "";
      process.stdin.setEncoding("utf8"); process.stdin.on("data", (chunk) => { value += String(chunk); }); process.stdin.on("end", () => resolve(value));
    }) : await readFile(path.resolve(file), "utf8");
    print(await useProject(command, (project) => project.importConversation({ ...JSON.parse(raw) as object, source: globals(command).source } as Parameters<ReedProject["importConversation"]>[0])), command);
  });

program.command("set-text")
  .description("set one language value for a permanent Line ID")
  .argument("<line-id>")
  .argument("<language>")
  .argument("<text>")
  .option("--menu-text <text>")
  .addOption(new Option("--verification <status>").choices(["unverified", "native-verified"]))
  .option("--expected-version <number>", "conversation version", integer)
  .option("--force", "confirm editing final content", false)
  .action(async (lineId: string, language: string, text: string, options: Record<string, unknown>, command: Command) => {
    print(await useProject(command, (project) => project.setNodeText({
      lineId, language, text, menuText: options.menuText as string | undefined,
      verificationStatus: options.verification as "unverified" | "native-verified" | undefined,
      expectedVersion: options.expectedVersion as number | undefined, force: Boolean(options.force), source: globals(command).source,
    })), command);
  });

program.command("set-status")
  .description("change a line production status")
  .argument("<line-id>")
  .addArgument(new Argument("<status>").choices(["placeholder", "draft", "polished", "edited", "final", "rework"]))
  .option("--expected-version <number>", "conversation version", integer)
  .option("--force", "confirm final status", false)
  .action(async (lineId: string, status: "placeholder" | "draft" | "polished" | "edited" | "final" | "rework", options: { expectedVersion?: number; force: boolean }, command: Command) => {
    print(await useProject(command, (project) => project.setLineStatus({ lineId, status, ...options, source: globals(command).source })), command);
  });

program.command("set-voice-status")
  .description("change a line voice-production status")
  .argument("<line-id>")
  .addArgument(new Argument("<status>").choices(["none", "placeholder", "recorded", "processed", "final", "rework"]))
  .option("--expected-version <number>", "conversation version", integer)
  .option("--force", "confirm final voice status", false)
  .action(async (lineId: string, status: "none" | "placeholder" | "recorded" | "processed" | "final" | "rework", options: { expectedVersion?: number; force: boolean }, command: Command) => {
    print(await useProject(command, (project) => project.setVoiceStatus({ lineId, status, ...options, source: globals(command).source })), command);
  });

program.command("upsert-character")
  .description("create or update a character")
  .argument("<name>")
  .option("--id <id>")
  .option("--player", "mark as player", false)
  .option("--description <text>", "character description", "")
  .option("--actor-notes <text>", "performance notes", "")
  .option("--voice-notes <text>", "voice notes", "")
  .option("--portrait <path>")
  .option("--expected-version <number>", "project version", integer)
  .action(async (name: string, options: Record<string, unknown>, command: Command) => {
    print(await useProject(command, (project) => project.upsertCharacter({
      id: options.id as string | undefined, name, displayNames: {}, isPlayer: Boolean(options.player),
      portraitPath: options.portrait as string | undefined ?? null, description: String(options.description ?? ""),
      actorNotes: String(options.actorNotes ?? ""), voiceNotes: String(options.voiceNotes ?? ""),
      expectedVersion: options.expectedVersion as number | undefined, source: globals(command).source,
    })), command);
  });

program.command("declare-variable")
  .description("declare a dialogue variable")
  .argument("<name>")
  .addOption(new Option("--type <type>").choices(["boolean", "number", "text"]).makeOptionMandatory())
  .requiredOption("--initial <value>")
  .option("--description <text>", "variable purpose", "")
  .option("--expected-version <number>", "project version", integer)
  .action(async (name: string, options: { type: "boolean" | "number" | "text"; initial: string; description: string; expectedVersion?: number }, command: Command) => {
    const initialValue = options.type === "boolean" ? options.initial === "true" : options.type === "number" ? Number(options.initial) : options.initial;
    print(await useProject(command, (project) => project.declareVariable({ name, type: options.type, initialValue, description: options.description, expectedVersion: options.expectedVersion, source: globals(command).source })), command);
  });

program.command("list-scenes").description("list scenes").action(async (_options: unknown, command: Command) => {
  print(await useProject(command, (project) => project.listScenes()), command);
});

program.command("list-characters").description("list characters").action(async (_options: unknown, command: Command) => {
  print(await useProject(command, (project) => project.listCharacters()), command);
});

program.command("list-variables").description("list typed dialogue variables and their initial values").action(async (_options: unknown, command: Command) => {
  print(await useProject(command, (project) => project.listVariables()), command);
});

program.command("list-partitions").description("list stable database ID ranges").action(async (_options: unknown, command: Command) => {
  print(await useProject(command, (project) => project.listPartitions()), command);
});

program.command("list-conversations").description("list conversations").action(async (_options: unknown, command: Command) => {
  print(await useProject(command, (project) => project.listConversations()), command);
});

program.command("get-conversation").description("read a complete conversation graph").argument("<id>")
  .action(async (id: string, _options: unknown, command: Command) => print(await useProject(command, (project) => project.getConversation(id)), command));

program.command("changes").description("read the append-only mutation stream").option("--after <sequence>", "last seen sequence", integer, 0)
  .action(async (options: { after: number }, command: Command) => print(await useProject(command, (project) => project.getChanges(options.after)), command));

program.command("find").description("search dialogue text locally").argument("<query>").option("--limit <number>", "maximum matches", integer, 50)
  .action(async (query: string, options: { limit: number }, command: Command) => print(await useProject(command, (project) => project.find(query, options.limit)), command));

program.command("validate").description("validate graph, localization, variable, and ID integrity")
  .action(async (_options: unknown, command: Command) => {
    const report = await useProject(command, (project) => validateProject(project));
    print(report, command);
    if (!report.valid) process.exitCode = 2;
  });

program.command("backup").description("create a named local SQLite snapshot").argument("[label]", "snapshot label", "manual")
  .action(async (label: string, _options: unknown, command: Command) => print(await useProject(command, (project) => project.createBackup("named", label)), command));

program.command("git-status").description("inspect offline local Git history without contacting a remote")
  .action(async (_options: unknown, command: Command) => print(await useProject(command, (project) => inspectProjectGit(project.paths.root)), command));

program.command("git-init").description("initialize offline local Git history and create the first story checkpoint")
  .action(async (_options: unknown, command: Command) => print(await useProject(command, async (project) => {
    await exportProjectJson(project);
    await initializeProjectGit(project.paths.root);
    return checkpointProjectGit(project.paths.root, "Initial Reed story");
  }), command));

program.command("git-checkpoint").description("export current story JSON and create an offline local Git checkpoint").argument("<message>")
  .action(async (message: string, _options: unknown, command: Command) => print(await useProject(command, async (project) => {
    await exportProjectJson(project);
    return checkpointProjectGit(project.paths.root, message);
  }), command));

program.command("git-branch").description("create an offline local story branch from a clean checkpoint").argument("<name>")
  .action(async (name: string, _options: unknown, command: Command) => print(await useProject(command, async (project) => {
    await exportProjectJson(project);
    return createProjectGitBranch(project.paths.root, name);
  }), command));

program.command("git-pr-handoff").description("prepare copyable GitHub CLI PR commands without making network requests")
  .requiredOption("--title <title>", "pull request title")
  .option("--body <body>", "pull request review notes", "")
  .option("--base <branch>", "base branch; defaults to project settings")
  .option("--number <number>", "existing pull request number for view and merge commands", integer)
  .action(async (options: { title: string; body: string; base?: string; number?: number }, command: Command) => print(await useProject(command, async (project) => {
    await exportProjectJson(project);
    return createProjectPullRequestHandoff(project.paths.root, {
      baseBranch: options.base ?? project.getProject().pullRequestBaseBranch,
      title: options.title, body: options.body, pullRequestNumber: options.number,
    });
  }), command));

program.command("git-set-remote").description("store or remove an origin URL locally without connecting to it").argument("[url]").option("--remove", "remove the configured origin", false)
  .action(async (url: string | undefined, options: { remove: boolean }, command: Command) => {
    if (!options.remove && !url) throw new Error("Provide a remote URL or use --remove");
    print(await useProject(command, (project) => setProjectGitRemote(project.paths.root, options.remove ? null : url ?? null)), command);
  });

program.command("restore")
  .description("restore a local snapshot after exact backup ID confirmation")
  .argument("<backup-id>")
  .requiredOption("--confirm <backup-id>")
  .action(async (backupId: string, options: { confirm: string }, command: Command) => print(await useProject(command, (project) => project.restoreBackup(backupId, options.confirm)), command));

program.command("review-diff").description("show changes since the last human-approved snapshot")
  .action(async (_options: unknown, command: Command) => print(await useProject(command, (project) => project.getReviewDiff()), command));

program.command("approve-review").description("approve pending changes and create a named snapshot").argument("<label>")
  .action(async (label: string, _options: unknown, command: Command) => print(await useProject(command, (project) => project.approveReview(label)), command));

program.command("export-project").description("write deterministic Reed project JSON").option("-o, --output <path>")
  .action(async (options: { output?: string }, command: Command) => print(await useProject(command, (project) => exportProjectJson(project, options.output)), command));

program.command("export-pixelcrushers")
  .description("export Pixel Crushers DialogueDatabase JSON and audio manifest")
  .addOption(new Option("--mode <mode>").choices(["single", "partitioned"]).default("single"))
  .option("-o, --output <directory>")
  .option("--allow-invalid", "export despite validation errors", false)
  .action(async (options: { mode: "single" | "partitioned"; output?: string; allowInvalid: boolean }, command: Command) => {
    print(await useProject(command, (project) => exportPixelCrushers(project, { mode: options.mode, outputDirectory: options.output, allowInvalid: options.allowInvalid })), command);
  });

program.command("export-game-data")
  .description("export localization data for common game engines and interchange tools")
  .requiredOption("--format <format>", `format: ${GAME_EXPORT_FORMATS.join(", ")}`)
  .option("--languages <codes>", "comma-separated enabled languages; defaults to all")
  .option("-o, --output <directory>")
  .action(async (options: { format: GameExportFormat; languages?: string; output?: string }, command: Command) => {
    if (!GAME_EXPORT_FORMATS.includes(options.format)) throw new Error(`Unsupported format: ${options.format}`);
    print(await useProject(command, (project) => exportGameData(project, {
      format: options.format,
      languages: options.languages?.split(",").map((value) => value.trim()).filter(Boolean),
      outputDirectory: options.output,
    })), command);
  });

program.command("export-voice")
  .description("export actor PDF and editable CSV/XLSX studio package")
  .option("--language <code>")
  .option("--character <ids>", "comma-separated character IDs")
  .option("--status <statuses>", "comma-separated voice statuses")
  .option("--line-status <statuses>", "comma-separated text statuses")
  .option("-o, --output <directory>")
  .action(async (options: { language?: string; character?: string; status?: string; lineStatus?: string; output?: string }, command: Command) => {
    print(await useProject(command, (project) => exportVoicePackage(project, {
      language: options.language, characterIds: options.character?.split(","), voiceStatuses: options.status?.split(","), lineStatuses: options.lineStatus?.split(","), outputDirectory: options.output,
    })), command);
  });

program.command("voice-budget").description("show per-character line, word, and studio-minute estimates").option("--language <code>")
  .action(async (options: { language?: string }, command: Command) => print(await useProject(command, (project) => getVoiceBudget(project, options.language)), command));

program.command("export-screenplay").description("export a golden-path Markdown read script")
  .option("--language <code>").option("--reference-language <code>")
  .action(async (options: { language?: string; referenceLanguage?: string }, command: Command) => print(await useProject(command, (project) => exportScreenplay(project, options.language, options.referenceLanguage)), command));

program.command("schema").description("print the machine-readable command vocabulary")
  .action((_options: unknown, command: Command) => print(getSchemaDescriptor(), command));

program.showSuggestionAfterError();
program.showHelpAfterError();

try {
  const argv = process.argv[2] === "dialogue" ? [...process.argv.slice(0, 2), ...process.argv.slice(3)] : process.argv;
  await program.parseAsync(argv);
} catch (error) {
  const json = process.argv.includes("--json");
  const payload = error instanceof ReedError
    ? { code: error.code, message: error.message, details: error.details }
    : { code: "UNEXPECTED", message: error instanceof Error ? error.message : String(error), details: {} };
  if (json) process.stderr.write(`${JSON.stringify({ ok: false, error: payload }, null, 2)}\n`);
  else process.stderr.write(`Reed: ${payload.message}\n`);
  process.exitCode = 1;
}
