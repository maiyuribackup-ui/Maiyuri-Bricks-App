🧪 AI Lead Intelligence System – End-to-End Test Scripts
1. Scope & Objectives
Objective

Validate that the AI system:

Correctly analyzes sales calls

Assigns accurate lead scores

Produces explainable insights

Updates the knowledge base correctly

Detects unanswered questions

Triggers human workflows when knowledge is missing

Improves coaching & future calls via RAG

In Scope

Audio upload

STT accuracy

Intent & sentiment detection

Lead scoring

AI insights

Knowledge base updates

Task management (Engineer / Owner)

Coaching recommendations

2. User Personas (Test Actors)
Role	Description
Sales Rep	Uploads call audio
AI System	Analyzes calls, scores leads
Engineer	Adds technical answers to KB
Owner	Approves pricing & policy answers
Manager	Reviews coaching & performance
3. Test Data – Sample Call Transcripts
3.1 Positive Call Transcript (High Intent)

Audio Context

Duration: 7 min

Language: Tamil + English mix

Clear voice, low noise

Transcript (Simplified)
Customer: Ungal interlock bricks load-bearing ah?
Sales: Yes sir, it is load-bearing, we use CSEB with 7–8 MPa strength.

Customer: Square feet rate evlo?
Sales: ₹38 per brick, installation separate.

Customer: Site visit arrange pannalama?
Sales: Definitely sir, tomorrow itself arrange pannalaam.

Customer: Okay, please WhatsApp quotation.

3.2 Negative Call Transcript (Low Intent)

Audio Context

Duration: 4 min

Language: Tamil

Some background noise

Transcript
Customer: Just enquiry dhaan, future-la paakalaam.
Sales: Okay sir, price discuss pannalama?
Customer: Not now, later call pannunga.

3.3 Knowledge-Gap Call (Unanswered Question)
Transcript
Customer: Earth bricks rain-la weaken aaguma?
Sales: Umm… generally okay sir.
Customer: Certification irukka?
Sales: I will confirm and get back.

4. Test Scenario 1 – Positive Call (High Score)
4.1 Steps

User uploads audio

Gemini STT generates transcript

AI performs:

Intent detection

Objection detection

Question extraction

Sentiment analysis

AI calculates lead score

AI generates:

Timeline summary

Recommended actions

Coaching insight

KB update triggered

4.2 Expected AI Analysis
Intent Signals Detected

Asked for price

Asked for site visit

Asked for quotation

Sentiment

Positive

Engaged

Objections

None

4.3 Expected Lead Score
Factor	Weight	Result
Buying intent	High	✅
Engagement	High	✅
Objections	None	✅
Timeline urgency	Short	✅

Final Score: 82–90
Confidence: High
Conversion Likelihood: >70%

4.4 Expected AI Actions

✅ Mark lead as High Confidence

✅ Suggest:

“Schedule site visit”

“Send quotation today”

✅ Highlight best-practice response used

✅ Add Q&A to Knowledge Base:

“Are interlock bricks load-bearing?”

“What is the price per brick?”

5. Test Scenario 2 – Negative Call (Low Score)
5.1 Expected AI Analysis
Intent Signals

Vague interest

No commitment

Deferred timeline

Sentiment

Neutral → Low

5.2 Expected Lead Score
Factor	Result
Buying intent	Low
Engagement	Low
Urgency	None

Final Score: 25–35
Confidence: Low

5.3 Expected AI Behavior

❌ Do NOT update KB

❌ Do NOT trigger tasks

✅ Recommend:

“Follow up after 30 days”

“Send introductory brochure”

✅ Coaching Tip:

“Ask timeline-clarifying questions early.”

6. Test Scenario 3 – Knowledge Gap Detected
6.1 Detection Logic

AI detects:

Question asked

Answer was incomplete / uncertain

Question NOT found in KB

6.2 Expected AI Behavior
AI Insight Generated

“Customer asked about rain durability & certification.
No verified answer exists in the knowledge base.”

6.3 Task Creation (Automatic)
Task 1 – Engineer

Title: Verify rain durability of CSEB bricks

Assigned to: Engineer

Due: 2 days

Source: Call ID #123

Task 2 – Owner

Title: Confirm certification & compliance documents

Assigned to: Owner

Due: 2 days

6.4 UI Expectation

Lead detail page shows:

⚠️ “Pending Knowledge”

Linked tasks

Sales rep is prompted:

“Do not provide assumptions. Await verified response.”

7. Test Scenario 4 – Knowledge Base Update Flow
7.1 Engineer Completes Task

Answer Provided

“CSEB bricks are water-resistant when stabilized with 8% cement and cured properly. Tested as per IS 1725.”

7.2 Owner Approval

Reviews answer

Approves for external usage

7.3 Expected System Behavior

KB entry created:

Question

Verified answer

Source: Engineer + Owner

Confidence: High

Re-embed KB

Update RAG index

Mark previous lead as:

“Knowledge gap resolved”

8. Test Scenario 5 – Future Call Uses KB (RAG Validation)
8.1 New Call

Customer asks:

“Rain-la bricks damage aaguma?”

8.2 Expected AI Assistance

AI retrieves verified KB answer

Shows suggested response to sales rep

Flags:

“Use certified explanation”

8.3 Expected Outcome

Better response

Higher confidence

Improved lead score (+10–15%)

9. Test Scenario 6 – Coaching Feedback Loop
Expected Coaching Insights
Scenario	Coaching Tip
Positive call	Reinforce effective phrasing
Negative call	Improve probing questions
Knowledge gap	Avoid guessing
High performer	Share best responses with team
10. Failure & Edge Case Tests
10.1 STT Failure

Audio unclear

Expected:

Confidence warning

Manual transcript option

10.2 Hallucination Prevention

AI must NOT invent certifications

Must say:

“Information not available yet”

10.3 Duplicate KB Prevention

Same question re-asked

AI links existing KB entry

11. Success Criteria (Pass / Fail)
Area	Pass Condition
Lead scoring	Matches intent
KB updates	Only verified info
Tasks	Created when needed
Coaching	Contextual & relevant
RAG	Uses approved answers
12. Final Outcome (User Journey Summary)

Sales Rep → AI → Knowledge → Coaching → Better Calls → Higher Conversion

This closes the loop:

Every call improves the system

AI does NOT pretend to know

Humans are looped in only when needed

Knowledge compounds over time