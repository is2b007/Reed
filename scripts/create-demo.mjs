import path from "node:path";
import { ReedProject } from "../packages/core/dist/index.js";

const root = path.resolve(process.argv[2] ?? "./reed-demo");
const project = await ReedProject.create(root, {
  name: "The Salt Gate",
  slug: "the-salt-gate",
  languages: ["en", "el", "it", "de", "griko"],
  defaultLanguage: "en",
});

try {
  const level = (await project.createLevel({ name: "Chapter One" })).value;
  const scene = (await project.createScene({ name: "Old Harbour", slug: "old-harbour", levelId: level.id, beatRef: "01 — The ferryman waits" })).value;
  const eleni = (await project.upsertCharacter({
    name: "Ελένη", displayNames: { en: "Eleni", el: "Ελένη", it: "Eleni", de: "Eleni", griko: "Eleni" },
    isPlayer: false, portraitPath: null, description: "Harbour keeper and reluctant guide.",
    actorNotes: "Quiet confidence; humour arrives late.", voiceNotes: "Natural room tone.",
  })).value;
  const player = (await project.upsertCharacter({
    name: "Traveller", displayNames: {}, isPlayer: true, portraitPath: null,
    description: "A stranger returning to the island.", actorNotes: "Direct, observant.", voiceNotes: "",
  })).value;
  await project.declareVariable({ name: "MetEleni", type: "boolean", initialValue: false, description: "The harbour introduction has happened." });
  const conversation = (await project.createConversation({ sceneId: scene.id, title: "At the salt gate", description: "The first guarded welcome." })).value;
  const start = conversation.nodes[0];
  if (!start) throw new Error("Demo conversation has no START node");

  const greeting = (await project.addNode({ conversationId: conversation.id, speakerCharacterId: eleni.id, text: "The tide brought you back before the bells.", x: 280, y: 180 })).value;
  const askGate = (await project.addNode({ conversationId: conversation.id, kind: "choice", speakerCharacterId: player.id, text: "Then open the gate.", x: 620, y: 70 })).value;
  const askName = (await project.addNode({ conversationId: conversation.id, kind: "choice", speakerCharacterId: player.id, text: "You remember me?", x: 620, y: 300 })).value;
  const gateReply = (await project.addNode({ conversationId: conversation.id, speakerCharacterId: eleni.id, text: "I remember everyone the sea returns.", x: 960, y: 70, isTerminal: true })).value;
  const nameReply = (await project.addNode({ conversationId: conversation.id, speakerCharacterId: eleni.id, text: "Names fade. Footsteps do not.", x: 960, y: 300, isTerminal: true })).value;

  const translations = new Map([
    [greeting.lineId, { el: "Η παλίρροια σε γύρισε πριν από τις καμπάνες.", it: "La marea ti ha riportato prima delle campane.", de: "Die Flut brachte dich vor den Glocken zurück.", griko: "I marèa s'efere pali prin ta kambàna." }],
    [askGate.lineId, { el: "Τότε άνοιξε την πύλη.", it: "Allora apri il cancello.", de: "Dann öffne das Tor.", griko: "Tòte anìse ti porta." }],
    [askName.lineId, { el: "Με θυμάσαι;", it: "Ti ricordi di me?", de: "Erinnerst du dich an mich?", griko: "Me thimàse?" }],
    [gateReply.lineId, { el: "Θυμάμαι όλους όσους επιστρέφει η θάλασσα.", it: "Ricordo tutti quelli che il mare restituisce.", de: "Ich erinnere mich an jeden, den das Meer zurückbringt.", griko: "Thimùme oli ce i thàlassa fèri pali." }],
    [nameReply.lineId, { el: "Τα ονόματα ξεθωριάζουν. Τα βήματα όχι.", it: "I nomi svaniscono. I passi no.", de: "Namen verblassen. Schritte nicht.", griko: "Ta onòmata svìnune. Ta pàssia no." }],
  ]);
  for (const node of [greeting, askGate, askName, gateReply, nameReply]) {
    for (const [language, text] of Object.entries(translations.get(node.lineId) ?? {})) {
      await project.setNodeText({ lineId: node.lineId, language, text, menuText: node.kind === "choice" ? text : undefined });
    }
    await project.setLineStatus({ lineId: node.lineId, status: "polished" });
  }
  await project.updateNode({ lineId: greeting.lineId, contextComment: "Eleni blocks the harbour entrance at dusk.", voiceComment: "Warm but testing the traveller.", tags: ["arrival", "harbour"] });
  await project.updateNode({ lineId: askName.lineId, conditions: "Variable['MetEleni'] == true", tags: ["memory"] });
  await project.linkNodes({ originNodeId: start.id, destinationNodeId: greeting.id });
  await project.linkNodes({ originNodeId: greeting.id, destinationNodeId: askGate.id, priority: 0 });
  await project.linkNodes({ originNodeId: greeting.id, destinationNodeId: askName.id, priority: 1 });
  await project.linkNodes({ originNodeId: askGate.id, destinationNodeId: gateReply.id });
  await project.linkNodes({ originNodeId: askName.id, destinationNodeId: nameReply.id });
  await project.approveReview("Demo baseline");
  process.stdout.write(`${root}\n`);
} finally {
  project.close();
}
