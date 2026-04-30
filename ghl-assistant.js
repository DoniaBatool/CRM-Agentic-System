import { spawn } from "child_process";
import readline from "readline";

const ALLOWED_NOTEBOOKS = [
  { id: "b7efb8aa-d135-4fc8-940c-3e6bd23dc795", name: "GoHighLevel" },
  { id: "2a026e4a-611e-4932-b711-f8b829102902", name: "GoHighLevel AI Employee" },
];

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

// NotebookLM MCP tool caller
async function queryNotebook(notebookId, question) {
  return new Promise((resolve, reject) => {
    const proc = spawn("nlm", [
      "notebook", "query",
      notebookId,
      question
    ]);

    let output = "";
    let error = "";

    proc.stdout.on("data", (data) => output += data.toString());
    proc.stderr.on("data", (data) => error += data.toString());

    proc.on("close", (code) => {
      if (code === 0) resolve(output.trim());
      else reject(new Error(error || "Query failed"));
    });
  });
}

async function crossQuery(question) {
  return new Promise((resolve, reject) => {
    const notebookIds = ALLOWED_NOTEBOOKS.map(n => n.id).join(",");
    const proc = spawn("nlm", [
      "cross", "query",
      "--notebooks", notebookIds,
      question
    ]);

    let output = "";
    let error = "";

    proc.stdout.on("data", (data) => output += data.toString());
    proc.stderr.on("data", (data) => error += data.toString());

    proc.on("close", (code) => {
      if (code === 0) resolve(output.trim());
      else reject(new Error(error || "Cross query failed"));
    });
  });
}

async function main() {
  console.log("\n🤖 GHL Knowledge Assistant");
  console.log("===========================");
  console.log("📚 Available notebooks:");
  ALLOWED_NOTEBOOKS.forEach(n => console.log(`   • ${n.name}`));
  console.log("\nType 'exit' to quit\n");

  // Choose notebook
  console.log("Kaunsi notebook use karni hai?");
  ALLOWED_NOTEBOOKS.forEach((n, i) => console.log(`  ${i + 1}. ${n.name}`));
  console.log(`  ${ALLOWED_NOTEBOOKS.length + 1}. Dono notebooks (cross query)`);

  const choice = await ask("\nChoice: ");
  const choiceNum = parseInt(choice.trim());

  let selectedNotebook = null;
  let useCrossQuery = false;

  if (choiceNum === ALLOWED_NOTEBOOKS.length + 1) {
    useCrossQuery = true;
    console.log("\n✅ Dono notebooks use hongi\n");
  } else if (choiceNum >= 1 && choiceNum <= ALLOWED_NOTEBOOKS.length) {
    selectedNotebook = ALLOWED_NOTEBOOKS[choiceNum - 1];
    console.log(`\n✅ ${selectedNotebook.name} selected\n`);
  } else {
    console.log("❌ Invalid choice!");
    rl.close();
    return;
  }

  // Question loop
  while (true) {
    const question = await ask("❓ Sawaal: ");

    if (question.toLowerCase() === "exit") {
      console.log("\n👋 Bye!");
      break;
    }

    if (!question.trim()) continue;

    console.log("\n⏳ Jawab dhundh raha hun...\n");

    try {
      let answer;
      if (useCrossQuery) {
        answer = await crossQuery(question);
      } else {
        answer = await queryNotebook(selectedNotebook.id, question);
      }
      console.log("📖 Jawab:");
      console.log("─────────────────────────────");
      console.log(answer);
      console.log("─────────────────────────────\n");
    } catch (e) {
      console.log(`❌ Error: ${e.message}\n`);
    }
  }

  rl.close();
}

main();