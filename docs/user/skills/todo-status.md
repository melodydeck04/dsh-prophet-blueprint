# `todo-status`

English | [中文](todo-status.zh.md)

Return the current TODO list and verdict for a Spec without writing anything. Read-only.

## What it does

Loads the referenced Spec's `.todos.yaml` plus recent `task` and `done` events for the current session, and returns a small structured summary: the TODO table (id, summary, status), the verdict (which ACs are passing, which are failing, which are pending), and segment byte counts. Does not modify the `.todos.yaml`, does not emit any event, does not advance any task. The function is `todoStatus` from `lib/skills/backing-modules.js#todoStatus`.

## When to reach for it

- The user asks "where are we?", "what's done?", "what's pending?", "how is this Spec progressing?".
- The user mentions `TODO list`, `progress`, `AC pass count`, or asks how many ACs pass for a Spec.
- The model is about to recommend the next action on a Spec and wants a current snapshot instead of guessing from the conversation history.
- The model is reviewing the current session's TODO state and wants the same snapshot the human operator would see.
- The user types `/todo-status` followed by a Spec path.

## Common questions

**Is this Skill model-invocable?** Yes. The Skill carries no `disable-model-invocation` flag, so the runtime catalog exposes it to the model. The DSH agent may fire it on its own when its task fits (for example, before recommending the next task). The Skill is also user-invocable: the human can type `/todo-status` directly.

**Does `todo-status` mark tasks done?** No. It only reads. To mark a task done, the user runs `design-blueprint todo mark <spec> <task-id>` or invokes the workflow through `blueprint_dispatch`.

**What does "verdict" mean?** The verdict is the result of running `evaluateSpec` over the ACs that have evidence linked to them. ACs without evidence are reported as `pending`. The verdict does not require the full verification flow; it's a cheap read.

**What if the Spec has no `.todos.yaml` yet?** The Skill returns an empty TODO list and verdict `pending` for every AC, with a one-line message pointing at `design-blueprint todo init <spec>`. It does not throw.

**Where do the recent `task` and `done` events come from?** From the current session's event stream, scoped via `lib/todo-events.js#locateSessionPath`. If the path is not writable (hardened system), the harness routes to `.blueprint-test-tmp`; the Skill handles both.

## It's working if

- The result includes the TODO table (even if empty), the verdict, and segment byte counts.
- The verdict names each AC by id and its current status (`pass`, `fail`, `pending`).
- No new event was emitted; the event count for the session is unchanged before and after the call.
- The Skill body does not write to `.todos.yaml` or anywhere else.
- The user can re-run `/todo-status` repeatedly and get the same result if no work has happened in between.

## Reference

- Source: `skills/todo-status/SKILL.md`
- Backing module: `lib/skills/backing-modules.js#todoStatus`
- Audit: `design-blueprint skills info todo-status`
- Feature brief: `docs/user/features/agent-interface--skills-layer.md`
