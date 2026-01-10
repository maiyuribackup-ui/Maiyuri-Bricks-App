// Auth
export { useAuth, useRequireAuth } from './useAuth';

// Leads
export {
  useLeads,
  useLead,
  useCreateLead,
  useUpdateLead,
  useDeleteLead,
  useUpdateLeadStatus,
} from './useLeads';

// Notes
export {
  useNotes,
  useNote,
  useCreateNote,
  useUpdateNote,
  useDeleteNote,
} from './useNotes';

// Dashboard
export {
  useDashboardStats,
  useLeadStats,
  useRecentActivity,
} from './useDashboard';

// Transcription & Audio
export {
  useTranscribe,
  useSummarize,
  useUploadAudio,
  useDeleteAudio,
} from './useTranscription';

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
} from './useEstimates';
