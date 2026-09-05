# Out of scope: Skills are not RPC over the CLI

This plugin ships DSH Skills so the AI agent gets the same operations the CLI gives a human operator. The Skills are a narrow, well-scoped surface. Two things are deliberately not on the table.

## Skills are not an RPC over the CLI

A Skill is not a thin wrapper around a CLI command. Each Skill does one bounded thing, returns a small structured result, and is triggered by a clear phrase or an explicit human slash command. A Skill never chains multiple CLI calls into one Skill body. A Skill never hides a multi-step workflow behind a single invocation. If the agent or the human operator needs to coordinate several commands — for example, run the verification flow, then write a handoff, then re-refine the Spec — they use `blueprint_dispatch` or the CLI directly. The Skills exist to make narrow operations cheaper, not to replace orchestration.

A Skill is also not a generic reflection surface. It does not accept arbitrary arguments, does not dispatch on argument shape, and does not expose the framework's full tool surface. The Skill body names its inputs and outputs up front, and the runtime calls one backing module function. If the agent needs to do something outside the five named Skills, it falls back to `blueprint_dispatch` or the CLI.

## A Skill never chains another Skill through the Skills registry

A Skill body does not instruct the model to invoke another Skill by name through `ctx.skills`. The Skill registry is the model-facing menu, not a function-call graph. A Skill that names another Skill inside its body creates a hidden dependency that breaks the next time the named Skill is renamed, removed, or has its invocation policy changed. The CLI subcommand `design-blueprint skills <list|show|info>` is informational; the model does not chain Skills through the CLI either.

If two operations genuinely belong together, they belong in one Skill, not two chained Skills. The backing module for that Skill exposes one pure function that does both, and the Skill body names both steps in its imperative instructions.

## What this means in practice

- The plugin does not add a Skill that runs `design-blueprint` commands on the agent's behalf.
- The plugin does not add a Skill whose body says "then call `/<other-skill>` next".
- The plugin does not add a Skill that exposes CLI flag parsing or arbitrary command routing.
- A contributor who wants to add such a Skill must first move the boundary by amending this file or by writing a new ADR.

For complex multi-step work, the developer or the agent uses `blueprint_dispatch` (for the Spec lifecycle) or the CLI directly (for one-shot commands). Skills are the cheap, narrow, named operations in between.
