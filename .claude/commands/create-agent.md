---
description: Create a new AI agent with Anthropic SDK
argument-hint: [agent-name]
allowed-tools: Read, Write, Edit, Glob, Bash
---

# Create New Agent

Create a new AI agent named: $ARGUMENTS

## Requirements

1. Create the agent directory structure in `apps/api/src/agents/$ARGUMENTS/`
2. Include: index.ts, tools.ts, prompts.ts, types.ts
3. Use Anthropic SDK with proper tool definitions
4. Follow the agent-creator skill patterns
5. Add the agent to the barrel export

## Agent Structure

```
apps/api/src/agents/$ARGUMENTS/
├── index.ts      # Main agent class
├── tools.ts      # Tool definitions
├── prompts.ts    # System prompts
└── types.ts      # TypeScript types
```
