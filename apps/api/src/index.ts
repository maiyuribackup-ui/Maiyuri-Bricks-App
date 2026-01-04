// @maiyuri/api - API Server Entry Point

import Anthropic from '@anthropic-ai/sdk';

// Initialize Anthropic client for AI agents
const anthropic = new Anthropic();

// Export for use in routes
export { anthropic };

console.log('Maiyuri Bricks API server starting...');
