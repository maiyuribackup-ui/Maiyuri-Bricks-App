# PRD: My Work Module — Maiyuri OneHub

You are working on the existing Maiyuri Bricks OneHub application.

Current application:
- Maiyuri OneHub is already built and available under the existing Maiyuri Bricks application.
- OneHub currently contains:
  - Start Here
  - SOP Library
  - New Joiners Checklist
  - Important Links
  - Important Reminders
  - KPI Dashboard
  - Training
  - Forms & Templates
- The application is accessible from both desktop and the Maiyuri mobile app.
- The application already has authentication, users, roles and an existing design system.
- Supabase is used as the primary backend/database.
- Existing checklist-related functionality may already exist in the codebase.
- Do not create a separate application.
- Do not integrate Todoist.
- Do not add dependency on any external task-management platform.

Objective:

Add a new module/tab called "My Work" inside the existing OneHub application.

"My Work" must become the single, distraction-free place where each employee can see exactly what they need to do, open the assigned activity, complete the work, add photos and notes where required, and submit it.

The long-term vision is:

One user
→ One work list
→ One activity
→ One place to complete it
→ One auditable record

For the first version, add "My Work" as a separate tab without replacing or significantly changing the existing OneHub home page. Later, we may make My Work the default landing page for operational users.

==================================================
1. FIRST INSPECT THE EXISTING CODEBASE
==================================================

Before making changes:

1. Inspect the current project structure.
2. Identify:
   - Frontend framework and routing
   - Authentication implementation
   - Supabase client configuration
   - Existing user and role tables
   - Existing checklist-related tables and components
   - Existing New Joiners Checklist implementation
   - Existing notification/reminder implementation
   - Existing mobile navigation
   - Existing desktop sidebar
   - Existing styling, design tokens and component library
3. Reuse existing components and database structures wherever suitable.
4. Do not create duplicate checklist, user, role or attachment systems if they already exist.
5. Do not introduce a new UI framework unless absolutely necessary.
6. Do not break any existing OneHub functionality.

After inspection, create a concise implementation plan and then proceed with development.

Only stop and ask for clarification when there is a genuine architectural blocker or an irreversible decision. Otherwise, make sensible decisions based on the existing codebase.

==================================================
2. CORE DESIGN PRINCIPLE
==================================================

The My Work page must show actions, not software modules.

Do not make employees navigate through:

SOP Library
→ Production
→ Checklist
→ Select date
→ Select machine

Instead, show the assigned activity directly:

"Complete Pan Mixer Inspection"
"Submit Daily Production Report"
"Confirm Vehicle Dispatch"
"Upload Site Progress Photos"
"Complete Production Opening Checklist"

Clicking the activity must open the exact task or checklist instance already assigned to that user for that date.

==================================================
3. NAVIGATION
==================================================

Add a new navigation item:

My Work

Desktop:
- Add "My Work" to the existing OneHub sidebar.
- Place it immediately below "Start Here".
- Use an appropriate task/checklist icon.
- Show a small badge containing the number of overdue and due-today activities.

Mobile:
- Make My Work clearly accessible from the mobile navigation.
- Follow the current mobile navigation pattern.
- Do not overcrowd the mobile interface.
- My Work should be reachable with one tap after entering OneHub.

Suggested route:

/onehub/my-work

Use the existing routing conventions if they differ.

==================================================
4. MY WORK PAGE
==================================================

Build a mobile-first, responsive My Work page.

The page should contain:

Header:

Good Morning, [User First Name]

Summary cards:

- Overdue
- Due Today
- In Progress
- Completed Today

Example:

2 Overdue
4 Due Today
1 In Progress
3 Completed

Main sections:

1. Attention Required
2. Today
3. Upcoming
4. Completed

The Completed section should be collapsed by default.

Sort activities in this order:

1. Overdue
2. Returned for correction
3. High priority
4. Due time
5. Upcoming date

Add simple filters:

- All
- Overdue
- Today
- Upcoming
- Completed

Do not make the page visually busy. The employee should immediately understand what needs to be done.

==================================================
5. WORK ITEM CARD
==================================================

Each activity should appear as a clear card.

The card should show:

- Activity title
- Due date and time
- Status
- Priority when relevant
- Related project, machine, vehicle, customer or department
- Activity type
- Checklist progress where relevant
- Evidence requirements
- One clear action button

Example:

PAN MIXER INSPECTION

Machine: Pan Mixer 01
Due: Today, 8:30 AM
7 checklist items
2 photos required

[Start Inspection]

Another example:

DAILY PRODUCTION REPORT

Due: Today, 10:00 AM
Status: In Progress
Last saved: 9:12 AM

[Continue]

Avoid showing unnecessary technical information.

==================================================
6. SUPPORTED WORK ITEM TYPES
==================================================

For the first production-ready version, support these work item types:

1. Simple Task
2. Checklist Task
3. Inspection Task
4. Update / Report Task
5. Approval Task

The architecture must allow future activity types without redesigning the whole module.

Simple Task:
- Can be completed directly.
- May contain notes and attachments.

Checklist Task:
- Must open a specific checklist instance.
- Cannot be completed until mandatory checklist items are completed.

Inspection Task:
- Similar to a checklist.
- May require photos, notes, condition and corrective actions.

Update / Report Task:
- May require quantity, text, photos or structured inputs.

Approval Task:
- Can be approved, rejected or returned with comments.

For the initial MVP, fully implement Simple Task and Checklist Task first. Structure the code to support the remaining types.

==================================================
7. WORK ITEM STATUSES
==================================================

Use a simple status model:

- pending
- in_progress
- submitted
- completed
- returned
- cancelled

"Overdue" should preferably be derived from:

due_at < current time
AND status is not completed, submitted or cancelled

Do not store overdue as a separate permanent status unless the existing architecture requires it.

User-facing labels:

- Pending
- In Progress
- Submitted
- Completed
- Returned for Correction
- Cancelled
- Overdue

==================================================
8. TASK DETAILS PAGE
==================================================

Clicking a work item should open its details page.

Suggested route:

/onehub/my-work/[workItemId]

Show:

- Title
- Instructions
- Assigned user
- Due date and time
- Priority
- Related project, asset, vehicle, customer or department
- Linked SOP, if available
- Required evidence
- Activity history
- Notes
- Attachments
- Start, Save Draft, Submit or Complete actions depending on activity type

The user must not manually select:

- Date
- Assignee
- Machine
- Vehicle
- Project
- Checklist template

These should already be populated from the assigned work item.

==================================================
9. CHECKLIST EXPERIENCE
==================================================

For checklist-linked work:

1. Open the exact checklist instance assigned to the user.
2. Automatically display:
   - Checklist name
   - Scheduled date
   - Assigned user
   - Related project, machine, vehicle or department
   - Start time
3. Allow the user to answer each checklist item.

Each checklist item should support, where configured:

- Completed
- Not Completed
- Not Applicable
- Text input
- Number input
- Photo
- Notes
- Corrective action

When "Not Completed" is selected:

- Require a reason.
- Require a corrective action when configured.
- Require a photo when configured.
- Highlight the item clearly.

Checklist example:

Hydraulic oil level checked

○ Completed
○ Not Completed
○ Not Applicable

[Add Photo]
[Add Note]

==================================================
10. PHOTO AND ATTACHMENT HANDLING
==================================================

Users must be able to:

- Take a photo directly from the mobile camera
- Select an existing image
- Preview the image
- Remove the image before submission
- Add an optional caption

Store images using the existing Supabase Storage approach.

If no suitable storage structure exists, create a controlled storage structure such as:

work-items/{work_item_id}/{user_id}/{timestamp}-{filename}

Requirements:

- Validate file type.
- Apply a reasonable file-size limit.
- Compress large mobile photos before upload where practical.
- Preserve sufficient quality for operational evidence.
- Show upload progress.
- Handle upload failures gracefully.
- Do not mark the activity as submitted while mandatory uploads are still pending.

Store attachment metadata in the database.

==================================================
11. NOTES AND DRAFTS
==================================================

Support:

- General activity notes
- Checklist-item notes
- Corrective-action notes
- Supervisor return comments

Implement draft saving.

Preferred behavior:

- Autosave when practical.
- Show:
  "Last saved at 9:12 AM"
- Preserve unsaved user input during temporary network interruptions.
- Prevent accidental loss when navigating away.
- Show a confirmation before discarding unsaved changes.

==================================================
12. SUBMISSION AND COMPLETION RULES
==================================================

Simple Task:

- User can mark it completed.
- If a mandatory note or photo is configured, validate it first.

Checklist Task:

- User starts the task.
- Status becomes in_progress.
- User completes the checklist.
- User submits it.
- Status becomes submitted or completed according to the approval configuration.

Do not allow completion when:

- Mandatory checklist items are unanswered.
- Required photos are missing.
- Required notes are missing.
- Required corrective actions are missing.
- Uploads are still pending.

After submission:

- Lock normal editing.
- Allow an authorized supervisor or administrator to return or reopen the work item.
- Record all reopening and return actions in the audit log.

==================================================
13. SUPERVISOR VIEW
==================================================

Users with supervisor or manager permission should see two tabs:

- My Work
- Team Status

Team Status should show:

- Employee name
- Total activities today
- Completed
- Pending
- In progress
- Overdue
- Returned

Example:

Rajesh
5 completed
1 overdue
[View Activities]

Srinivasan
4 completed
2 pending
[View Activities]

Driver Kumar
All completed

Supervisors should be able to:

- View team activities
- Open submitted work
- Review checklist evidence
- Return work for correction
- Add a return reason
- Reopen an activity
- Reassign an activity when permitted
- Filter by employee, status, date and activity type

Do not allow supervisors to silently modify an employee's submitted answers. Corrections should be made through a return-and-resubmit process.

==================================================
14. ADMINISTRATIVE FUNCTIONS
==================================================

Provide an administrative interface that allows authorized users to:

- Create a work item
- Edit a work item
- Assign it to a user
- Select activity type
- Set due date and time
- Set priority
- Link a project, machine, vehicle, customer or department
- Link a checklist template
- Set photo requirements
- Set note requirements
- Link an SOP
- Cancel a work item
- View activity history

Also support recurring work templates.

Examples:

- Production Opening Checklist — Daily at 8:30 AM
- Production Closing Checklist — Daily at 6:00 PM
- Pan Mixer Inspection — Daily before production
- Generator Inspection — Every Monday
- Vehicle Maintenance Check — First day of every month
- Site Progress Update — Every Friday

Do not attempt to rebuild every Todoist feature.

Do not build:

- Productivity scores
- Personal habit tracking
- Complex personal project structures
- Natural-language task parsing
- Personal labels and themes
- Social collaboration features

This is an operational work-management feature, not a general personal productivity platform.

==================================================
15. RECURRING WORK
==================================================

Create recurring work templates separately from individual work instances.

Suggested logic:

Recurring template
→ Scheduler runs
→ Creates dated work item
→ Assigns it to an individual user
→ Appears in My Work
→ User completes it
→ Historical record remains permanently available

Never reuse the same task record every day.

Each occurrence must be a separate auditable work item.

Implement idempotency so the scheduler cannot accidentally create duplicates.

Suggested unique key:

template_id + assigned_user_id + scheduled_date

Use the project's existing scheduler if available.

If no scheduler exists, use the most suitable internal option from the existing stack, such as:

- Supabase scheduled Edge Function
- pg_cron
- Existing backend scheduler
- Existing self-hosted n8n workflow

The core feature must not depend on Todoist or another third-party task system.

==================================================
16. RECOMMENDED DATA MODEL
==================================================

First inspect the existing Supabase schema.

Reuse or extend existing tables where possible.

Do not blindly create duplicate tables.

The logical model should contain the following concepts.

A. work_items

Suggested fields:

- id
- title
- description
- instructions
- activity_type
- status
- priority
- assigned_user_id
- assigned_by_user_id
- department_id
- due_at
- available_from
- started_at
- submitted_at
- completed_at
- returned_at
- cancelled_at
- return_reason
- source_module
- source_record_id
- related_project_id
- related_machine_id
- related_vehicle_id
- related_customer_id
- checklist_instance_id
- linked_sop_id
- requires_photo
- requires_note
- requires_approval
- created_at
- updated_at

B. work_item_templates

Suggested fields:

- id
- name
- activity_type
- title
- description
- default_assigned_user_id
- default_role_id
- default_department_id
- checklist_template_id
- recurrence_rule
- due-time configuration
- priority
- requires_photo
- requires_note
- requires_approval
- active
- created_by
- created_at
- updated_at

C. work_item_attachments

Suggested fields:

- id
- work_item_id
- checklist_item_id
- uploaded_by
- storage_path
- file_name
- mime_type
- file_size
- caption
- created_at

D. work_item_events or audit_log

Suggested fields:

- id
- work_item_id
- event_type
- old_status
- new_status
- performed_by
- comments
- metadata
- created_at

E. checklist structures

Reuse existing checklist tables if available.

Otherwise the logical structure should support:

- checklist_templates
- checklist_template_items
- checklist_instances
- checklist_responses

Do not create checklist templates inside each work item.

The work item should reference a dated checklist instance.

==================================================
17. AUTHORIZATION AND SUPABASE RLS
==================================================

Use Supabase Row-Level Security.

Required rules:

Employee:
- Can view their own assigned work items.
- Can update their own eligible pending or in-progress work.
- Can upload attachments only to their own work items.
- Cannot change assignee, due date, priority or configuration.
- Cannot edit locked submitted/completed work.

Supervisor:
- Can view their own work.
- Can view work belonging to permitted team members.
- Can review submitted work.
- Can return or reopen work when authorized.
- Cannot silently alter submitted employee responses.

Administrator:
- Can create, assign, edit, cancel and review all permitted work items.

Ensure storage policies protect attachments as well.

Do not rely only on frontend authorization.

==================================================
18. AUDIT HISTORY
==================================================

Record meaningful events, including:

- Work item created
- Assigned
- Reassigned
- Opened
- Started
- Draft saved
- Submitted
- Completed
- Returned
- Reopened
- Cancelled
- Photo added
- Photo removed
- Due date changed

The activity history should show:

- Action
- User
- Date and time
- Relevant comment

Do not expose raw technical logs to normal employees.

==================================================
19. NOTIFICATIONS
==================================================

For the initial version, implement in-app notifications using existing notification infrastructure where available.

Notification events:

- New work assigned
- Work due soon
- Work overdue
- Work returned for correction
- Work reassigned
- High-priority work assigned
- Supervisor review required

Notifications must deep-link directly to the relevant work item.

Example:

"Production Opening Checklist is due at 8:30 AM."

Tap
→ Opens that exact checklist activity.

Do not send users back to the general OneHub home page.

If push notifications already exist in the Maiyuri mobile application, reuse them.

If push notifications do not yet exist, create the internal notification model and UI first, and clearly document the push-notification extension point.

==================================================
20. ESCALATION LOGIC
==================================================

Build an extensible escalation structure.

Example:

Task due: 9:00 AM

- 8:30 AM: reminder to employee
- 9:00 AM: due notification
- 9:30 AM: marked overdue
- 10:00 AM: supervisor notified
- 11:00 AM: senior escalation only for critical tasks

The first version may use configurable reminder and escalation values at template level.

Avoid sending management a notification for every completed task.

Management notifications should focus on exceptions:

- Critical overdue activity
- Safety failure
- Quality defect
- Vehicle damage
- Checklist returned repeatedly
- Mandatory evidence missing
- Corrective action unresolved

==================================================
21. DESIGN AND USER EXPERIENCE
==================================================

Match the current Maiyuri OneHub visual identity:

- Existing maroon and cream styling
- Existing typography
- Existing cards
- Existing spacing
- Existing icons
- Existing responsive patterns

Do not create a visually disconnected module.

Requirements:

- Mobile first
- Large tap targets
- Minimal typing
- Clear status labels
- Simple language
- Fast loading
- Accessible contrast
- Clear empty states
- Clear error states
- Skeleton loading states
- No unnecessary animations

Example empty state:

"You have no pending work today."

Example completed state:

"All work for today is complete."

Avoid confetti, gamification or distracting productivity scores.

==================================================
22. PERFORMANCE
==================================================

The My Work page must load quickly.

Use:

- Efficient Supabase queries
- Appropriate indexes
- Pagination for historical activities
- Lazy loading for attachments
- Thumbnail previews rather than full-size images
- Optimistic UI only where safe
- Query caching according to the existing application pattern

Do not load all historical work items on initial page load.

Default page query:

- Overdue open work
- Today's work
- Limited upcoming work
- Today's completed work

==================================================
23. ERROR HANDLING
==================================================

Handle:

- Network failure
- Upload failure
- Duplicate submission
- Unauthorized access
- Deleted or cancelled activity
- Missing checklist template
- Invalid recurring template
- Scheduler retry
- User no longer active
- Activity reassigned while open

Show user-friendly error messages.

Do not expose database or stack traces to the user.

==================================================
24. TESTING
==================================================

Add tests using the project's existing testing framework.

At minimum test:

1. Employee sees only their own assigned work.
2. Supervisor sees permitted team work.
3. Administrator can create and assign work.
4. Overdue work is correctly calculated.
5. Work is sorted correctly.
6. Simple tasks can be completed.
7. Mandatory notes prevent invalid completion.
8. Mandatory photos prevent invalid completion.
9. Checklist tasks cannot complete without valid checklist submission.
10. Submitted work is locked.
11. Supervisor can return work with a reason.
12. Returned work becomes actionable again.
13. Recurring work does not generate duplicates.
14. Unauthorized users cannot access another user's attachments.
15. Mobile layout works correctly.
16. Existing OneHub modules continue working.

==================================================
25. ACCEPTANCE CRITERIA
==================================================

The feature is acceptable when:

1. "My Work" appears in OneHub desktop and mobile navigation.
2. Logged-in employees see only work assigned to them.
3. Overdue, today, upcoming and completed activities are clearly separated.
4. Users can open a work item directly.
5. Users can complete a simple task.
6. Users can complete a checklist task.
7. Users can save drafts.
8. Users can upload photos and add notes.
9. Mandatory requirements are validated.
10. Submission creates an auditable record.
11. Supervisors can view team status.
12. Supervisors can return submitted work with comments.
13. Administrators can manually create and assign work.
14. Recurring templates create separate dated work instances.
15. Existing OneHub functionality is not broken.
16. The interface works well on the Maiyuri mobile app.
17. No Todoist or external task-management integration is required.

==================================================
26. IMPLEMENTATION SEQUENCE
==================================================

Implement in controlled phases.

Phase 1: Foundation
- Inspect existing architecture
- Confirm reusable checklist functionality
- Create or extend database schema
- Add RLS policies
- Add audit model
- Add My Work route and navigation

Phase 2: Employee Work Queue
- My Work summary
- Work item cards
- Filters
- Work details
- Start task
- Save draft
- Complete simple task

Phase 3: Checklist Integration
- Link checklist instances
- Checklist completion
- Photos
- Notes
- Mandatory validations
- Submission and locking

Phase 4: Supervisor
- Team Status
- Review submission
- Return for correction
- Reopen
- Reassign where permitted

Phase 5: Administration and Recurrence
- Create work item
- Assign work
- Create recurring template
- Scheduler
- Duplicate protection

Phase 6: Notifications and Hardening
- In-app notifications
- Due reminders
- Escalations
- Performance optimization
- Testing
- Documentation

Commit changes in logical, reviewable steps where possible.

==================================================
27. OUT OF SCOPE FOR THE FIRST RELEASE
==================================================

Do not implement in the first release unless already supported:

- Todoist integration
- WhatsApp integration
- Complex offline-first synchronization
- Payroll workflows
- Full project-management software
- Gantt charts
- Time-sheet management
- Personal productivity scoring
- AI-based task assignment
- Voice task creation
- External customer access

Design extension points where useful, but do not overbuild.

==================================================
28. REQUIRED FINAL OUTPUT
==================================================

After implementation, provide:

1. Architecture summary
2. Files created and modified
3. Database migrations added
4. RLS policies added
5. Routes and components created
6. Existing components reused
7. Instructions to run migrations
8. Instructions to test locally
9. Test results
10. Any limitations
11. Recommended next development phase
12. Screenshots or a clear description of the completed desktop and mobile flows

The final solution must be maintainable, modular and consistent with the existing Maiyuri OneHub architecture.

The most important outcome is simplicity:

The employee opens My Work, sees exactly what must be done, opens the activity, completes the required work, uploads evidence and submits it without navigating through multiple systems or modules.
