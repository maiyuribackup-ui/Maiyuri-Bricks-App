import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runInfrastructureChecks: vi.fn(),
  runExternalServicesChecks: vi.fn(),
  runBusinessLogicChecks: vi.fn(),
  analyzeHealthResults: vi.fn(),
  saveRunResults: vi.fn(),
  saveAIAnalysis: vi.fn(),
  getLastRunResults: vi.fn(),
  cleanupOldResults: vi.fn(),
  sendHealthReport: vi.fn(),
  sendUrgentAlertIfNeeded: vi.fn(),
  sendRecoveryAlerts: vi.fn(),
  updateAlertStates: vi.fn(),
}));

vi.mock("uuid", () => ({ v4: () => "run-1" }));
vi.mock("./checks/infrastructure", () => ({
  runInfrastructureChecks: mocks.runInfrastructureChecks,
}));
vi.mock("./checks/external-services", () => ({
  runExternalServicesChecks: mocks.runExternalServicesChecks,
}));
vi.mock("./checks/business-logic", () => ({
  runBusinessLogicChecks: mocks.runBusinessLogicChecks,
}));
vi.mock("./ai-analyzer", () => ({
  analyzeHealthResults: mocks.analyzeHealthResults,
}));
vi.mock("./storage", () => ({
  saveRunResults: mocks.saveRunResults,
  saveAIAnalysis: mocks.saveAIAnalysis,
  getLastRunResults: mocks.getLastRunResults,
  cleanupOldResults: mocks.cleanupOldResults,
}));
vi.mock("./alerts", () => ({
  sendHealthReport: mocks.sendHealthReport,
  sendUrgentAlertIfNeeded: mocks.sendUrgentAlertIfNeeded,
  sendRecoveryAlerts: mocks.sendRecoveryAlerts,
  updateAlertStates: mocks.updateAlertStates,
}));

import { runHealthCheck } from "./runner";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.runInfrastructureChecks.mockResolvedValue([]);
  mocks.runExternalServicesChecks.mockResolvedValue([]);
  mocks.runBusinessLogicChecks.mockResolvedValue([]);
  mocks.getLastRunResults.mockResolvedValue(null);
  mocks.analyzeHealthResults.mockResolvedValue({
    analysis: { overallStatus: "healthy" },
    rawPrompt: "prompt",
    rawResponse: "response",
  });
  mocks.saveRunResults.mockResolvedValue(undefined);
  mocks.saveAIAnalysis.mockResolvedValue(undefined);
});

describe("runHealthCheck notifications", () => {
  it("stores a silent manual run without sending Telegram notifications", async () => {
    const result = await runHealthCheck("manual", {
      notificationsEnabled: false,
    });

    expect(result.overallStatus).toBe("healthy");
    expect(mocks.saveRunResults).toHaveBeenCalledOnce();
    expect(mocks.saveAIAnalysis).toHaveBeenCalledOnce();
    expect(mocks.sendRecoveryAlerts).not.toHaveBeenCalled();
    expect(mocks.updateAlertStates).not.toHaveBeenCalled();
    expect(mocks.sendHealthReport).not.toHaveBeenCalled();
    expect(mocks.sendUrgentAlertIfNeeded).not.toHaveBeenCalled();
  });
});
