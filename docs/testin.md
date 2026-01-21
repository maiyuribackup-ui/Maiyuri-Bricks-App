# TESTING.md - Professional Testing & Debugging Standards

> **Core Philosophy**: Find bugs before they find users. When bugs appear, fix the root cause permanently—never apply band-aids. A bug fixed twice is a process failure.

---

## 📚 RELATED DOCUMENTS

```
/CLAUDE.md      → Development Standards & Coding Practices
/TESTING.md     ← You are here (Testing & Debugging)
/LEARNINGS.md   → Accumulated Lessons & Mistake Log
```

**Cross-Reference Rules:**

- Before coding → Read CLAUDE.md + check LEARNINGS.md
- When bugs occur → Follow this TESTING.md protocol
- After any issue → Update LEARNINGS.md

---

## 🎯 THE FIRST-ATTEMPT PRINCIPLE

### Why First-Attempt Matters

```
Every failed debugging attempt costs:
- Time (yours and the system's)
- Tokens (in AI-assisted development)
- Context (mental state and focus)
- Confidence (in the codebase)
- Compound bugs (quick fixes often create new issues)
- Money (developer time, infrastructure)

Goal: 90%+ of bugs should be identified, understood, and permanently fixed on the first attempt.
```

### The First-Attempt Mindset

```
❌ WRONG: "Let me try this fix and see if it works"
✅ RIGHT: "Let me understand exactly why this fails before touching any code"

❌ WRONG: "I'll add a null check here to stop the error"
✅ RIGHT: "Why is this null? Where should it have been set? What else might be affected?"

❌ WRONG: "This fixes the immediate problem"
✅ RIGHT: "This fixes the root cause and prevents all similar issues"

❌ WRONG: "It works now, let's move on"
✅ RIGHT: "I understand why it failed and why my fix is correct"
```

---

## 🛡️ PRE-CODE BUG PREVENTION

### Before Writing Code - Catch Bugs Before They Exist

```
┌─────────────────────────────────────────────────────────────────┐
│  The cheapest bug to fix is the one you never write            │
└─────────────────────────────────────────────────────────────────┘

□ 1. REQUIREMENTS ANALYSIS
     - Are requirements clear and complete?
     - What are the edge cases?
     - What are the error scenarios?
     - What happens with invalid input?
     - What are the performance requirements?

□ 2. CHECK LEARNINGS.md
     - Have I made similar mistakes before?
     - Are there known pitfalls for this type of task?
     - What patterns should I follow?
     - What patterns should I avoid?

□ 3. REVIEW SIMILAR CODE
     - Does similar code exist in the codebase?
     - How did it handle edge cases?
     - What bugs were found in similar code?
     - Can I reuse existing tested code?

□ 4. PLAN ERROR SCENARIOS
     - What external dependencies can fail?
     - What invalid states are possible?
     - How should each error be handled?
     - What should the user see for each error?

□ 5. DESIGN FOR TESTABILITY
     - Can this code be unit tested?
     - Are dependencies injectable?
     - Are there side effects that complicate testing?
     - Can I test edge cases easily?
```

### Static Analysis - Catch Bugs Without Running Code

```
Run these BEFORE executing:

□ Type checking (TypeScript, mypy, dart analyze)
□ Linting (ESLint, Pylint, dartanalyzer)
□ Security scanning (npm audit, safety, dependabot)
□ Code formatting (Prettier, Black, dart format)
□ Dead code detection
□ Complexity analysis
□ Import/dependency validation
```

---

## 🔬 THE DEBUGGING PROTOCOL

### Phase 1: STOP & OBSERVE (Do Not Touch Code Yet)

```
┌─────────────────────────────────────────────────────────────────┐
│  MANDATORY: Complete this phase before ANY code changes        │
│  Time spent here saves 10x time in wrong directions            │
└─────────────────────────────────────────────────────────────────┘

□ 1. READ THE COMPLETE ERROR
     - Full error message (not just the first line)
     - Complete stack trace (every line matters)
     - Any warnings that preceded the error
     - Timestamps and sequence of events
     - Error codes if any
     - Which environment (dev/staging/prod)

□ 2. REPRODUCE RELIABLY
     - Can you trigger this bug consistently?
     - What are the exact steps to reproduce?
     - What are the exact inputs that cause it?
     - What environment conditions are required?
     - Can you reproduce in development environment?
     - What's the minimum reproduction case?

□ 3. IDENTIFY THE SCOPE
     - When did this start happening?
     - What changed recently? (code, config, dependencies, data)
     - Does it happen in all environments?
     - Does it affect all users/inputs or specific ones?
     - Is it 100% reproducible or intermittent?
     - What's the blast radius (who/what is affected)?

□ 4. GATHER EVIDENCE
     - Relevant log entries (before, during, after error)
     - Database state at time of error
     - Request/response payloads
     - System resource state (memory, CPU, connections)
     - Related errors in other services
     - User session/context information
     - Git history of recently changed files
```

### Phase 2: ANALYZE & UNDERSTAND (Still No Code Changes)

```
┌─────────────────────────────────────────────────────────────────┐
│  MANDATORY: You must be able to explain the bug to someone     │
│  else BEFORE you're allowed to fix it                          │
└─────────────────────────────────────────────────────────────────┘

□ 1. TRACE THE EXECUTION PATH
     - Start from the entry point (request, user action, trigger)
     - Follow the data flow step by step
     - Identify where expected behavior diverges from actual
     - Mark the exact line(s) where the bug manifests
     - Track variable values at each step
     - Note any assumptions being made

□ 2. IDENTIFY ROOT CAUSE (Not Symptoms)
     Answer these questions:
     - WHY does this happen, not just WHAT happens?
     - What assumption was violated?
     - Is this a logic error, data error, timing error, or integration error?
     - Would this bug exist if the code were written correctly initially?
     - What's the root cause vs the immediate cause?
     - Is this a symptom of a deeper problem?

□ 3. THE "5 WHYS" TECHNIQUE
     Keep asking "why" until you reach the fundamental cause:

     Example 1:
     - Error: NullPointerException on user.getName()
     - Why? user object is null
     - Why? findUserById() returned null
     - Why? User ID doesn't exist in database
     - Why? ID came from expired session cache
     - Why? Cache TTL not synchronized with session TTL
     ──► ROOT CAUSE: Cache configuration mismatch

     Example 2:
     - Error: API returns 500 error
     - Why? Database query fails
     - Why? Connection timeout
     - Why? Too many open connections
     - Why? Connections not being closed after use
     - Why? Missing finally block in database helper
     ──► ROOT CAUSE: Resource leak in database helper

     Fix the ROOT CAUSE, not the symptoms!

□ 4. CHECK LEARNINGS.md
     - Have we seen this bug pattern before?
     - Is there a documented solution?
     - What was the root cause last time?
     - What prevention measures exist?

□ 5. DOCUMENT YOUR UNDERSTANDING
     Before fixing, write down:
     - Root cause in one sentence
     - Why the original code didn't handle this
     - What other code might have similar issues
     - What the correct behavior should be
     - Confidence level in your diagnosis (high/medium/low)
```

### Phase 3: DESIGN THE FIX (Plan Before Coding)

````
┌─────────────────────────────────────────────────────────────────┐
│  MANDATORY: Design the complete fix before writing any code    │
│  A well-planned fix takes minutes; a wrong fix takes hours     │
└─────────────────────────────────────────────────────────────────┘

□ 1. DEFINE THE COMPLETE SOLUTION
     - What code changes are needed?
     - What configuration changes are needed?
     - What data fixes are needed (if any)?
     - What documentation needs updating?
     - What tests need to be added/modified?

□ 2. ASSESS IMPACT RADIUS
     - What other code depends on what you're changing?
     - What other features might be affected?
     - Are there similar patterns elsewhere that need the same fix?
     - Will this change any public APIs or contracts?
     - Could this fix break other things?
     - What's the risk level? (low/medium/high)

□ 3. CONSIDER ALTERNATIVES
     - Is there a simpler solution?
     - Is there a more comprehensive solution?
     - What are the trade-offs of each approach?
     - Which solution prevents future similar bugs?
     - Which solution is most maintainable?
     - Should we fix the symptom now and root cause later?

□ 4. PLAN VALIDATION
     - How will you verify the fix works?
     - How will you verify nothing else broke?
     - What edge cases need testing?
     - How will you confirm in production?
     - What monitoring will confirm success?

□ 5. WRITE THE FIX SPECIFICATION
     Before coding, document:

     ```
     Bug ID: [If applicable]
     Bug: [One-line description]
     Root Cause: [Fundamental reason - be specific]
     Fix: [What changes will be made]
     Files Affected: [List of files]
     Risk Level: [Low/Medium/High]
     Validation Plan: [How to verify]
     Rollback Plan: [How to undo if needed]
     Related Issues: [Other bugs that might have same cause]
     ```
````

### Phase 4: IMPLEMENT THE FIX

```
┌─────────────────────────────────────────────────────────────────┐
│  NOW you may write code, following these rules strictly        │
└─────────────────────────────────────────────────────────────────┘

□ 1. FIX THE ROOT CAUSE
     - Address the fundamental issue, not just the symptom
     - Don't add defensive code around broken logic
     - Fix the source of bad data, not just handle bad data
     - Make the correct behavior the natural behavior

□ 2. FIX ALL INSTANCES
     - Search for similar patterns in the codebase
     - Apply the fix consistently everywhere
     - Don't leave ticking time bombs
     - Use find/grep to locate all occurrences

□ 3. ADD PROTECTIVE MEASURES
     - Add validation to prevent this class of bug
     - Add logging to detect if it happens again
     - Add tests to catch regression
     - Add assertions for assumptions
     - Consider adding monitoring/alerting

□ 4. IMPROVE THE CODE AROUND THE BUG
     - If the code was confusing, clarify it
     - If the logic was fragile, make it robust
     - Leave the code better than you found it
     - Add comments explaining non-obvious fixes

□ 5. DOCUMENT THE FIX
     - Clear commit message explaining the bug and fix
     - Comments in code if the fix isn't obvious
     - Update relevant documentation
     - Link to related issues/tickets

□ 6. WRITE REGRESSION TEST FIRST
     - Before or alongside the fix, write a test
     - Test should fail without the fix
     - Test should pass with the fix
     - Test should cover edge cases
```

### Phase 5: VALIDATE THE FIX

```
┌─────────────────────────────────────────────────────────────────┐
│  MANDATORY: Complete validation before considering it done     │
│  An untested fix is not a fix                                  │
└─────────────────────────────────────────────────────────────────┘

□ 1. VERIFY THE BUG IS FIXED
     - Reproduce original bug scenario → should now work
     - Test with original failing inputs → should now succeed
     - Check logs → no errors
     - Verify with exact reproduction steps from Phase 1

□ 2. VERIFY NO REGRESSION
     - Test happy path still works
     - Test related features still work
     - Run existing test suite → all pass
     - Test edge cases
     - Test features that share code with the fix

□ 3. VERIFY THE FIX IS COMPLETE
     - All instances of the pattern are fixed
     - Similar code paths are verified
     - No new warnings or errors introduced
     - No new linting issues

□ 4. STRESS TEST THE FIX
     - Test with unusual inputs
     - Test with high load (if relevant)
     - Test with concurrent operations (if relevant)
     - Test failure scenarios
     - Test boundary conditions

□ 5. VERIFY IN MULTIPLE ENVIRONMENTS
     - Test in local development
     - Test in staging/QA
     - Monitor after production deployment
     - Check logs and metrics post-deployment
```

### Phase 6: LEARN & PREVENT

```
┌─────────────────────────────────────────────────────────────────┐
│  MANDATORY: Every bug is a learning opportunity                │
│  A bug without a lesson is a bug that will return              │
└─────────────────────────────────────────────────────────────────┘

□ 1. UPDATE /LEARNINGS.md
     Use this detailed format:

     ### [YYYY-MM-DD] BUG: [Brief Title]

     **Symptoms**: What error/behavior was observed?

     **Root Cause**: Why did this happen fundamentally?

     **How Discovered**: How was the bug found? (user report, test, monitoring)

     **Investigation Path**: How did you find the root cause? (for future reference)

     **Fix Applied**: What changes were made?

     **Why Original Code Was Wrong**: What was the flawed assumption?

     **Prevention Rule**: How to prevent similar bugs? (one-line rule)

     **Detection Method**: How to catch this type of bug earlier?

     **Time to Fix**: How long did this take? (for tracking improvement)

     **Files Changed**: List of files modified

     **Tests Added**: What tests were added to prevent regression?

     ---

□ 2. IDENTIFY PROCESS IMPROVEMENTS
     Ask yourself:
     - Should this have been caught in code review?
     - Should this have been caught by tests?
     - Should this have been caught by linting/static analysis?
     - Was there a documentation gap?
     - Was there a training gap?
     - Could better tooling have prevented this?

□ 3. UPDATE STANDARDS
     - Add to CLAUDE.md if it's a general coding principle
     - Add to TESTING.md if it's a testing/debugging insight
     - Create a linting rule if automatable
     - Update code review checklist if applicable
     - Document in wiki/shared knowledge base

□ 4. SHARE THE KNOWLEDGE
     - Inform team members if relevant
     - Update shared documentation
     - Consider writing a brief post-mortem for significant bugs
```

---

## 🧪 TESTING STANDARDS

### Testing Pyramid

```
                    ╱╲
                   ╱  ╲
                  ╱ E2E╲         Few, slow, expensive
                 ╱──────╲        Test critical user journeys
                ╱        ╲
               ╱Integration╲    Some, medium speed
              ╱────────────╲    Test component interactions
             ╱              ╲
            ╱   Unit Tests   ╲  Many, fast, cheap
           ╱──────────────────╲ Test individual functions
          ╱                    ╲
         ╱   Static Analysis    ╲ Automatic, instant
        ╱────────────────────────╲ Linting, type checking
```

### What To Test - By Priority

#### P0: Always Test (Non-Negotiable)

```
□ All public functions/methods
□ All API endpoints
□ All data transformations
□ All validation logic
□ All error handling paths
□ All business rules
□ All security-sensitive code
□ All authentication/authorization logic
□ All payment/financial calculations
□ All external integrations (mocked)
```

#### P1: Should Test

```
□ All utility functions
□ All configuration loading
□ All data models/entities
□ State management logic
□ Complex conditional logic
□ Date/time handling
□ String manipulation
□ Sorting and filtering
```

#### P2: Consider Testing

```
□ Simple getters/setters
□ Thin wrapper functions
□ UI layout (via snapshot tests)
□ Trivial calculations
```

### Test Coverage Goals

```
Overall Target: 80%+ line coverage (quality over quantity)

By category:
- Business logic: 90%+ coverage
- Utility functions: 100% coverage
- Error handlers: 100% coverage
- API endpoints: 100% of documented behaviors
- Edge cases: All identified edge cases
- Security code: 100% coverage
- Data validation: 100% coverage
```

---

## 🎯 TEST CASE DESIGN

### Category 1: Happy Path Tests

```
Test the expected, normal usage:
- Valid inputs → Expected outputs
- Typical user journeys
- Standard data scenarios
- Normal operating conditions
- Most common use cases
```

### Category 2: Boundary Tests

```
Test the edges of valid input:
- Minimum valid values (0, 1, empty string)
- Maximum valid values
- Empty collections ([], {}, "")
- Single-element collections
- Exactly at limits (e.g., max length string)
- Just inside limits (limit - 1)
- Just outside limits (limit + 1)
```

### Category 3: Negative Tests

```
Test invalid inputs and error handling:
- Null/undefined inputs
- Wrong types (string when expecting number)
- Out of range values
- Malformed data (invalid JSON, XML)
- Missing required fields
- Invalid formats (email, phone, date)
- SQL injection attempts
- XSS payloads
```

### Category 4: Edge Case Tests

```
Test unusual but valid scenarios:
- Unicode and special characters (emoji, RTL, zero-width)
- Very long strings (10000+ chars)
- Very large numbers (beyond 32-bit)
- Very small numbers (floating point precision)
- Floating point precision (0.1 + 0.2)
- Timezone edge cases (UTC, DST transitions)
- Daylight saving time transitions
- Leap years (Feb 29), leap seconds
- Concurrent operations
- Race conditions
- Case sensitivity
- Whitespace (leading, trailing, multiple)
```

### Category 5: Error Recovery Tests

```
Test failure handling:
- Network failures (timeout, connection refused)
- Database failures (connection lost, deadlock)
- Timeout scenarios
- Partial failures (some items succeed, some fail)
- Retry behavior
- Rollback behavior
- Resource exhaustion (memory, disk, connections)
- External service unavailable
- Invalid responses from dependencies
```

### Category 6: Security Tests

```
Test security boundaries:
- SQL injection attempts
- XSS attempts (script tags, event handlers)
- Authentication bypass attempts
- Authorization violations (accessing other users' data)
- Input that exceeds limits (DoS prevention)
- Malicious file uploads
- Path traversal attempts (../)
- CSRF token validation
- Rate limiting behavior
```

### Category 7: State Tests

```
Test state transitions:
- Initial state
- After each action
- Invalid state transitions
- Concurrent state changes
- State persistence (reload, refresh)
- State cleanup (logout, close)
```

---

## 🔍 DEBUGGING TECHNIQUES

### Technique 1: Binary Search Debugging

```
When bug location is unknown:

1. Find a point where code is definitely working
2. Find a point where code is definitely broken
3. Test the midpoint
4. Narrow down: either first-half or second-half has the bug
5. Repeat until you find the exact location

Useful for: Regressions, data corruption, long pipelines

Example:
- 10 processing steps, output is wrong
- Test after step 5 → correct
- Test after step 7 → wrong
- Test after step 6 → correct
- Bug is in step 7
```

### Technique 2: Rubber Duck Debugging

```
Explain the problem out loud (or in writing):

1. State what the code is supposed to do
2. Explain what it actually does
3. Walk through the code line by line, explaining each step
4. The act of explaining often reveals the bug

Useful for: Logic errors, misunderstandings

Template:
"This function is supposed to [expected behavior].
It takes [inputs] and should produce [outputs].
First it does [step 1], which should result in [result 1].
Then it does [step 2]... wait, that's wrong because..."
```

### Technique 3: Minimal Reproduction

```
Simplify until you isolate the bug:

1. Start with the full failing scenario
2. Remove components one by one
3. After each removal, test if bug persists
4. Find the smallest code that still fails
5. The bug is in what remains

Useful for: Complex systems, integration issues

Goal: "This 5-line code snippet reproduces the bug"
```

### Technique 4: State Inspection

```
Track data through the system:

1. Log the input state (all variables)
2. Log state after each transformation
3. Compare actual vs expected at each step
4. Find where state diverges from expected
5. The bug is at the divergence point

Useful for: Data corruption, transformation errors

Tools: Debugger breakpoints, strategic console.log, logging
```

### Technique 5: Diff Analysis

```
Compare working vs broken:

1. Find a working version (git history, different env)
2. Compare: code, config, data, dependencies
3. Identify what changed
4. Test if reverting the change fixes the bug
5. The bug is caused by that change

Useful for: Regressions, environment issues

Commands:
  git diff HEAD~10..HEAD -- path/to/file
  git bisect (automatic binary search in git history)
```

### Technique 6: Hypothesis Testing

```
Scientific method for debugging:

1. Form a hypothesis about the cause
2. Design an experiment to test it
3. Predict what you'll see if hypothesis is correct
4. Run the experiment
5. If prediction matches, hypothesis confirmed
6. If not, form new hypothesis with new information

Useful for: Intermittent bugs, complex interactions

Example:
Hypothesis: "The bug happens because the cache expires during the request"
Experiment: "I'll set cache TTL to 1 second and time the request"
Prediction: "If cache TTL < request time, I'll see the bug consistently"
```

### Technique 7: Divide and Conquer

```
Isolate components:

1. Identify all components involved
2. Test each component in isolation
3. Find which component fails
4. If all pass in isolation, bug is in integration
5. Test pairs of components together

Useful for: Integration bugs, microservices
```

### Technique 8: Time Travel Debugging

```
Work backwards from the error:

1. Start at the error message/crash
2. What function produced this error?
3. What called that function with bad input?
4. Keep going back until you find the source
5. The root cause is where bad data was created

Useful for: Stack traces, call chains
```

---

## 🏥 COMMON BUG PATTERNS & FIXES

### Pattern 1: Null/Undefined Errors

```
Symptom: "Cannot read property 'x' of null/undefined"

Investigation Checklist:
□ Where should this value come from?
□ Under what conditions is it null?
□ Is null a valid state or a bug upstream?
□ What code path leads to this null?
□ When was it supposed to be set?

Common Causes:
- Async timing (data not loaded yet)
- Error in data fetching (silently failed)
- Missing initialization
- Incorrect function return (returning undefined)
- Deleted or moved data
- Optional field not checked
- Wrong variable reference

Fix Strategy:
1. FIRST: Fix the SOURCE of null if it's a bug
2. If null is valid, handle it explicitly at the boundary
3. Add validation where data enters the system
4. Use TypeScript/type hints to catch at compile time
5. Add default values where appropriate

❌ BAD FIX: if (user) { user.name } // Treats symptom
✅ GOOD FIX: Fix why user is null in the first place
```

### Pattern 2: Off-By-One Errors

```
Symptom: Array index out of bounds, wrong count, fence-post errors

Investigation Checklist:
□ Is the loop inclusive or exclusive?
□ Is the index 0-based or 1-based?
□ What's the exact boundary condition?
□ What about empty arrays?

Common Causes:
- Confusion between length and last index
- Mixing 0-based and 1-based indexing
- < vs <= confusion
- Forgetting to count the first or last element
- Substring end index confusion

Fix Strategy:
1. Draw out the iteration with actual numbers
2. Test with 0, 1, 2, and n elements
3. Use language features that avoid manual indexing
4. Add explicit bounds checking
5. Write tests for boundary cases

Example:
Array of 3 elements: [A, B, C]
- Length: 3
- Valid indices: 0, 1, 2
- Last index: 2 (length - 1)
- for i < length ✅
- for i <= length ❌ (will access index 3)
```

### Pattern 3: Async/Timing Bugs

```
Symptom: Sometimes works, sometimes doesn't. Race conditions.

Investigation Checklist:
□ What's the expected order of operations?
□ What's the actual order of operations?
□ What shared state is being accessed?
□ What happens if order changes?
□ Are there any await/async mismatches?

Common Causes:
- Not awaiting async operations
- Callback executed before data ready
- Multiple processes modifying same data
- Event handlers firing in unexpected order
- Stale closures capturing old state
- Missing await keywords
- Promise not returned

Fix Strategy:
1. Make execution order explicit (async/await)
2. Eliminate shared mutable state
3. Add proper synchronization (locks, semaphores)
4. Design for eventual consistency
5. Add logging to trace execution order
6. Use Promise.all for parallel operations

❌ BAD FIX: Add setTimeout/delay
✅ GOOD FIX: Properly await the async operation
```

### Pattern 4: Type Coercion Bugs

```
Symptom: Unexpected behavior with different data types

Investigation Checklist:
□ What type is expected?
□ What type is actually being passed?
□ What implicit conversions are happening?
□ Is the comparison strict or loose?

Common Causes:
- String "0" vs number 0
- "false" (string) is truthy
- null vs undefined vs "" vs 0
- Integer vs float
- Array vs object
- Truthy vs true
- JSON.parse returning unexpected type

Fix Strategy:
1. Use strict typing (TypeScript, type hints)
2. Validate and convert types at boundaries
3. Use strict equality (=== not ==)
4. Explicit type conversions
5. Don't rely on truthiness for type checking

JavaScript Gotchas:
"0" == 0    // true (coercion)
"0" === 0   // false (strict)
[] == false // true (WAT)
null == undefined // true
typeof null // "object" (WAT)
```

### Pattern 5: State Management Bugs

```
Symptom: Data inconsistencies, stale data, conflicting updates

Investigation Checklist:
□ What is the source of truth?
□ How many copies of this state exist?
□ What updates this state and when?
□ Is state being mutated or replaced?
□ Are closures capturing stale state?

Common Causes:
- Multiple sources of truth
- Stale closures capturing old state
- Mutating shared objects directly
- Missing state synchronization
- Cache invalidation issues
- Component not re-rendering
- Redux/state manager not notified

Fix Strategy:
1. Single source of truth
2. Immutable data structures
3. Explicit state management (Redux, BLoC, etc.)
4. Clear ownership of state mutations
5. Event-driven updates with proper ordering
6. Always create new objects when updating state

❌ BAD: state.user.name = newName; // Mutates directly
✅ GOOD: setState({ ...state, user: { ...state.user, name: newName }});
```

### Pattern 6: Integration Bugs

```
Symptom: Works in isolation, fails with external systems

Investigation Checklist:
□ What are the exact API contracts?
□ What does the external system actually return?
□ What are all the error cases?
□ What are the timing/timeout guarantees?
□ Is there authentication/authorization required?

Common Causes:
- API contract misunderstanding
- Missing error handling for edge cases
- Timeout not configured
- Rate limiting hit
- Authentication/authorization issues
- Data format mismatch (dates, numbers, encoding)
- API version mismatch
- CORS issues

Fix Strategy:
1. Validate against actual API documentation
2. Log all external requests and responses
3. Handle ALL possible error responses
4. Set appropriate timeouts
5. Implement retry with exponential backoff
6. Mock external systems in tests
7. Use API versioning

Checklist for API calls:
□ Timeout set?
□ All HTTP status codes handled?
□ Response structure validated?
□ Retries for transient failures?
□ Circuit breaker for persistent failures?
□ Logging for debugging?
```

### Pattern 7: Memory Leaks

```
Symptom: App slows down over time, eventually crashes

Investigation Checklist:
□ Are event listeners being removed?
□ Are subscriptions being unsubscribed?
□ Are timers being cleared?
□ Are references being held unnecessarily?
□ Is data accumulating without cleanup?

Common Causes:
- Event listeners not removed
- Subscriptions not cleaned up
- setInterval/setTimeout not cleared
- Closures holding references
- Growing arrays/maps without cleanup
- Cached data not expiring
- Circular references

Fix Strategy:
1. Always clean up in componentWillUnmount/dispose
2. Use weak references where appropriate
3. Implement cache expiration
4. Profile memory usage
5. Set up monitoring for memory growth

Pattern:
// Setup
const handler = () => { ... };
element.addEventListener('click', handler);

// Cleanup (REQUIRED!)
element.removeEventListener('click', handler);
```

### Pattern 8: Database Bugs

```
Symptom: Data corruption, lost updates, inconsistencies

Investigation Checklist:
□ Are transactions used correctly?
□ Is there a race condition on updates?
□ Are connections being properly managed?
□ Is error handling complete?
□ Are queries parameterized?

Common Causes:
- Missing transactions for multi-step operations
- Race conditions (read-modify-write)
- Connection leaks
- Deadlocks
- N+1 query problems
- Missing indexes
- SQL injection

Fix Strategy:
1. Use transactions for related operations
2. Use optimistic locking for concurrent updates
3. Always close connections (use connection pools)
4. Add appropriate indexes
5. Use parameterized queries ALWAYS
6. Monitor slow query logs
```

---

## 🌐 API TESTING

### Request Testing

```
For every API endpoint, test:

□ Happy path with valid input
□ All required parameters missing (one at a time)
□ Invalid parameter types
□ Invalid parameter values
□ Boundary values (min, max, empty)
□ Malformed JSON/XML
□ Missing Content-Type header
□ Wrong HTTP method
□ Duplicate requests (idempotency)
```

### Response Testing

```
Verify responses for:

□ Correct status codes (200, 201, 400, 401, 403, 404, 500)
□ Correct response structure
□ All fields present
□ Correct data types
□ Correct values
□ Pagination working correctly
□ Error messages are helpful but not leaky
□ Headers are correct (CORS, caching)
```

### Authentication/Authorization Testing

```
□ Unauthenticated requests are rejected
□ Invalid tokens are rejected
□ Expired tokens are rejected
□ Users can only access their own resources
□ Admin-only endpoints reject regular users
□ Rate limiting is enforced
□ Tokens cannot be reused after logout
```

---

## 📱 MOBILE/FLUTTER SPECIFIC DEBUGGING

### Flutter Common Issues

```
□ Widget not rebuilding?
  → Check if state is properly managed
  → Check if setState is called
  → Check if keys are used correctly

□ Performance issues?
  → Check for rebuilding entire lists
  → Check for expensive build methods
  → Use const constructors
  → Check image sizes

□ Memory leaks?
  → Dispose controllers
  → Cancel subscriptions
  → Cancel timers

□ Async issues?
  → Check mounted before setState
  → Handle FutureBuilder states
  → Check for race conditions
```

### Mobile Testing Checklist

```
□ Test on multiple screen sizes
□ Test in both orientations
□ Test with slow network
□ Test with no network
□ Test with low memory
□ Test with system dark mode
□ Test with accessibility features
□ Test background/foreground transitions
□ Test with low battery mode
```

---

## 🗄️ DATABASE TESTING

### Query Testing

```
□ Test with empty tables
□ Test with single row
□ Test with many rows (performance)
□ Test with null values
□ Test with unicode data
□ Test concurrent queries
□ Test transaction rollback
□ Test deadlock handling
```

### Data Integrity Testing

```
□ Foreign key constraints work
□ Unique constraints work
□ Check constraints work
□ Cascade deletes work correctly
□ Triggers fire correctly
□ No orphaned records possible
```

---

## ⚡ PERFORMANCE TESTING

### What to Measure

```
□ Response time (p50, p95, p99)
□ Throughput (requests/second)
□ Error rate under load
□ Memory usage over time
□ CPU usage under load
□ Database query times
□ External API call times
□ Resource utilization
```

### When to Performance Test

```
□ Before major releases
□ After significant changes
□ When adding new features
□ When users report slowness
□ Regularly (weekly/monthly)
```

### Performance Checklist

```
□ Set baseline metrics
□ Define acceptable thresholds
□ Test with realistic data volumes
□ Test with realistic concurrent users
□ Monitor database query performance
□ Monitor external service call times
□ Check for memory leaks
□ Check for connection leaks
```

---

## 📋 TEST TEMPLATES

### Unit Test Template

```javascript
describe("[Unit/Module Name]", () => {
  // Setup
  beforeEach(() => {
    // Reset state, create mocks
  });

  afterEach(() => {
    // Cleanup
  });

  describe("[Function Name]", () => {
    // Happy path
    it("should [expected behavior] when [condition]", () => {
      // Arrange
      const input = validInput();
      const expected = expectedOutput();

      // Act
      const result = functionUnderTest(input);

      // Assert
      expect(result).toEqual(expected);
    });

    // Edge cases
    it("should handle empty input", () => {
      expect(functionUnderTest([])).toEqual([]);
    });

    it("should handle null input", () => {
      expect(() => functionUnderTest(null)).toThrow(ValidationError);
    });

    it("should handle maximum valid input", () => {});
    it("should handle minimum valid input", () => {});

    // Error cases
    it("should throw [Error] when [invalid condition]", () => {
      expect(() => functionUnderTest(invalidInput)).toThrow(ExpectedError);
    });

    it("should return [fallback] when [failure condition]", () => {});
  });
});
```

### Integration Test Template

```javascript
describe("[Feature/Integration Name]", () => {
  beforeAll(async () => {
    // Set up test environment
    // Initialize database
    // Start services
  });

  afterAll(async () => {
    // Clean up
    // Close connections
    // Stop services
  });

  beforeEach(async () => {
    // Reset state for each test
    // Clear database tables
    // Reset mocks
  });

  it("should complete [workflow] successfully", async () => {
    // Arrange
    const setupData = await createTestData();

    // Act
    const result = await performWorkflow(setupData);

    // Assert
    expect(result.status).toBe("success");
    expect(await verifyDatabaseState()).toBe(true);
  });

  it("should handle [external system] failure gracefully", async () => {
    // Arrange
    mockExternalService.mockRejectedValue(new Error("Service unavailable"));

    // Act
    const result = await performWorkflow(input);

    // Assert
    expect(result.status).toBe("failed");
    expect(result.error).toContain("Service unavailable");
  });
});
```

### API Test Template

```javascript
describe("API: [Endpoint Name]", () => {
  describe("POST /api/resource", () => {
    it("should create resource with valid input", async () => {
      const response = await request(app)
        .post("/api/resource")
        .set("Authorization", `Bearer ${validToken}`)
        .send(validPayload);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject(expectedShape);
    });

    it("should return 400 for invalid input", async () => {
      const response = await request(app)
        .post("/api/resource")
        .set("Authorization", `Bearer ${validToken}`)
        .send(invalidPayload);

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it("should return 401 without authentication", async () => {
      const response = await request(app)
        .post("/api/resource")
        .send(validPayload);

      expect(response.status).toBe(401);
    });

    it("should return 403 without authorization", async () => {
      const response = await request(app)
        .post("/api/resource")
        .set("Authorization", `Bearer ${unauthorizedToken}`)
        .send(validPayload);

      expect(response.status).toBe(403);
    });
  });
});
```

### Bug Fix Test Template

```javascript
describe("Bug Fix: [Bug ID/Description]", () => {
  it("should not [exhibit buggy behavior] - regression test", () => {
    // Reproduce the EXACT scenario that caused the bug
    const bugTriggerInput = {
      /* exact input that caused bug */
    };

    // This should NOT throw/fail anymore
    const result = functionThatHadBug(bugTriggerInput);

    // Verify correct behavior
    expect(result).toEqual(expectedCorrectOutput);
  });

  it("should [correct behavior] with [edge case that caused bug]", () => {
    // Test the specific edge case
  });

  it("should handle similar scenarios: [variant 1]", () => {
    // Test variations that might have the same root cause
  });

  it("should handle similar scenarios: [variant 2]", () => {
    // Another variation
  });
});
```

---

## 🚨 DEBUGGING RED FLAGS

### Stop and Reassess When:

```
□ You've tried more than 3 different fixes
  → You don't understand the root cause yet
  → Go back to Phase 2: ANALYZE & UNDERSTAND

□ The fix keeps getting more complex
  → You might be treating symptoms, not the cause
  → Step back and re-analyze

□ You're adding defensive code everywhere
  → Find and fix the SOURCE of bad data
  → Don't bandage bad architecture

□ "It works on my machine"
  → Environmental difference IS the clue
  → Compare environments systematically

□ The bug is "random" or "intermittent"
  → There's a timing/state issue you haven't identified
  → Add logging to capture the pattern

□ You can't explain why your fix works
  → You don't understand the bug; it might resurface
  → Don't commit until you can explain it

□ You're afraid to touch the code around the bug
  → The code needs refactoring, not patching
  → Consider a larger cleanup

□ Your fix requires a comment explaining why it's weird
  → Find a cleaner solution
```

### Signs of a Bad Fix

```
❌ Adding a try-catch that silently swallows errors
❌ Adding null checks without understanding why null
❌ Adding delays/sleeps to "fix" timing issues
❌ Copying code instead of fixing the original
❌ Adding flags to skip problematic code paths
❌ The fix only works for the specific failing case
❌ The fix requires explaining why it's "weird but works"
❌ The fix is longer than the original code
❌ The fix introduces new warnings
❌ The fix requires disabling a linting rule
```

### Signs of a Good Fix

```
✅ You can explain the root cause in one sentence
✅ The fix makes the code simpler or clearer
✅ Similar bugs are also prevented
✅ The fix would have been caught by better testing
✅ You've added tests to prevent regression
✅ The code is better than before the bug
✅ Anyone reviewing the fix would understand it
✅ The fix is minimal and focused
✅ No new warnings introduced
✅ Type checker is happy
```

---

## 📊 QUALITY METRICS

### Track These Metrics

```
Bug Metrics:
- Time from bug report to root cause identified
- Time from root cause to complete fix
- Number of fix attempts before success (target: 1)
- Number of bugs that recur (regression rate, target: 0)
- Bugs found in production vs testing vs development
- Bugs by category (use LEARNINGS.md categories)

Test Metrics:
- Test coverage percentage
- Test execution time
- Flaky test rate (target: 0%)
- Time since last test suite failure
- Number of bugs caught by tests vs production
- Test-to-code ratio

Development Metrics:
- First-attempt success rate (target: 90%+)
- Average debugging time
- Tokens used per bug fix (for AI-assisted)
- Code review issues caught
```

### Goals

```
- 90%+ bugs fixed on first attempt
- Zero recurring bugs (same root cause)
- Test coverage > 80% on business logic
- Zero production bugs that had passing tests
- Every bug results in a new test
- Every bug results in a LEARNINGS.md entry
- Decreasing average fix time over time
```

---

## 🎓 DEBUGGING MASTERY CHECKLIST

### Level 1: Beginner

```
□ Can read and understand error messages
□ Can use console.log/print for debugging
□ Can write basic unit tests
□ Can find and fix simple syntax errors
□ Can Google error messages effectively
□ Can reproduce bugs reliably
```

### Level 2: Intermediate

```
□ Can use a debugger with breakpoints
□ Can trace through complex call stacks
□ Can write comprehensive test suites
□ Can identify and fix race conditions
□ Can debug across service boundaries
□ Can use binary search debugging
□ Updates LEARNINGS.md for every bug
□ Can explain bugs to others clearly
```

### Level 3: Advanced

```
□ Can debug from incomplete information
□ Can find bugs from user descriptions alone
□ Can predict where bugs are likely to occur
□ Can design systems that are easy to debug
□ Can identify systemic issues from bug patterns
□ Fixes bugs such that they never recur
□ Can debug production issues safely
□ Can perform effective post-mortems
```

### Level 4: Expert

```
□ Can debug production issues in real-time
□ Can perform post-mortems that prevent future bugs
□ Can design observability into systems
□ Can mentor others on debugging techniques
□ Has personal debugging frameworks and checklists
□ Contributes to team debugging knowledge base
□ Can identify and fix architectural issues
□ Can improve the debugging process itself
```

---

## 📌 FINAL REMINDERS

```
┌─────────────────────────────────────────────────────────────────┐
│  THE DEBUGGING OATH                                             │
│                                                                 │
│  I will UNDERSTAND the bug before I fix it.                    │
│  I will fix the ROOT CAUSE, not the symptom.                   │
│  I will fix it ONCE, correctly, completely.                    │
│  I will add TESTS to prevent regression.                       │
│  I will DOCUMENT what I learned in LEARNINGS.md.               │
│  I will leave the code BETTER than I found it.                 │
│                                                                 │
│  I will NEVER:                                                  │
│  - Apply a fix I can't explain                                 │
│  - Silence an error without understanding it                   │
│  - Ship a fix without testing it                               │
│  - Fix the same bug twice                                       │
│  - Skip updating LEARNINGS.md                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Quick Reference: When Bugs Occur

```
1. STOP   → Don't touch code yet
2. READ   → Full error message + stack trace
3. CHECK  → LEARNINGS.md for similar issues
4. TRACE  → Find exact line of failure
5. WHY?   → 5 Whys to root cause
6. PLAN   → Design complete fix
7. FIX    → Root cause + all instances
8. TEST   → Verify fix + no regression
9. LEARN  → Update LEARNINGS.md
```

---

> **"Debugging is twice as hard as writing the code in the first place. Therefore, if you write the code as cleverly as possible, you are, by definition, not smart enough to debug it."** — Brian Kernighan

> **"The most effective debugging tool is still careful thought, coupled with judiciously placed print statements."** — Brian Kernighan

> **"If debugging is the process of removing bugs, then programming must be the process of putting them in."** — Edsger W. Dijkstra

**The best debuggers are those who write code that rarely needs debugging.**

**Every bug is a gift—an opportunity to improve the code, the tests, and yourself.**
