# AI-Powered KPI Scoring System - Implementation Plan

## Overview

Design and implement an AI-powered KPI scoring system that provides intelligent lead scoring, staff performance metrics, and business health indicators for the Maiyuri Bricks lead management system.

---

## 1. Architecture Design

### 1.1 New Kernel: `kpi-scorer`

Create a new CloudCore kernel at `apps/api/src/cloudcore/kernels/kpi-scorer/index.ts` that:
- Aggregates data from leads, notes, and staff activities
- Uses Gemini AI to generate intelligent scores and insights
- Provides three scoring dimensions: Lead Health, Staff Performance, Business Metrics

### 1.2 Core Types (add to `types/index.ts`)

```typescript
// KPI Score Types
interface KPIScore {
  category: 'lead' | 'staff' | 'business';
  value: number;           // 0-100 score
  trend: 'up' | 'stable' | 'down';
  confidence: number;      // 0-1 AI confidence
  factors: KPIFactor[];
  generatedAt: string;
}

interface KPIFactor {
  name: string;
  impact: 'positive' | 'negative' | 'neutral';
  weight: number;
  currentValue: number;
  targetValue?: number;
  description: string;
}

interface LeadKPIRequest {
  leadId?: string;         // Single lead or all leads
  timeRange?: 'day' | 'week' | 'month' | 'quarter';
}

interface StaffKPIRequest {
  staffId?: string;        // Single staff or all staff
  timeRange?: 'day' | 'week' | 'month' | 'quarter';
}

interface BusinessKPIRequest {
  timeRange?: 'day' | 'week' | 'month' | 'quarter';
  compareToPrevious?: boolean;
}

interface KPIDashboardResponse {
  leadScores: LeadKPIScore[];
  staffScores: StaffKPIScore[];
  businessScore: BusinessKPIScore;
  alerts: KPIAlert[];
  recommendations: string[];
}
```

---

## 2. KPI Definitions

### 2.1 Lead Health Score (0-100)

| Factor | Weight | Calculation |
|--------|--------|-------------|
| Engagement Recency | 25% | Days since last note/interaction |
| Follow-up Compliance | 20% | On-time follow-ups / Total follow-ups |
| Note Density | 15% | Notes per week relative to average |
| Sentiment Trend | 15% | AI-analyzed sentiment from notes |
| Conversion Signals | 15% | Positive indicators in recent notes |
| Response Time | 10% | Average response time to inquiries |

**AI Enhancement**: Gemini analyzes note content to detect:
- Purchase intent signals ("ready to order", "need quote")
- Objection patterns ("too expensive", "considering others")
- Relationship quality ("satisfied", "frustrated")

### 2.2 Staff Performance Score (0-100)

| Factor | Weight | Calculation |
|--------|--------|-------------|
| Conversion Rate | 25% | Leads converted / Leads handled |
| Response Speed | 20% | Average first response time |
| Follow-up Rate | 20% | Follow-ups completed on time |
| Lead Engagement | 15% | Notes per lead, activity frequency |
| Hot Lead Handling | 10% | Time to engage hot leads |
| Customer Satisfaction | 10% | AI-inferred from note sentiment |

### 2.3 Business Health Score (0-100)

| Factor | Weight | Calculation |
|--------|--------|-------------|
| Pipeline Value | 25% | Total weighted lead value |
| Conversion Velocity | 20% | Average time to conversion |
| Lead Flow | 20% | New leads vs churned leads |
| Team Efficiency | 15% | Average staff performance |
| Forecast Accuracy | 10% | Predicted vs actual conversions |
| Knowledge Utilization | 10% | KB queries, answer quality |

---

## 3. Implementation Steps

### Step 1: Create KPI Types
- Add new types to `apps/api/src/cloudcore/types/index.ts`
- Add Zod schemas to `apps/api/src/cloudcore/contracts/index.ts`

### Step 2: Create KPI Scorer Kernel
- Create `apps/api/src/cloudcore/kernels/kpi-scorer/index.ts`
- Implement three main functions:
  - `calculateLeadKPI(request: LeadKPIRequest)`
  - `calculateStaffKPI(request: StaffKPIRequest)`
  - `calculateBusinessKPI(request: BusinessKPIRequest)`
- Implement aggregation function:
  - `getDashboardKPIs(): KPIDashboardResponse`

### Step 3: Add AI Enhancement Layer
- Create Gemini prompts for:
  - Note sentiment analysis
  - Conversion signal detection
  - Trend interpretation
  - Recommendation generation

### Step 4: Create API Routes
- `POST /api/kpi/lead` - Get lead KPI scores
- `POST /api/kpi/staff` - Get staff KPI scores
- `POST /api/kpi/business` - Get business KPI scores
- `GET /api/kpi/dashboard` - Get full KPI dashboard

### Step 5: Create Frontend Components
- `KPIDashboard.tsx` - Main dashboard view
- `KPIScoreCard.tsx` - Individual score display
- `KPITrendChart.tsx` - Score trends over time
- `KPIAlerts.tsx` - Alert notifications
- `KPILeaderboard.tsx` - Staff ranking

### Step 6: Integrate with Existing Features
- Add KPI indicators to lead detail page
- Add personal KPI to staff dashboard
- Add KPI summary to main dashboard

---

## 4. Database Requirements

### 4.1 New Table: `kpi_snapshots`

```sql
CREATE TABLE kpi_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type TEXT NOT NULL, -- 'lead', 'staff', 'business'
  entity_id UUID, -- NULL for business metrics
  score INTEGER NOT NULL,
  factors JSONB NOT NULL,
  trend TEXT,
  confidence FLOAT,
  snapshot_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kpi_entity ON kpi_snapshots(entity_type, entity_id, snapshot_date);
```

### 4.2 New Table: `kpi_alerts`

```sql
CREATE TABLE kpi_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL, -- 'critical', 'warning', 'info'
  entity_type TEXT NOT NULL,
  entity_id UUID,
  message TEXT NOT NULL,
  is_resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 5. AI Prompts Design

### 5.1 Lead Scoring Prompt

```
Analyze the following lead data and recent notes to generate a health score:

Lead: {leadName}
Status: {status}
Days since last contact: {daysSinceContact}
Recent notes: {recentNotes}

Evaluate:
1. Engagement level (active, cooling, cold)
2. Purchase intent signals
3. Objection or concern patterns
4. Relationship quality
5. Recommended next action

Return JSON: { score, factors, recommendation, urgency }
```

### 5.2 Staff Performance Prompt

```
Analyze staff performance metrics and generate insights:

Staff: {staffName}
Leads handled: {leadsCount}
Conversion rate: {conversionRate}
Average response time: {avgResponseTime}
Recent activity: {recentActivity}

Evaluate:
1. Strengths
2. Areas for improvement
3. Comparison to team average
4. Coaching recommendations

Return JSON: { score, factors, strengths, improvements, coaching }
```

---

## 6. File Changes Summary

### New Files
- `apps/api/src/cloudcore/kernels/kpi-scorer/index.ts`
- `apps/api/src/app/api/kpi/lead/route.ts`
- `apps/api/src/app/api/kpi/staff/route.ts`
- `apps/api/src/app/api/kpi/business/route.ts`
- `apps/api/src/app/api/kpi/dashboard/route.ts`
- `apps/web/components/kpi/KPIDashboard.tsx`
- `apps/web/components/kpi/KPIScoreCard.tsx`
- `apps/web/components/kpi/KPITrendChart.tsx`
- `apps/web/app/kpi/page.tsx`

### Modified Files
- `apps/api/src/cloudcore/types/index.ts` - Add KPI types
- `apps/api/src/cloudcore/contracts/index.ts` - Add KPI schemas
- `apps/api/src/cloudcore/index.ts` - Export KPI kernel
- `apps/web/components/layout/Sidebar.tsx` - Add KPI nav link
- `apps/web/app/dashboard/page.tsx` - Add KPI summary widget

---

## 7. Testing Strategy

1. **Unit Tests**: Test scoring calculations
2. **Integration Tests**: Test API endpoints with mock data
3. **AI Tests**: Verify Gemini prompt responses
4. **E2E Tests**: Test dashboard interactions

---

## 8. Success Metrics

- Lead score correlates with actual conversions (>70% accuracy)
- Staff rankings reflect actual performance
- Dashboard loads in <2 seconds
- AI insights rated useful by users (>80% helpful)
