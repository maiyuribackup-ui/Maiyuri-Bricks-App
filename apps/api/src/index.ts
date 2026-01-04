// @maiyuri/api - API Server Entry Point

// Export CloudCore for use in Next.js API routes
export * from './cloudcore';

// Export CloudCore as default namespace for convenient access
import { kernels, services, routes, contracts, types } from './cloudcore';
export const cloudcore = { kernels, services, routes, contracts, types };
