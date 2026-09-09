# decompose-spec

English | [中文](decompose-spec.zh.md)

## Behavior

Reference for reviewing the selected Spec against decomposition settings in design-blueprint.json. Reports violations without rewriting the Spec. Select an explicit target; modification time does not establish ownership. Missing files are reported as errors. Thresholds come from configuration, not fixed numbers in the Skill.

## Entry

Invoke the available DSH Skill by name. DSH loads instructions; the optional adapter requires an available execution tool. See [Skill instructions](../../../skills/decompose-spec/SKILL.md).
