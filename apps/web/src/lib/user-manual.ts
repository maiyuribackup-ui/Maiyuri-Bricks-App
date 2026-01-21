/**
 * User Manual Content
 *
 * Comprehensive guide for Maiyuri Bricks AI Lead Management System
 * Each section maps to a specific page in the app
 */

export type ManualSection =
  | "getting-started"
  | "dashboard"
  | "leads"
  | "lead-detail"
  | "lead-new"
  | "lead-edit"
  | "knowledge"
  | "coaching"
  | "design"
  | "tasks"
  | "kpi"
  | "approvals"
  | "settings"
  | "production"
  | "deliveries"
  | "smart-quote";

export interface ManualStep {
  action: string;
  result?: string;
  tip?: string;
}

export interface ManualContent {
  id: ManualSection;
  title: string;
  description: string;
  path: string;
  quickStart: string[];
  steps: ManualStep[];
  tips?: string[];
  videoUrl?: string;
}

// ============================================================================
// MANUAL CONTENT
// ============================================================================

export const manualContent: Record<ManualSection, ManualContent> = {
  "getting-started": {
    id: "getting-started",
    title: "Getting Started",
    description:
      "Welcome to Maiyuri Bricks! Learn the basics to get productive quickly.",
    path: "/help",
    quickStart: [
      "Log in with your credentials",
      "View dashboard for overview",
      "Add your first lead",
      "Track and convert leads",
    ],
    steps: [
      {
        action: "Log in at the login page with your email and password",
        result: "You'll see the main dashboard",
      },
      {
        action: "Check the Dashboard for your daily priorities",
        result: "See hot leads, follow-ups due, and key metrics",
      },
      {
        action: "Click 'Leads' in the sidebar to manage your leads",
        result: "View all leads in list or Kanban view",
      },
      {
        action: "Click '+ Add Lead' to create a new lead",
        result: "Fill in customer details and save",
      },
      {
        action: "Click on any lead to see details and add notes",
        result: "AI will analyze and score the lead automatically",
      },
    ],
    tips: [
      "Use the AI Analysis button to get smart suggestions",
      "Check 'Hot' leads first - they're most likely to convert",
      "Add notes after every customer interaction",
    ],
  },

  dashboard: {
    id: "dashboard",
    title: "Dashboard",
    description:
      "Your command center. See all key metrics and priorities at a glance.",
    path: "/dashboard",
    quickStart: [
      "Check KPI cards for today's numbers",
      "Review AI Priority Actions",
      "See follow-ups due today",
      "Monitor sales funnel",
    ],
    steps: [
      {
        action: "View the KPI cards at the top",
        result:
          "See conversion rate, active leads, hot leads, and follow-ups due",
        tip: "Green arrows = improvement, Red = needs attention",
      },
      {
        action: "Check 'AI Priority Actions' section",
        result: "See AI-recommended leads to focus on today",
        tip: "These leads have highest conversion probability",
      },
      {
        action: "Review 'Upcoming Tasks' section",
        result: "See your scheduled follow-ups and reminders",
      },
      {
        action: "Click on any lead name to go to details",
        result: "Opens the lead detail page",
      },
      {
        action: "Use the time filter (7d, 30d, 90d) to change date range",
        result: "All charts and metrics update accordingly",
      },
    ],
    tips: [
      "Start your day by checking AI Priority Actions",
      "Aim to reduce 'Follow-ups Due' to zero daily",
      "Watch the conversion rate trend - it shows your team's effectiveness",
    ],
  },

  leads: {
    id: "leads",
    title: "Leads Management",
    description:
      "View, search, and manage all your leads. Switch between list and Kanban views.",
    path: "/leads",
    quickStart: [
      "Search leads by name or phone",
      "Filter by status (New, Hot, Follow Up)",
      "Drag leads in Kanban view",
      "Click lead to see details",
    ],
    steps: [
      {
        action: "Use the search bar to find leads",
        result: "Results filter as you type",
        tip: "Search by name, phone number, or company",
      },
      {
        action: "Click status tabs (All, New, Hot, etc.) to filter",
        result: "Only leads with selected status are shown",
      },
      {
        action: "Toggle 'Kanban View' switch to change layout",
        result: "See leads as cards organized by status columns",
        tip: "Drag cards between columns to update status",
      },
      {
        action: "Click '+ Add Lead' button to create new lead",
        result: "Opens the new lead form",
      },
      {
        action: "Click the WhatsApp icon to message the customer",
        result: "Opens WhatsApp with customer's number",
      },
      {
        action: "Click 'Analyze' button on any lead",
        result: "AI generates score, summary, and suggestions",
        tip: "Analysis takes 10-15 seconds",
      },
    ],
    tips: [
      "Use Kanban view for visual pipeline management",
      "Hot leads should be contacted within 24 hours",
      "Add notes immediately after every call",
    ],
  },

  "lead-detail": {
    id: "lead-detail",
    title: "Lead Details",
    description:
      "View complete lead information, add notes, see AI analysis, and track history.",
    path: "/leads/[id]",
    quickStart: [
      "View AI score and summary",
      "Add call notes",
      "See recommended actions",
      "Track interaction history",
    ],
    steps: [
      {
        action: "View the AI Score at the top",
        result: "See conversion probability (0-100%)",
        tip: "Higher score = more likely to convert",
      },
      {
        action: "Read the AI Summary for quick context",
        result: "Understand lead situation without reading all notes",
      },
      {
        action: "Check 'Next Best Actions' for AI recommendations",
        result: "See prioritized actions to move lead forward",
      },
      {
        action: "Click 'Add Note' to record interaction",
        result: "Opens note input with voice recording option",
        tip: "Use voice recording for faster note-taking",
      },
      {
        action: "Click microphone icon to record voice note",
        result: "Audio is transcribed automatically by AI",
      },
      {
        action: "View 'Timeline' tab for full interaction history",
        result: "See all notes, calls, and status changes",
      },
      {
        action: "Click 'Analyze Lead' to refresh AI insights",
        result: "New score and suggestions generated",
        tip: "Re-analyze after adding significant new information",
      },
      {
        action: "Click 'WhatsApp' to message customer",
        result: "Opens WhatsApp with pre-filled greeting",
      },
      {
        action: "Click 'Edit' to update lead information",
        result: "Opens edit form for lead details",
      },
    ],
    tips: [
      "Add notes after EVERY customer interaction",
      "Voice notes are transcribed - speak clearly",
      "Re-analyze lead after major updates for fresh insights",
      "Check objections section to prepare for follow-up calls",
    ],
  },

  "lead-new": {
    id: "lead-new",
    title: "Add New Lead",
    description: "Create a new lead with all essential information.",
    path: "/leads/new",
    quickStart: [
      "Enter customer name",
      "Add phone number",
      "Select lead source",
      "Save to create lead",
    ],
    steps: [
      {
        action: "Enter customer name in 'Name' field",
        result: "Name is required",
        tip: "Use full name: 'Rajesh Kumar' not just 'Rajesh'",
      },
      {
        action: "Enter phone number with country code",
        result: "Format: +91 98765 43210",
        tip: "WhatsApp and calling features use this number",
      },
      {
        action: "Select 'Source' - where did this lead come from?",
        result: "Options: Walk-in, Referral, Social Media, etc.",
      },
      {
        action: "Select 'Lead Type' - Residential, Commercial, Industrial",
        result: "Helps categorize and prioritize leads",
      },
      {
        action: "Optionally add initial note about the inquiry",
        result: "Captured in lead history",
      },
      {
        action: "Click 'Create Lead' to save",
        result: "Lead is created and you go to detail page",
      },
    ],
    tips: [
      "Complete phone number enables WhatsApp features",
      "Accurate source helps track which channels work best",
      "Add an initial note with the customer's requirement",
    ],
  },

  "lead-edit": {
    id: "lead-edit",
    title: "Edit Lead",
    description: "Update lead information and details.",
    path: "/leads/[id]/edit",
    quickStart: [
      "Update contact details",
      "Change lead status",
      "Modify lead type",
      "Save changes",
    ],
    steps: [
      {
        action: "Update any field you need to change",
        result: "Fields are editable",
      },
      {
        action: "Change 'Status' when lead progresses",
        result: "New → Follow Up → Hot → Converted",
        tip: "Status changes are tracked in timeline",
      },
      {
        action: "Update 'Follow Up Date' for scheduled calls",
        result: "Lead appears in your follow-up reminders",
      },
      {
        action: "Click 'Save Changes' when done",
        result: "Lead is updated and you return to detail page",
      },
    ],
    tips: [
      "Update status promptly to keep pipeline accurate",
      "Set follow-up dates for every non-converted lead",
      "Add notes explaining why you changed status",
    ],
  },

  knowledge: {
    id: "knowledge",
    title: "Knowledge Base",
    description:
      "Company knowledge hub. Ask questions, search information, and add new content.",
    path: "/knowledge",
    quickStart: [
      "Ask a question in natural language",
      "Search existing knowledge",
      "Add new FAQ entries",
      "Upload company documents",
    ],
    steps: [
      {
        action: "Type your question in the 'Ask Maiyuri' box",
        result: "AI searches knowledge base and provides answer",
        tip: "Ask in plain language: 'What is the price of 8 inch blocks?'",
      },
      {
        action: "View the AI response with sources",
        result: "See answer and where it came from",
      },
      {
        action: "Click 'Add Knowledge' to add new FAQ",
        result: "Opens form to add question and answer",
      },
      {
        action: "Use 'Scrape URL' to import content from web pages",
        result: "Content is extracted and added to knowledge base",
      },
      {
        action: "Search existing entries using the search bar",
        result: "Filter through all knowledge entries",
      },
    ],
    tips: [
      "Add common customer questions as FAQ entries",
      "Knowledge base powers the AI assistant",
      "Regularly update pricing and product information",
    ],
  },

  coaching: {
    id: "coaching",
    title: "Sales Coaching",
    description:
      "AI-powered coaching insights from call recordings. Improve sales performance.",
    path: "/coaching",
    quickStart: [
      "View coaching insights by staff",
      "See missed opportunities",
      "Learn from successful calls",
      "Track improvement over time",
    ],
    steps: [
      {
        action: "Select staff member from dropdown",
        result: "See all coaching insights for that person",
      },
      {
        action: "Review 'Corrections' - things to improve",
        result: "See specific quotes and what to do better",
        tip: "Focus on one correction at a time",
      },
      {
        action: "Check 'Missed Opportunities' - potential upsells",
        result: "Learn to identify cross-sell moments",
      },
      {
        action: "Read 'Kudos' - things done well",
        result: "Understand what's working to repeat it",
      },
      {
        action: "Click on insight to see full call context",
        result: "See the complete interaction for learning",
      },
    ],
    tips: [
      "Review coaching weekly for continuous improvement",
      "Celebrate kudos with your team",
      "Use missed opportunities to train on upselling",
    ],
  },

  design: {
    id: "design",
    title: "Floor Plan Designer",
    description:
      "AI-powered floor plan generation. Answer questions, get custom designs.",
    path: "/design",
    quickStart: [
      "Start new design session",
      "Answer chatbot questions",
      "Review generated blueprint",
      "Download floor plan image",
    ],
    steps: [
      {
        action: "Click 'Start New Design' to begin",
        result: "AI chatbot starts asking questions",
      },
      {
        action: "Answer questions about plot size, rooms, etc.",
        result: "Use quick answer buttons or type custom responses",
        tip: "Be specific about your requirements",
      },
      {
        action: "Upload plot sketch if you have one",
        result: "AI analyzes the image for dimensions",
      },
      {
        action: "Review Vastu compliance suggestions",
        result: "Design follows traditional principles",
      },
      {
        action: "Wait for blueprint generation (30-60 seconds)",
        result: "AI creates detailed floor plan",
      },
      {
        action: "View the generated floor plan image",
        result: "See 2D layout with room dimensions",
      },
      {
        action: "Click 'Download' to save the image",
        result: "PNG file saved to your device",
      },
      {
        action: "Request modifications if needed",
        result: "AI adjusts the design based on feedback",
      },
    ],
    tips: [
      "Have plot dimensions ready before starting",
      "Mention Vastu preferences early in the conversation",
      "Download designs to share with customers",
    ],
  },

  tasks: {
    id: "tasks",
    title: "Tasks",
    description: "Manage your to-do list and scheduled follow-ups.",
    path: "/tasks",
    quickStart: [
      "View today's tasks",
      "Check overdue items",
      "Mark tasks complete",
      "Add new tasks",
    ],
    steps: [
      {
        action: "View tasks organized by due date",
        result: "Today, Tomorrow, This Week, Overdue sections",
      },
      {
        action: "Click checkbox to mark task complete",
        result: "Task moves to completed section",
      },
      {
        action: "Click task title to see related lead",
        result: "Opens lead detail page",
      },
      {
        action: "Use filter to see specific task types",
        result: "Follow-ups, Calls, Meetings, etc.",
      },
    ],
    tips: [
      "Clear overdue tasks first thing in the morning",
      "Set realistic follow-up dates",
      "Complete all tasks before leaving for the day",
    ],
  },

  kpi: {
    id: "kpi",
    title: "KPI Analytics",
    description:
      "Detailed performance metrics and analytics for your sales team.",
    path: "/kpi",
    quickStart: [
      "View team performance",
      "Track conversion rates",
      "Analyze lead sources",
      "Monitor response times",
    ],
    steps: [
      {
        action: "Select date range for analysis",
        result: "All metrics update for selected period",
      },
      {
        action: "View team leaderboard",
        result: "See who's performing best",
      },
      {
        action: "Check lead source breakdown",
        result: "Understand which sources bring best leads",
      },
      {
        action: "Review conversion funnel",
        result: "See where leads drop off in pipeline",
      },
      {
        action: "Monitor response time metrics",
        result: "Faster response = better conversion",
      },
    ],
    tips: [
      "Track KPIs weekly for trends",
      "Response time under 1 hour = best results",
      "Focus resources on highest-converting sources",
    ],
  },

  approvals: {
    id: "approvals",
    title: "Approvals",
    description:
      "Review and approve pending items like discounts or special requests.",
    path: "/approvals",
    quickStart: [
      "View pending approvals",
      "Review request details",
      "Approve or reject",
      "Add comments",
    ],
    steps: [
      {
        action: "View list of pending approval requests",
        result: "See all items waiting for your decision",
      },
      {
        action: "Click on item to see full details",
        result: "View request information and context",
      },
      {
        action: "Click 'Approve' to accept request",
        result: "Item is approved and requester notified",
      },
      {
        action: "Click 'Reject' with reason to decline",
        result: "Item is rejected with your feedback",
      },
    ],
    tips: [
      "Process approvals daily to avoid delays",
      "Always add a comment when rejecting",
      "Check lead history before approving discounts",
    ],
  },

  settings: {
    id: "settings",
    title: "Settings",
    description: "Configure your account, team, and system preferences.",
    path: "/settings",
    quickStart: [
      "Update profile information",
      "Manage team members",
      "Configure notifications",
      "Set up integrations",
    ],
    steps: [
      {
        action: "Click 'Profile' tab to update your info",
        result: "Change name, email, password",
      },
      {
        action: "Click 'Team' tab to manage staff",
        result: "Invite new members, set roles",
      },
      {
        action: "Use 'Invite Team Member' to add staff",
        result: "Sends email invitation to join",
      },
      {
        action: "Configure notification preferences",
        result: "Choose email and Telegram alerts",
      },
      {
        action: "Set up Odoo integration if using",
        result: "Sync leads with Odoo CRM",
      },
    ],
    tips: [
      "Keep team list updated when staff changes",
      "Enable Telegram for instant lead alerts",
      "Review integrations monthly for sync issues",
    ],
  },

  production: {
    id: "production",
    title: "Production",
    description: "Track brick production batches and inventory.",
    path: "/production",
    quickStart: [
      "View current production",
      "Track inventory levels",
      "Log new batches",
      "Monitor quality",
    ],
    steps: [
      {
        action: "View current production batches",
        result: "See all active production runs",
      },
      {
        action: "Check inventory levels by product",
        result: "Know what's available to sell",
      },
      {
        action: "Log new production batch",
        result: "Record quantity and specifications",
      },
      {
        action: "Update batch status as it progresses",
        result: "Curing → Ready → Dispatched",
      },
    ],
    tips: [
      "Update inventory after every dispatch",
      "Log production daily for accurate tracking",
      "Check inventory before promising delivery dates",
    ],
  },

  deliveries: {
    id: "deliveries",
    title: "Deliveries",
    description: "Schedule and track customer deliveries.",
    path: "/deliveries",
    quickStart: [
      "View scheduled deliveries",
      "Track delivery status",
      "Create new delivery",
      "Update delivery progress",
    ],
    steps: [
      {
        action: "View deliveries calendar/list",
        result: "See all scheduled deliveries",
      },
      {
        action: "Click on delivery to see details",
        result: "View customer, address, items",
      },
      {
        action: "Update status as delivery progresses",
        result: "Scheduled → In Transit → Delivered",
      },
      {
        action: "Mark delivery complete with proof",
        result: "Upload delivery photo if required",
      },
    ],
    tips: [
      "Confirm delivery date with customer 1 day before",
      "Update status in real-time during delivery",
      "Note any delivery issues for future reference",
    ],
  },

  "smart-quote": {
    id: "smart-quote",
    title: "Smart Quote",
    description: "View and share professional quotes with customers.",
    path: "/sq/[slug]",
    quickStart: [
      "View quote details",
      "Check pricing breakdown",
      "Share with customer",
      "Track quote status",
    ],
    steps: [
      {
        action: "Open Smart Quote link",
        result: "See professional quote page",
      },
      {
        action: "Review quote items and pricing",
        result: "See detailed breakdown",
      },
      {
        action: "Share link with customer via WhatsApp",
        result: "Customer can view on their device",
      },
      {
        action: "Track if customer has viewed quote",
        result: "Know when to follow up",
      },
    ],
    tips: [
      "Send Smart Quote link instead of PDF when possible",
      "Follow up within 24 hours of sending quote",
      "Update quote if prices change",
    ],
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getManualContent(section: ManualSection): ManualContent {
  return manualContent[section];
}

export function getAllSections(): ManualContent[] {
  return Object.values(manualContent);
}

export function getSectionByPath(path: string): ManualContent | null {
  const normalizedPath = path.split("?")[0]; // Remove query params

  // Direct match
  for (const content of Object.values(manualContent)) {
    if (content.path === normalizedPath) {
      return content;
    }
  }

  // Pattern match for dynamic routes
  if (normalizedPath.match(/^\/leads\/[^/]+\/edit$/)) {
    return manualContent["lead-edit"];
  }
  if (normalizedPath.match(/^\/leads\/[^/]+$/)) {
    return manualContent["lead-detail"];
  }
  if (normalizedPath.match(/^\/sq\/[^/]+$/)) {
    return manualContent["smart-quote"];
  }
  if (normalizedPath.match(/^\/deliveries\/[^/]+$/)) {
    return manualContent["deliveries"];
  }

  return null;
}

// Page-to-section mapping for easy lookup
export const pageToSection: Record<string, ManualSection> = {
  "/dashboard": "dashboard",
  "/leads": "leads",
  "/leads/new": "lead-new",
  "/knowledge": "knowledge",
  "/coaching": "coaching",
  "/design": "design",
  "/tasks": "tasks",
  "/kpi": "kpi",
  "/approvals": "approvals",
  "/settings": "settings",
  "/production": "production",
  "/deliveries": "deliveries",
};
