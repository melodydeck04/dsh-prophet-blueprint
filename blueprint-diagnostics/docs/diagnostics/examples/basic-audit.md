# Example: a basic audit run

This example shows the output of `blueprint-diagnostics audit` against a small DSH session fixture. The fixture is shipped in `tests/fixtures/sample-session.jsonl` and contains 16 valid records plus one deliberately malformed line.

```sh
$ node blueprint-diagnostics/bin/blueprint-diagnostics.js audit tests/fixtures/sample-session.jsonl
# Blueprint diagnostics — tests/fixtures/sample-session.jsonl

Source: `D:\AI\dsh-plugins\design-blueprint\blueprint-diagnostics\tests\fixtures\sample-session.jsonl`
Session version: `0`
Parsed events: 16 · skipped: 1
Duration: 6.0 s

Verdict: 🟡 (dominant: retry-rate-per-turn)

## Counts

| dimension | count | bytes |
| --- | ---: | ---: |
| `assistant/message` | 2 | 312 B |
| `compaction/end` | 1 | 199 B |
| `compaction/start` | 1 | 96 B |
| `llm/retry` | 2 | 656 B |
| `permission/preset` | 1 | 113 B |
| `reasoning-chunks` | 1 | 122 B |
| `sandbox/mode` | 1 | 104 B |
| `session` | 1 | 222 B |
| `tool/call` | 1 | 102 B |
| `tool/result` | 1 | 86 B |
| `turn/end` | 3 | 273 B |
| `turn/start` | 3 | 246 B |
| `user/message` | 0 | 0 B |

## Retries

- retry events: 2
- affected turns: 1
- dominant policy key: `["normal",5,["EMPTY_RESPONSE"],500,10000,0.1]`

| turn | retries |
| ---: | ---: |
| 1 | 2 |

## Compactions

- starts: 1
- ends: 1
- interrupted: 0
```

The verdict is yellow because the fixture's two retries on a single turn push the retry rate above 50%.

A `compare` run against the same fixture plus a slightly heavier second session will mark the rows whose deltas exceed 10% with a ⚠.