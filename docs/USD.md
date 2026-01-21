# Universal Development Standards & Learning System

> **Core Philosophy**: Every line of code should be production-ready on first write. Learn once, never repeat mistakes. Quality over speed, but achieve both through discipline.

---

## 📚 RELATED DOCUMENTS

```
/CLAUDE.md      ← You are here (Development Standards)
/TESTING.md     → Debugging Protocol & Testing Standards
/LEARNINGS.md   → Accumulated Lessons & Mistake Log
```

**Cross-Reference Rules:**

- Before coding → Read CLAUDE.md + check LEARNINGS.md
- When bugs occur → Follow TESTING.md protocol
- After any issue → Update LEARNINGS.md

---

## 🧠 LEARNING SYSTEM

### Mandatory Learning Protocol

**Before ANY coding task:**

1. Read `/LEARNINGS.md` for relevant past mistakes and patterns
2. Search for keywords related to current task
3. Apply all relevant lessons proactively
4. Check if similar code exists in codebase (don't reinvent)

**After ANY error, bug, or discovery:**

1. Immediately append to `/LEARNINGS.md` using this format:

```markdown
### [YYYY-MM-DD] Category: Brief Title

**Context**: What were you trying to do?
**Mistake/Discovery**: What went wrong or what did you learn?
**Root Cause**: Why did this happen?
**Solution**: How to fix/avoid this?
**Prevention Rule**: One-line rule to never repeat this
**Code Example**: (if applicable)
❌ Wrong: [bad code]
✅ Correct: [good code]

---
```

2. Categories to use:
   - `SYNTAX` - Language-specific syntax issues
   - `LOGIC` - Algorithm or logic errors
   - `API` - External service integration issues
   - `ASYNC` - Concurrency, promises, async/await issues
   - `DATA` - Data handling, validation, transformation
   - `SECURITY` - Security vulnerabilities or best practices
   - `PERFORMANCE` - Optimization discoveries
   - `ARCHITECTURE` - Design pattern insights
   - `TOOLING` - Build tools, dependencies, environment
   - `UX` - User experience considerations
   - `CONFIG` - Configuration and environment issues
   - `GIT` - Version control issues
   - `DATABASE` - Database queries and operations
   - `TESTING` - Testing-related discoveries

### Learning File Structure

Maintain `/LEARNINGS.md` with these sections:

```markdown
# Development Learnings Log

## Critical Rules (Never Violate)

<!-- High-impact lessons that caused significant issues -->

## Error Patterns by Category

### [Each category listed above]

## Technology-Specific Lessons

### Python / JavaScript / Flutter / SQL / etc.

## Project-Specific Lessons

<!-- Lessons unique to this codebase -->
```

---

## 💰 TOKEN & COST EFFICIENCY (AI-Assisted Development)

### Minimize Iterations

```
Every fix attempt costs tokens. Maximize success rate:

□ Read error messages COMPLETELY before responding
□ Understand the FULL context before suggesting fixes
□ Check LEARNINGS.md FIRST to avoid known mistakes
□ Plan the COMPLETE solution before writing any code
□ Write production-ready code on FIRST attempt
□ Don't guess—investigate and confirm
```

### Efficient Debugging

```
Instead of:
  Try fix 1 → fail → try fix 2 → fail → try fix 3

Do this:
  Analyze → Understand root cause → Apply correct fix once
```

### Code Generation Efficiency

```
□ Generate complete, working code—not partial snippets
□ Include all imports, error handling, and edge cases
□ Don't generate code that needs obvious fixes
□ Anticipate follow-up requirements
□ Write self-documenting code to reduce explanation needs
```

---

## 📋 PRE-FLIGHT CHECKLIST

### Before Writing ANY Code

```
□ Understood the requirement completely (ask if unclear)
□ Checked /LEARNINGS.md for relevant past issues
□ Identified edge cases and error scenarios
□ Planned the approach (pseudocode/outline in comments)
□ Know the input types, ranges, and possible invalid states
□ Know the expected output format and error responses
□ Identified external dependencies and their failure modes
□ Checked if similar code exists (reuse, don't reinvent)
□ Considered security implications
□ Considered performance implications
```

### Before Saving/Committing ANY Code

```
□ All error cases handled explicitly
□ Input validation present for all external inputs
□ No hardcoded secrets, paths, or environment-specific values
□ Meaningful variable and function names
□ Complex logic has explanatory comments
□ No code duplication (DRY principle applied)
□ Resource cleanup handled (files, connections, subscriptions)
□ Logging present for debugging production issues
□ Mental walkthrough of all execution paths completed
□ Types/interfaces defined for all data structures
□ No console.log/print statements left (except intentional logging)
□ No TODO/FIXME without ticket reference
```

---

## 🏗️ PRODUCTION-FIRST CODING STANDARDS

### The Golden Rules

1. **Write code as if there is no debugging phase**
2. **Every edge case WILL be hit by real users**
3. **Assume all external inputs are malicious or malformed**
4. **Assume all external services will fail**
5. **Future you (or someone else) will read this code confused**
6. **The first version should be the production version**

### Universal Patterns (All Languages)

#### Error Handling

```
✅ DO:
- Catch specific exceptions, not generic ones
- Provide meaningful error messages with context
- Log errors with stack traces and relevant state
- Fail fast and explicitly, not silently
- Return structured error responses
- Include correlation IDs for tracing
- Distinguish between recoverable and fatal errors

❌ DON'T:
- Swallow exceptions silently
- Use empty catch blocks
- Show raw error messages to users
- Assume operations will succeed
- Ignore return values that indicate errors
- Log sensitive data in error messages
- Catch exceptions you can't handle properly
```

#### Input Validation

```
✅ DO:
- Validate at system boundaries (API endpoints, file reads, user input)
- Check type, format, range, and length
- Sanitize strings for injection attacks
- Use allowlists over denylists
- Validate early, fail fast
- Return specific validation error messages
- Validate both presence and format

❌ DON'T:
- Trust any external input
- Validate only on the client side
- Assume data format from database is correct
- Skip validation for "internal" APIs
- Use regex for complex validation without testing
- Assume numeric strings are actually numbers
```

#### Null/Undefined Safety

```
✅ DO:
- Check for null/undefined before accessing properties
- Use optional chaining (?.) and nullish coalescing (??)
- Provide sensible defaults
- Make null states explicit in types
- Document when null is a valid value
- Use guard clauses for early returns

❌ DON'T:
- Assume objects are always populated
- Access nested properties without checks
- Use truthiness checks when 0 or "" are valid values
- Confuse null, undefined, and empty string
- Chain multiple property accesses without checks
```

#### Async Operations

```
✅ DO:
- Always handle both success and failure paths
- Set appropriate timeouts
- Implement retry logic with exponential backoff for transient failures
- Cancel pending operations when no longer needed
- Handle race conditions explicitly
- Use Promise.all for parallel operations (with error handling)
- Track in-flight requests to prevent duplicates

❌ DON'T:
- Fire and forget async operations
- Ignore promise rejections
- Create unbounded parallel operations
- Mix callbacks and promises inconsistently
- Nest promises unnecessarily
- Forget to handle the loading state
```

#### Data Handling

```
✅ DO:
- Parse and validate data at boundaries
- Use strong typing throughout
- Transform data into internal formats early
- Keep data transformations pure (no side effects)
- Handle encoding explicitly (UTF-8)
- Clone objects before mutating
- Use immutable patterns where possible

❌ DON'T:
- Pass raw external data through the system
- Mutate shared data structures
- Assume date/time formats or timezones
- Ignore locale-specific formatting
- Mix data transformation with side effects
- Trust array indices from external sources
```

### Code Quality Standards

#### Naming Conventions

```
- Variables: Describe what it holds, not how it's used
  ❌ temp, data, result, item, info, val
  ✅ userEmail, pendingOrders, validationErrors, customerName

- Functions: Describe what it does with a verb
  ❌ process(), handle(), do(), manage()
  ✅ validateUserInput(), sendWelcomeEmail(), calculateTotalPrice()

- Booleans: Use is/has/should/can/will prefixes
  ❌ active, visible, permission, loading
  ✅ isActive, hasPermission, shouldRetry, canEdit, isLoading

- Constants: SCREAMING_SNAKE_CASE with clear meaning
  ❌ MAX, LIMIT, DEFAULT, NUM
  ✅ MAX_RETRY_ATTEMPTS, API_TIMEOUT_MS, DEFAULT_PAGE_SIZE

- Files: Match the main export, use consistent casing
  ❌ utils.js, helpers.js, stuff.js
  ✅ userValidation.js, emailService.js, orderCalculator.js
```

#### Function Design

```
- Single Responsibility: One function = one task
- Max 20-30 lines per function (usually)
- Max 3-4 parameters (use objects for more)
- Pure functions preferred (same input = same output)
- Side effects should be explicit and documented
- Early returns for guard clauses
- No nested ternaries
- Avoid boolean parameters (use enums or objects)
- Functions should do what their name says, nothing more
```

#### Comments Philosophy

```
✅ Comment:
- WHY something is done (business logic, workarounds)
- Complex algorithms with brief explanation
- Non-obvious edge cases being handled
- TODOs with ticket/issue references
- Public API documentation
- Workarounds with links to issues
- Performance considerations

❌ Don't Comment:
- WHAT the code does (code should be self-explanatory)
- Obvious operations
- Commented-out code (delete it, use version control)
- Version history (that's what git is for)
- Author names (use git blame)
```

---

## 🔌 API & INTEGRATION STANDARDS

### External API Calls

```
✅ DO:
- Wrap all external calls in try-catch
- Set explicit timeouts (never use defaults)
- Implement retry logic with exponential backoff
- Log request/response for debugging (not sensitive data)
- Validate response structure before using
- Handle all HTTP status codes explicitly
- Use circuit breaker pattern for failing services
- Cache responses where appropriate

❌ DON'T:
- Trust API responses blindly
- Assume APIs are always available
- Hardcode API URLs (use config)
- Ignore rate limits
- Log full request/response bodies (may contain secrets)
- Retry non-idempotent operations without thought
```

### API Response Handling Pattern

```javascript
// Standard pattern for ALL external API calls
async function callExternalAPI(params) {
  const startTime = Date.now();
  const correlationId = generateCorrelationId();

  try {
    log.debug("API_REQUEST", {
      correlationId,
      endpoint,
      params: sanitize(params),
    });

    const response = await fetchWithTimeout(url, {
      ...options,
      timeout: API_TIMEOUT_MS,
      headers: { ...headers, "X-Correlation-ID": correlationId },
    });

    if (!response.ok) {
      throw new APIError(response.status, await response.text(), correlationId);
    }

    const data = await response.json();

    // VALIDATE RESPONSE STRUCTURE
    if (!isValidResponseStructure(data)) {
      throw new APIError(
        "INVALID_RESPONSE",
        "Unexpected response structure",
        correlationId,
      );
    }

    log.debug("API_RESPONSE", {
      correlationId,
      status: response.status,
      duration: Date.now() - startTime,
    });

    return data;
  } catch (error) {
    log.error("API_ERROR", {
      correlationId,
      error: error.message,
      duration: Date.now() - startTime,
    });

    if (isRetryable(error)) {
      return retryWithBackoff(() => callExternalAPI(params));
    }

    throw error;
  }
}
```

### Webhook/Callback Handling

```
✅ DO:
- Validate webhook signatures
- Return 200 immediately, process async
- Implement idempotency (handle duplicate deliveries)
- Log all incoming webhooks
- Handle out-of-order delivery
- Set up dead letter queues for failures

❌ DON'T:
- Do long processing in webhook handler
- Trust webhook payload without validation
- Assume webhooks arrive in order
- Assume webhooks are delivered exactly once
```

---

## 🔒 SECURITY CHECKLIST

```
□ No secrets in code (use environment variables)
□ Secrets not logged (even in debug mode)
□ SQL queries parameterized (never string concatenation)
□ User input sanitized before use
□ Authentication checked on all protected endpoints
□ Authorization verified for resource access (not just authentication)
□ Sensitive data encrypted at rest and in transit
□ Rate limiting on public endpoints
□ CORS configured correctly (not *)
□ Dependencies checked for known vulnerabilities
□ Error messages don't leak system information
□ Passwords hashed with strong algorithm (bcrypt, argon2)
□ JWT tokens have appropriate expiration
□ File uploads validated (type, size, content)
□ No sensitive data in URLs (use POST body)
□ HTTP security headers set (CSP, X-Frame-Options, etc.)
□ Input length limits enforced
□ No eval() or dynamic code execution with user input
```

---

## 🚀 PERFORMANCE PRINCIPLES

```
□ Database queries optimized (indexes, no N+1)
□ Pagination for large data sets
□ Caching strategy defined for repeated operations
□ Cache invalidation strategy defined
□ Lazy loading for expensive resources
□ Batch operations preferred over loops
□ Memory usage considered for large data
□ Network calls minimized and parallelized where possible
□ No blocking operations on main/UI thread
□ Database connections pooled
□ Large file processing streamed (not loaded into memory)
□ Images/assets optimized and lazy-loaded
□ API responses paginated
□ Background jobs for long-running operations
□ Appropriate indexes on frequently queried columns
```

---

## 🗄️ DATABASE BEST PRACTICES

### Query Standards

```
✅ DO:
- Use parameterized queries ALWAYS
- Select only needed columns (not SELECT *)
- Use appropriate indexes
- Use transactions for multi-step operations
- Set query timeouts
- Use connection pooling
- Handle connection failures gracefully
- Use LIMIT for all queries

❌ DON'T:
- Build queries with string concatenation
- Trust user input in queries
- Leave connections open
- Run unbounded queries
- Ignore slow query logs
- Use ORM without understanding generated SQL
```

### Transaction Pattern

```
✅ Correct transaction handling:

BEGIN TRANSACTION
try {
  step1()
  step2()
  step3()
  COMMIT
} catch (error) {
  ROLLBACK
  throw error
}

- Keep transactions short
- Don't do external API calls inside transactions
- Handle deadlocks with retry
```

---

## 📁 FILE & PROJECT STRUCTURE

### Standard Files to Maintain

```
/CLAUDE.md          - This file (development standards)
/TESTING.md         - Testing and debugging standards
/LEARNINGS.md       - Accumulated lessons and mistakes
/README.md          - Project overview and setup
/.env.example       - Template for environment variables
/.gitignore         - Git ignore patterns
/docs/              - Additional documentation
  /architecture.md  - System design decisions
  /api.md           - API documentation
  /deployment.md    - Deployment procedures
```

### Code Organization Principles

```
- Group by feature/domain, not by type
- Keep related code close together
- Separate business logic from infrastructure
- Isolate external dependencies behind interfaces
- Configuration separate from code
- One responsibility per file
- Index files for clean exports
- Consistent naming across the project
```

### Environment Configuration

```
✅ DO:
- Use .env files for local development
- Use .env.example as template (no real secrets)
- Different configs for dev/staging/prod
- Validate all required env vars at startup
- Use typed configuration objects

❌ DON'T:
- Commit .env files to git
- Have different code paths per environment
- Access process.env throughout codebase (centralize)
- Use defaults for critical config in production
```

---

## 🔄 WORKFLOW PROTOCOL

### For Every Task

```
1. UNDERSTAND
   - Read the full requirement
   - Identify ambiguities and ask questions
   - Define acceptance criteria
   - Identify dependencies and blockers

2. RESEARCH
   - Check /LEARNINGS.md for relevant lessons
   - Check if similar code exists in codebase
   - Research best practices if unfamiliar territory
   - Identify potential pitfalls

3. PLAN
   - Write pseudocode or outline as comments
   - Identify components/functions needed
   - Consider edge cases and error scenarios
   - Plan the testing approach

4. IMPLEMENT
   - Follow the plan systematically
   - Write production-ready code immediately
   - Handle errors as you go, not as an afterthought
   - Add logging for observability
   - Write tests alongside code

5. VERIFY (Mental)
   - Walk through happy path
   - Walk through each error path
   - Consider boundary conditions
   - Verify resource cleanup
   - Check against original requirements

6. DOCUMENT
   - Update relevant documentation
   - Add inline comments for complex logic
   - Update /LEARNINGS.md if anything was discovered
   - Write clear commit messages
```

### When Errors Occur

→ **STOP: Follow /TESTING.md debugging protocol**

```
1. STOP - Don't immediately try random fixes
2. UNDERSTAND - Read the error message completely
3. INVESTIGATE - Trace the execution path
4. IDENTIFY - Find the root cause, not just symptoms
5. FIX - Address the root cause
6. LEARN - Document in /LEARNINGS.md
7. PREVENT - Consider if similar issues exist elsewhere
```

---

## 🔀 GIT & VERSION CONTROL

### Commit Standards

```
✅ Good commits:
- Single logical change per commit
- Clear, descriptive message
- Reference issue/ticket number
- Pass all tests

Commit message format:
[type]: Brief description (max 50 chars)

Longer description if needed (wrap at 72 chars)
Explain WHY, not WHAT.

Fixes #123

Types: feat, fix, docs, style, refactor, test, chore
```

### Branch Strategy

```
- main/master: Production-ready code only
- develop: Integration branch
- feature/xxx: New features
- fix/xxx: Bug fixes
- hotfix/xxx: Urgent production fixes

Always:
□ Pull latest before starting work
□ Keep branches short-lived
□ Rebase on parent branch before merging
□ Delete branches after merging
```

### Pre-Commit Checklist

```
□ All tests pass
□ No linting errors
□ No console.log/print statements (unless intentional)
□ No hardcoded values
□ No sensitive data
□ Commit message is clear
□ Changes are reviewed
```

---

## 👀 CODE REVIEW CHECKLIST

### When Reviewing Code

```
Functionality:
□ Does the code do what it's supposed to do?
□ Are all requirements addressed?
□ Are edge cases handled?

Quality:
□ Is the code readable and maintainable?
□ Is there code duplication?
□ Are names meaningful?
□ Is complexity appropriate?

Reliability:
□ Is error handling complete?
□ Are resources properly managed?
□ Are there potential race conditions?
□ Are failures handled gracefully?

Security:
□ Is input validated?
□ Are there injection vulnerabilities?
□ Are secrets protected?
□ Is authorization checked?

Performance:
□ Are there obvious performance issues?
□ Are database queries efficient?
□ Is caching appropriate?
□ Are there memory leaks?

Testing:
□ Are there adequate tests?
□ Are edge cases tested?
□ Do tests actually verify behavior?
```

---

## 📝 LANGUAGE-SPECIFIC QUICK REFERENCES

### Python

```python
# Always
- Use type hints: def process(data: dict[str, Any]) -> Result:
- Use pathlib for file paths, not string concatenation
- Context managers for resources: with open() as f:
- f-strings for formatting: f"User {name} created"
- List/dict comprehensions over map/filter when readable
- Use dataclasses or Pydantic for data structures
- Use logging module, not print()
- Use virtual environments

# Never
- Mutable default arguments: def fn(items=[])  # BUG!
- Bare except: except:  # Always specify exception type
- String concatenation for SQL: f"SELECT * WHERE id={id}"
- Import * (explicit imports only)
- Global variables for state
```

### JavaScript/TypeScript

```typescript
// Always
- Use TypeScript with strict mode
- Prefer const over let, never var
- Use async/await over raw promises
- Destructure with defaults: const { name = 'Unknown' } = user
- Use optional chaining: user?.address?.city
- Define interfaces for all data structures
- Use ESLint and Prettier
- Handle all promise rejections

// Never
- Use == for comparison (use ===)
- Modify function parameters directly
- Use any type without explicit reason and TODO
- Ignore promise rejections
- Use eval() or new Function()
- Trust typeof for null (typeof null === 'object')
```

### Node.js Specific

```javascript
// Always
- Use async/await for file operations
- Handle process signals (SIGTERM, SIGINT)
- Use environment variables for config
- Implement graceful shutdown
- Use streaming for large files
- Set timeouts on all network operations
- Use connection pooling for databases

// Never
- Block the event loop
- Use synchronous file operations in request handlers
- Store sensitive data in memory long-term
- Ignore unhandled promise rejections
- Use deprecated APIs
```

### React/Frontend

```jsx
// Always
- Use functional components with hooks
- Memoize expensive computations (useMemo, useCallback)
- Handle loading, error, and empty states
- Use TypeScript for props
- Clean up effects (return cleanup function)
- Use controlled components for forms
- Handle form validation properly

// Never
- Mutate state directly
- Use index as key for dynamic lists
- Call setState in render
- Ignore useEffect dependencies
- Store derived state
- Make API calls without cleanup handling
```

### Flutter/Dart

```dart
// Always
- Use null safety: String? nullable, String required
- Const constructors for immutable widgets
- Dispose controllers and subscriptions
- Use named parameters for clarity
- Separate business logic from UI (BLoC, Provider, etc.)
- Use const wherever possible for widgets
- Handle all Future errors

// Never
- setState in build method
- Infinite widgets in scrollable without keys
- Network calls in build method
- Ignore widget lifecycle
- Store BuildContext in state
- Use GlobalKey unnecessarily
```

### SQL

```sql
-- Always
- Use parameterized queries
- Index columns used in WHERE, JOIN, ORDER BY
- Limit result sets
- Use transactions for multi-step operations
- Explicit column names (not SELECT *)
- Use EXISTS instead of COUNT for existence checks
- Analyze query plans for complex queries

-- Never
- String concatenation for query building
- Trust user input in queries
- Unbounded queries without LIMIT
- Ignore execution plans for slow queries
- Use SELECT * in production code
- Delete/update without WHERE clause
```

---

## ⚡ QUICK DECISION GUIDES

### When to Create a New Function

```
- Code block is used more than once → EXTRACT
- Code block is more than 10-15 lines → CONSIDER EXTRACTING
- Code block has a single clear purpose → EXTRACT & NAME IT
- Code block requires a comment to explain → EXTRACT (name becomes documentation)
- Code block can be tested independently → EXTRACT
```

### When to Add Error Handling

```
- External API call → ALWAYS
- File system operation → ALWAYS
- Database operation → ALWAYS
- User input processing → ALWAYS
- Type casting/parsing → ALWAYS
- Division operation → CHECK FOR ZERO
- Array/object access → CHECK BOUNDS/EXISTENCE
- JSON parsing → ALWAYS
- Any operation that can throw → ALWAYS
```

### When to Add Logging

```
- Application startup/shutdown → INFO
- External service calls → DEBUG (request), INFO (response status)
- Errors and exceptions → ERROR (with stack trace)
- Business-critical operations → INFO
- Security events → WARN or ERROR
- Performance-sensitive operations → DEBUG (with timing)
- State changes → DEBUG
- Configuration loaded → INFO
```

### When to Add Caching

```
- Data rarely changes but is frequently read → CACHE
- External API calls that are expensive → CACHE with TTL
- Computed values that are expensive → MEMOIZE
- User session data → CACHE
- Never cache sensitive data without encryption
- Always have cache invalidation strategy
```

---

## 🎯 DEFINITION OF DONE

Code is complete when:

```
□ Functionality works for all specified requirements
□ All error cases handled gracefully
□ Input validation in place
□ Unit tests written (if project uses tests)
□ No linting errors or warnings
□ No security vulnerabilities
□ Documentation updated
□ /LEARNINGS.md updated (if anything was learned)
□ Code reviewed mentally with fresh eyes
□ Commit messages are clear and reference issues
□ Ready for production deployment
□ Logging in place for observability
□ Performance is acceptable
□ No TODO/FIXME without ticket reference
```

---

## 📌 REMEMBER

> "The best time to fix a bug is before you write it. The best code is code that handles everything the first time. Every mistake is a lesson—but only if you record it and apply it."

> "Write code as if the person who will maintain it is a violent psychopath who knows where you live."

> "The cost of fixing a bug increases by 10x at each stage: design → development → testing → production."

**Your code represents your craftsmanship. Make every line count.**

---

## 🆘 QUICK REFERENCE

### Error? → Follow TESTING.md protocol, then update LEARNINGS.md

### Starting new task? → Read LEARNINGS.md first

### Unsure about approach? → Check if similar code exists, research best practices

### Code complete? → Run through Definition of Done checklist
