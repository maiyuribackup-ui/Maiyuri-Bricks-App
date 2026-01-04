---
name: agent-creator
description: Creates AI agents using Anthropic SDK with proper structure, tool definitions, and orchestration patterns. USE WHEN user says 'create agent', 'build agent', 'new agent', OR wants AI-powered automation.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Agent Creator

Creates production-ready AI agents using the Anthropic SDK for Claude Code projects.

## Agent Structure

```
agents/
  lead-manager/
    index.ts          # Main agent entry
    tools.ts          # Tool definitions
    prompts.ts        # System prompts
    types.ts          # TypeScript types
```

## Instructions

When creating an agent:

1. **Define the agent's purpose** - What task does it automate?
2. **Identify required tools** - What actions can the agent take?
3. **Create the system prompt** - Clear instructions for the agent
4. **Implement tool handlers** - Functions the agent can call
5. **Add error handling** - Graceful failure modes
6. **Test the agent** - Verify all tool paths work

## Agent Template

```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

interface Tool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

const tools: Tool[] = [
  {
    name: 'tool_name',
    description: 'What this tool does',
    input_schema: {
      type: 'object',
      properties: {
        param: { type: 'string', description: 'Parameter description' }
      },
      required: ['param']
    }
  }
];

async function runAgent(userMessage: string) {
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userMessage }
  ];

  let response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: 'You are a helpful agent...',
    tools,
    messages
  });

  // Handle tool calls in a loop
  while (response.stop_reason === 'tool_use') {
    const toolUse = response.content.find(c => c.type === 'tool_use');
    if (!toolUse) break;

    const result = await handleToolCall(toolUse.name, toolUse.input);

    messages.push({ role: 'assistant', content: response.content });
    messages.push({
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: JSON.stringify(result)
      }]
    });

    response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: 'You are a helpful agent...',
      tools,
      messages
    });
  }

  return response.content;
}
```

## Best Practices

- Use specific, focused tools (not general-purpose)
- Include detailed descriptions for each tool
- Handle all error cases gracefully
- Log agent decisions for debugging
- Use streaming for long-running agents
- Implement token budget management

## Project-Specific Agents

For Maiyuri Bricks, create agents in `apps/api/src/agents/`:

| Agent | Purpose |
|-------|---------|
| LeadManagerAgent | CRUD operations for leads |
| NotesAgent | Manage lead notes |
| TranscriptionAgent | Audio to text via Gemini |
| SummarizationAgent | Generate note summaries |
| ScoringAgent | Calculate lead scores |
| CoachingAgent | Staff performance insights |
