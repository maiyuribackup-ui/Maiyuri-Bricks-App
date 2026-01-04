---
name: skill-creator
description: Creates Claude Code skills with proper SKILL.md structure, progressive disclosure, and tool restrictions. USE WHEN user says 'create skill', 'new skill', 'build skill', OR wants to add Claude Code capabilities.
allowed-tools: Read, Write, Edit, Bash, Glob
---

# Skill Creator

Creates properly structured Claude Code skills following Anthropic best practices.

## Skill Structure

```
.claude/skills/skill-name/
├── SKILL.md              # Required: Main skill definition
├── REFERENCE.md          # Optional: Detailed API docs
├── EXAMPLES.md           # Optional: Usage examples
└── scripts/              # Optional: Helper scripts
    └── helper.ts
```

## Instructions

When creating a skill:

1. **Choose skill location:**
   - Project: `.claude/skills/` (shared via git)
   - Personal: `~/.claude/skills/` (local only)

2. **Write the SKILL.md frontmatter:**
   ```yaml
   ---
   name: skill-name
   description: What it does. USE WHEN trigger phrases. (max 1024 chars)
   allowed-tools: Read, Write, Glob, Bash(command:*)
   ---
   ```

3. **Structure the content:**
   - Quick start section
   - Step-by-step instructions
   - Examples with code
   - References to additional docs

4. **Use progressive disclosure:**
   - Main concepts in SKILL.md
   - Details in linked files
   - Keep each file focused

## SKILL.md Template

```markdown
---
name: my-skill-name
description: Brief description of capability. USE WHEN user mentions X, Y, OR Z. Additional context about what it provides.
allowed-tools: Read, Write, Edit, Glob, Grep
---

# Skill Name

Brief overview of what this skill does.

## Quick Start

Fastest way to use this skill.

## Instructions

1. Step one
2. Step two
3. Step three

## Examples

### Example 1: Basic usage

\`\`\`typescript
// Code example
\`\`\`

### Example 2: Advanced usage

\`\`\`typescript
// Code example
\`\`\`

## Best Practices

- Practice one
- Practice two
- Practice three

## See Also

- [REFERENCE.md](REFERENCE.md) for API details
- [EXAMPLES.md](EXAMPLES.md) for more examples
```

## Tool Restrictions

Control what tools the skill can use:

```yaml
# Specific tools only
allowed-tools: Read, Glob, Grep

# Bash with pattern matching
allowed-tools: Bash(bun:*), Bash(git:*)

# All tools
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
```

## USE WHEN Format

**Critical:** The description MUST include `USE WHEN` triggers:

```yaml
# Good - clear triggers
description: Generates API routes. USE WHEN user says 'create endpoint', 'add route', OR 'build API'.

# Bad - no triggers
description: Generates API routes for the application.
```

## Skill Discovery

Skills are automatically discovered by Claude when:
1. The skill's `USE WHEN` matches user intent
2. The skill is in a valid location
3. Claude Code has been restarted after creation

## Verify Installation

After creating a skill, restart Claude Code and ask:
```
What skills are available?
```
