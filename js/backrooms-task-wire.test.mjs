import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { MEG_TASK_CATALOG } from "./backrooms-meg-task-catalog.js";

const directory = new URL(".", import.meta.url);
const files = (await readdir(directory)).filter(
  (name) => name.endsWith(".js") && !name.includes("task-catalog")
);
const source = (
  await Promise.all(files.map((name) => readFile(new URL(name, directory), "utf8")))
).join("\n");

function escaped(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("every automatic field/package destination reports level entry", () => {
  for (const task of MEG_TASK_CATALOG) {
    const levels =
      task.type === "field"
        ? task.fieldLevelIds
        : task.type === "package" && task.autoDeliverOnEnter
          ? [task.destinationLevelId]
          : [];
    for (const level of levels) {
      assert.match(
        source,
        new RegExp(`markLevelEntered\\([\"']${escaped(level)}[\"']`),
        `${task.id}: ${level} has no markLevelEntered hook`
      );
    }
  }
});

test("legacy interactive tasks remain wired to their task ids", () => {
  for (const task of MEG_TASK_CATALOG) {
    if (task.type === "field" || task.autoDeliverOnEnter) continue;
    assert.match(source, new RegExp(`[\"']${escaped(task.id)}[\"']`), task.id);
  }
  assert.match(source, /recordCoolerInspect/);
});
