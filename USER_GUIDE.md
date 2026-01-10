# Maiyuri Bricks App - User Journeys

This guide provides **step-by-step instructions** for every key action in the Maiyuri Bricks AI-Powered CRM.

---

## 📋 Table of Contents

1. [Lead Management](#lead-management)
   - [Adding a New Lead](#journey-1-adding-a-new-lead)
   - [Updating a Lead Status](#journey-2-updating-a-lead-status)
   - [Adding Notes to a Lead](#journey-3-adding-notes-to-a-lead)
   - [Recording Audio Notes](#journey-4-recording-audio-notes)
   - [Archiving a Lead](#journey-5-archiving-a-lead)
2. [Task Management](#task-management)
   - [Creating a New Task](#journey-6-creating-a-new-task)
   - [Updating Task Status](#journey-7-updating-task-status)
3. [Knowledge Base](#knowledge-base)
   - [Asking a Question](#journey-8-asking-a-question)
   - [Adding New Knowledge](#journey-9-adding-new-knowledge)
4. [Understanding Scores](#understanding-scores)
   - [Lead AI Score Formula](#lead-ai-score-formula)
   - [KPI Score Interpretation](#kpi-score-interpretation)
5. [Using Ask Maiyuri Chatbot](#journey-10-using-ask-maiyuri-chatbot)

---

## Lead Management

### Journey 1: Adding a New Lead

**Goal**: Add a new prospect to the CRM

**Steps**:

| Step | Action | Location |
|------|--------|----------|
| 1 | Click **"+ New Lead"** button | Dashboard or Leads page (top right) |
| 2 | Enter **Name** (required) | "Enter lead name" field |
| 3 | Enter **Contact Number** (required) | "Enter contact number" field |
| 4 | Select **Source** (required) | Dropdown: Website, Referral, Walk-in, Phone, Social Media, Advertisement, Other |
| 5 | Select **Lead Type** (required) | Dropdown: Commercial, Residential, Industrial, Government, Other |
| 6 | *(Optional)* Select **Assign To** | Dropdown of team members |
| 7 | *(Optional)* Enter **Next Action** | e.g., "Call to discuss requirements" |
| 8 | *(Optional)* Set **Follow-up Date** | Date picker |
| 9 | Click **"Create Lead"** | Form is validated and lead is created |
| 10 | Redirect to lead detail page | ✅ Lead saved successfully |

**Required Fields**: Name, Contact Number, Source, Lead Type

---

### Journey 2: Updating a Lead Status

**Goal**: Change a lead's status (e.g., New → Hot → Converted)

**Steps**:

| Step | Action | Location |
|------|--------|----------|
| 1 | Navigate to **Leads** page | Sidebar → Leads |
| 2 | Click on the **lead name** | Opens lead detail page |
| 3 | In right sidebar, find **"Update Status"** card | Shows 6 status buttons |
| 4 | Click desired status button | Options: New, Follow Up, Hot, Cold, Converted, Lost |
| 5 | Status updates immediately | ✅ Badge changes on header |

**Alternative (Kanban View)**:
1. Go to Leads → Toggle to **Kanban** view
2. **Drag and drop** the lead card to a new column
3. Status updates automatically

**Status Flow**:
```
New → Follow Up → Hot → Converted ✅
           ↓         ↓
         Cold      Lost ❌
```

---

### Journey 3: Adding Notes to a Lead

**Goal**: Record interaction details or updates

**Steps**:

| Step | Action | Location |
|------|--------|----------|
| 1 | Open the **lead detail page** | Click lead name in list |
| 2 | Click **"Add Note"** button | Below "Notes & Interactions" header |
| 3 | Type note in the **text area** | Enter interaction details |
| 4 | Click **"Save Note"** | Note appears in timeline |

**Notes display**:
- Date stamp
- Confidence score (if AI-generated)
- AI Summary (auto-generated highlights)

---

### Journey 4: Recording Audio Notes

**Goal**: Transcribe spoken notes using AI

**Steps**:

| Step | Action | Location |
|------|--------|----------|
| 1 | Open the **lead detail page** | Click lead name in list |
| 2 | Click **"Audio"** button | Next to "Add Note" button |
| 3 | **Upload audio file** or record | File selector appears |
| 4 | Wait for **AI transcription** | Processing indicator shows |
| 5 | Transcribed text becomes a note | ✅ Added to notes timeline |
| 6 | *Auto-ingested into Knowledge Base* | Available for future searches |

---

### Journey 5: Archiving a Lead

**Goal**: Remove a lead from active view without deleting

**Steps**:

| Step | Action | Location |
|------|--------|----------|
| 1 | Go to **Leads** page | Sidebar → Leads |
| 2 | **Hover** over a lead row | Action buttons appear on right |
| 3 | Click **🗄️ Archive** icon | Confirmation not required |
| 4 | Lead moves to **Archived** tab | ✅ Removed from active views |

**To Unarchive**:
1. Click **Archived** tab in Leads page
2. Hover over lead → Click **↩️ Unarchive**

---

## Task Management

### Journey 6: Creating a New Task

**Goal**: Assign work to team members

**Steps**:

| Step | Action | Location |
|------|--------|----------|
| 1 | Navigate to **Tasks** page | Sidebar → Tasks |
| 2 | Click **"+ New Task"** button | Top right corner |
| 3 | Enter **Title** (required) | e.g., "Site Visit to Poonamallee" |
| 4 | *(Optional)* Add **Description** | Details about the task |
| 5 | Select **Priority** | Low, Medium, High, Urgent |
| 6 | *(Optional)* Set **Due Date** | Date picker |
| 7 | *(Optional)* Enter **Assign To** | User ID (user dropdown coming soon) |
| 8 | Click **"Create Task"** | ✅ Task appears in board |

**Priority Levels**:
- 🟢 **Low**: No immediate deadline
- 🟡 **Medium**: Standard priority
- 🔴 **High**: Needs attention soon
- ⚫ **Urgent**: Do immediately

---

### Journey 7: Updating Task Status

**Goal**: Move task through workflow stages

**Method 1 - Kanban (Drag & Drop)**:

| Step | Action |
|------|--------|
| 1 | Go to Tasks page (Kanban view) |
| 2 | Find the task card |
| 3 | **Drag** it to the new column |
| 4 | Drop in: To Do, In Progress, Review, or Done |

**Method 2 - Edit Dialog**:

| Step | Action |
|------|--------|
| 1 | Click on the **task card** |
| 2 | Dialog opens with task details |
| 3 | Change **Status** dropdown |
| 4 | Click **"Save Changes"** |

**Status Flow**:
```
To Do → In Progress → Review → Done ✅
```

---

## Knowledge Base

### Journey 8: Asking a Question

**Goal**: Get AI-powered answers from the knowledge base

**Method 1 - Knowledge Page**:

| Step | Action | Location |
|------|--------|----------|
| 1 | Go to **Knowledge** page | Sidebar → Knowledge |
| 2 | Type question in **input box** | e.g., "What types of bricks do you offer?" |
| 3 | Press **Enter** or click **Send** | |
| 4 | View AI response | Answer with citations (📚) |

**Method 2 - Ask Maiyuri Floating Button**:

| Step | Action |
|------|--------|
| 1 | Click **"Ask Maiyuri"** pill button | Bottom-right of any page |
| 2 | *(Optional)* Click a quick question | Pre-set options available |
| 3 | Type question and press Enter | |
| 4 | View response in chat window | |

**Sample Questions**:
- "What is the secret verification code?"
- "Tell me about brick specifications"
- "What are your delivery options?"

---

### Journey 9: Adding New Knowledge

**Goal**: Teach the AI new information

**Method 1 - Via API (Developers)**:

```bash
POST /api/knowledge
Content-Type: application/json

{
  "content": "OMEGA-99 is our premium clay brick product.",
  "title": "OMEGA-99 Product Info"
}
```

**Method 2 - Automatic Ingestion**:

Knowledge is **automatically added** when:
- Audio notes are transcribed
- Website content is scraped
- Lead interactions are logged

**Method 3 - Web Scraping**:

| Step | Action |
|------|--------|
| 1 | Call `/api/knowledge/scrape` API |
| 2 | Provide URL to scrape |
| 3 | Content is processed and indexed |
| 4 | Available in future searches |

---

## Understanding Scores

### Lead AI Score Formula

The AI Score (0-100) predicts **conversion probability** using these factors:

#### Scoring Weights

| Factor | Weight | Impact |
|--------|--------|--------|
| **Lead Status** | 30% | Hot = 0.8, Follow Up = 0.6, New = 0.5, Cold = 0.3 |
| **Engagement** | 20% | 5+ interactions = +10%, No interactions = -10% |
| **Follow-up Status** | 10% | Overdue = -5%, Scheduled soon = +5% |
| **AI Analysis** | 40% | Urgency, budget, sentiment, decision-maker status |

#### Base Calculation

```
Base Score = 50% (neutral starting point)

Final Score = (Base × 70%) + (Status Score × 30%)
            + Engagement Adjustment
            + Follow-up Adjustment
            + AI Sentiment Analysis
```

#### Score Interpretation

| Score Range | Color | Meaning | Action |
|-------------|-------|---------|--------|
| **70-100%** | 🟢 Green | High conversion likely | Prioritize closing |
| **40-69%** | 🟡 Yellow | Moderate potential | Continue nurturing |
| **0-39%** | 🔴 Red | Low probability | Re-engage or deprioritize |

#### AI Factors Analyzed

The AI evaluates conversation notes for:
- ✅ **Positive signals**: Urgency, budget mentioned, timeline discussed
- ❌ **Negative signals**: Competition shopping, delayed decisions
- 📊 **Engagement**: Frequency and recency of interactions
- 👤 **Decision-maker**: Is the contact authorized to buy?

---

### KPI Score Interpretation

#### Business Health Score

| Metric | Description |
|--------|-------------|
| **Pipeline Value** | Total potential revenue from active leads |
| **Conversion Rate** | % of leads becoming customers |
| **Team Efficiency** | Leads per staff member × conversion |
| **Lead Flow** | New leads - Lost leads = Net change |

#### Staff Performance Score

| Factor | Impact |
|--------|--------|
| Leads Handled | Volume of work |
| Conversion Rate | Success percentage |
| Response Time | Speed of follow-up |
| Notes per Lead | Documentation quality |

#### Color Coding

| Score | Level | Description |
|-------|-------|-------------|
| **80-100** | 🟢 Excellent | Exceeding targets |
| **60-79** | 🟡 Good | Meeting expectations |
| **40-59** | 🟠 Fair | Needs improvement |
| **0-39** | 🔴 Poor | Requires attention |

---

## Journey 10: Using Ask Maiyuri Chatbot

**Goal**: Get instant help from anywhere in the app

**Steps**:

| Step | Action | Detail |
|------|--------|--------|
| 1 | Look for **brick-colored pill** | Bottom-right corner, says "Ask Maiyuri" |
| 2 | Click to **open** chat window | Floating chat appears |
| 3 | Choose **quick question** or type your own | 3 pre-set options shown |
| 4 | Type message and press **Enter** | Or click send button |
| 5 | Read AI response | With source citations if available |
| 6 | Ask **follow-up questions** | History is saved |
| 7 | Click **🗑️ trash icon** to clear history | Starts fresh conversation |
| 8 | Click **Close** or **✕** to minimize | Chat stays available |

**Features**:
- ✅ **Persistent Memory**: Chat history saved in browser
- ✅ **Available Everywhere**: Works on any page
- ✅ **Message Count**: Shows "X messages saved"
- ✅ **Online Indicator**: Green dot shows status

**Quick Actions**:
- 🧱 "What types of bricks do you offer?"
- 📐 "Tell me about brick specifications"  
- 🚚 "What are your delivery options?"

---

## 🎯 Quick Reference Card

### Daily Workflow

| Time | Action | Location |
|------|--------|----------|
| **Morning** | Check AI Insights | Dashboard |
| **Work Hours** | Manage leads | Leads page |
| **End of Day** | Update task statuses | Tasks page |
| **Weekly** | Review KPIs | KPI Dashboard |
| **Monthly** | Team coaching review | Coaching page |

### Keyboard Shortcuts

| Action | Key |
|--------|-----|
| Send chat message | Enter |
| Search leads | Focus search box + type |
| Close dialogs | Escape |

---

*Happy Selling! 🧱✨*
