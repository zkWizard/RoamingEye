import {
  paths,
  readJson,
  sortTools,
  uniqueStrings,
  writeJson,
} from "./common.mjs";

const ACCESS_NOTES = {
  Desktop: "Use the documented installer or package for your operating system.",
  "Python library":
    "Use an isolated Python environment and follow the project guide.",
  "Command line": "Follow the documented package or source-install guide.",
  Library: "Review the project guide for language-specific installation steps.",
  "Web service": "This option requires a hosted or local service deployment.",
};

function editAccess(tool) {
  const notes = tool.access.map((path) => ACCESS_NOTES[path]).filter(Boolean);
  return {
    ...tool,
    accessNotes: uniqueStrings(
      notes.length > 0
        ? notes
        : [
            "Read the linked project guide before choosing an installation path.",
          ]
    ),
  };
}

/** Makes access expectations visible without guessing a project's install commands. */
export async function runAccessEditor() {
  const mapped = readJson(paths.mapped, { tools: [] }).tools;
  const tools = sortTools(mapped.map(editAccess));
  writeJson(paths.edited, { version: 1, tools });
  console.log(
    `access-editor: added access guidance for ${tools.length} records`
  );
  return { edited: tools.length };
}
