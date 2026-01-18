// Auth
export { useAuth, useRequireAuth } from "./useAuth";

// Leads
export {
  useLeads,
  useLead,
  useCreateLead,
  useUpdateLead,
  useDeleteLead,
  useUpdateLeadStatus,
} from "./useLeads";

// Notes
export {
  useNotes,
  useNote,
  useCreateNote,
  useUpdateNote,
  useDeleteNote,
} from "./useNotes";

// Dashboard
export {
  useDashboardStats,
  useLeadStats,
  useRecentActivity,
} from "./useDashboard";

// Transcription & Audio
export {
  useTranscribe,
  useSummarize,
  useUploadAudio,
  useDeleteAudio,
} from "./useTranscription";

// Price Estimator
export {
  useProducts,
  useFactorySettings,
  useUpdateFactorySettings,
  useEstimates,
  useEstimate,
  useCreateEstimate,
  useUpdateEstimate,
  useDeleteEstimate,
  useSuggestDiscount,
  useCalculateDistance,
  calculateEstimateSummary,
} from "./useEstimates";

// Production Module
export {
  // Finished Goods
  useFinishedGoods,
  useSyncFinishedGoods,
  // BOM
  useBOM,
  useRefreshBOM,
  // Employees
  useEmployees,
  useSyncEmployees,
  // Production Orders
  useProductionOrders,
  useProductionOrder,
  useCreateProductionOrder,
  useUpdateProductionOrder,
  useDeleteProductionOrder,
  // Odoo Sync
  useSyncToOdoo,
  // Shifts
  useShifts,
  useCreateShift,
  useUpdateShift,
  useEndShift,
  useDeleteShift,
  // Consumption
  useUpdateConsumptionLine,
  // Attendance
  useSyncAttendance,
  // Utilities
  calculateExpectedConsumption,
  calculateConsumptionDifference,
} from "./useProduction";
