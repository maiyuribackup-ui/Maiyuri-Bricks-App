# CLAUDE.md - Universal Development Standards & Learning System

> **Core Philosophy**: Every line of code should be production-ready on first write. Learn once, never repeat mistakes. Quality over speed, but achieve both through discipline.

---

## 🧠 LEARNING SYSTEM

### Mandatory Learning Protocol

**Before ANY coding task:**

1. Read `/LEARNINGS.md` for relevant past mistakes and patterns
2. Search for keywords related to current task
3. Apply all relevant lessons proactively

**After ANY error, bug, or discovery:**

1. Immediately append to `/LEARNINGS.md` using this format:

```markdown
### [YYYY-MM-DD] Category: Brief Title

**Context**: What were you trying to do?
**Mistake/Discovery**: What went wrong or what did you learn?
**Root Cause**: Why did this happen?
**Solution**: How to fix/avoid this?
**Prevention Rule**: One-line rule to never repeat this

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

### Learning File Structure

Maintain `/LEARNINGS.md` with these sections:

```markdown
# Development Learnings Log

## Critical Rules (Never Violate)

<!-- High-impact lessons that caused significant issues -->

## Error Patterns by Category

### SYNTAX

### LOGIC

### API

### ASYNC

### DATA

### SECURITY

### PERFORMANCE

### ARCHITECTURE

### TOOLING

### UX

## Technology-Specific Lessons

### Python

### JavaScript/TypeScript

### Flutter/Dart

### SQL

### [Add as needed]

## Project-Specific Lessons

<!-- Lessons unique to this codebase -->
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
```

---

## 🏗️ PRODUCTION-FIRST CODING STANDARDS

### The Golden Rules

1. **Write code as if there is no debugging phase**
2. **Every edge case WILL be hit by real users**
3. **Assume all external inputs are malicious or malformed**
4. **Assume all external services will fail**
5. **Future you (or someone else) will read this code confused**

### Universal Patterns (All Languages)

#### Error Handling

```
✅ DO:
- Catch specific exceptions, not generic ones
- Provide meaningful error messages with context
- Log errors with stack traces and relevant state
- Fail fast and explicitly, not silently
- Return structured error responses

❌ DON'T:
- Swallow exceptions silently
- Use empty catch blocks
- Show raw error messages to users
- Assume operations will succeed
- Ignore return values that indicate errors
```

#### Input Validation

```
✅ DO:
- Validate at system boundaries (API endpoints, file reads, user input)
- Check type, format, range, and length
- Sanitize strings for injection attacks
- Use allowlists over denylists
- Validate early, fail fast

❌ DON'T:
- Trust any external input
- Validate only on the client side
- Assume data format from database is correct
- Skip validation for "internal" APIs
```

#### Null/Undefined Safety

```
✅ DO:
- Check for null/undefined before accessing properties
- Use optional chaining (?.) and nullish coalescing (??)
- Provide sensible defaults
- Make null states explicit in types
- Document when null is a valid value

❌ DON'T:
- Assume objects are always populated
- Access nested properties without checks
- Use truthiness checks when 0 or "" are valid values
```

#### Async Operations

```
✅ DO:
- Always handle both success and failure paths
- Set appropriate timeouts
- Implement retry logic with exponential backoff for transient failures
- Cancel pending operations when no longer needed
- Handle race conditions explicitly

❌ DON'T:
- Fire and forget async operations
- Ignore promise rejections
- Create unbounded parallel operations
- Mix callbacks and promises inconsistently
```

#### Data Handling

```
✅ DO:
- Parse and validate data at boundaries
- Use strong typing throughout
- Transform data into internal formats early
- Keep data transformations pure (no side effects)
- Handle encoding explicitly (UTF-8)

❌ DON'T:
- Pass raw external data through the system
- Mutate shared data structures
- Assume date/time formats or timezones
- Ignore locale-specific formatting
```

### Code Quality Standards

#### Naming Conventions

```
- Variables: Describe what it holds, not how it's used
  ❌ temp, data, result, item
  ✅ userEmail, pendingOrders, validationErrors

- Functions: Describe what it does with a verb
  ❌ process(), handle(), do()
  ✅ validateUserInput(), sendWelcomeEmail(), calculateTotalPrice()

- Booleans: Use is/has/should/can prefixes
  ❌ active, visible, permission
  ✅ isActive, hasPermission, shouldRetry, canEdit

- Constants: SCREAMING_SNAKE_CASE with clear meaning
  ❌ MAX, LIMIT, DEFAULT
  ✅ MAX_RETRY_ATTEMPTS, API_TIMEOUT_MS, DEFAULT_PAGE_SIZE
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
```

#### Comments Philosophy

```
✅ Comment:
- WHY something is done (business logic, workarounds)
- Complex algorithms with brief explanation
- Non-obvious edge cases being handled
- TODOs with ticket/issue references
- Public API documentation

❌ Don't Comment:
- WHAT the code does (code should be self-explanatory)
- Obvious operations
- Commented-out code (delete it, use version control)
```

---

## 🔒 SECURITY CHECKLIST

```
□ No secrets in code (use environment variables)
□ SQL queries parameterized (never string concatenation)
□ User input sanitized before use
□ Authentication checked on all protected endpoints
□ Authorization verified for resource access
□ Sensitive data encrypted at rest and in transit
□ Rate limiting on public endpoints
□ CORS configured correctly
□ Dependencies checked for known vulnerabilities
□ Error messages don't leak system information
```

---

## 🚀 PERFORMANCE PRINCIPLES

```
□ Database queries optimized (indexes, no N+1)
□ Pagination for large data sets
□ Caching strategy defined for repeated operations
□ Lazy loading for expensive resources
□ Batch operations preferred over loops
□ Memory usage considered for large data
□ Network calls minimized and parallelized where possible
□ No blocking operations on main/UI thread
```

---

## 📁 FILE & PROJECT STRUCTURE

### Standard Files to Maintain

```
/CLAUDE.md          - This file (development standards)
/LEARNINGS.md       - Accumulated lessons and mistakes
/README.md          - Project overview and setup
/.env.example       - Template for environment variables
/docs/              - Additional documentation
  /architecture.md  - System design decisions
  /api.md           - API documentation
```

### Code Organization Principles

```
- Group by feature/domain, not by type
- Keep related code close together
- Separate business logic from infrastructure
- Isolate external dependencies behind interfaces
- Configuration separate from code
```

---

## 🔄 WORKFLOW PROTOCOL

### For Every Task

```
1. UNDERSTAND
   - Read the full requirement
   - Identify ambiguities and ask questions
   - Define acceptance criteria

2. PLAN
   - Write pseudocode or outline as comments
   - Identify components/functions needed
   - Consider edge cases and error scenarios
   - Check /LEARNINGS.md for relevant lessons

3. IMPLEMENT
   - Follow the plan systematically
   - Write production-ready code immediately
   - Handle errors as you go, not as an afterthought
   - Add logging for observability

4. VERIFY (Mental)
   - Walk through happy path
   - Walk through each error path
   - Consider boundary conditions
   - Verify resource cleanup

5. DOCUMENT
   - Update relevant documentation
   - Add inline comments for complex logic
   - Update /LEARNINGS.md if anything was discovered
```

### When Errors Occur

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

## 📝 LANGUAGE-SPECIFIC QUICK REFERENCES

### Python

```python
# Always
- Use type hints: def process(data: dict[str, Any]) -> Result:
- Use pathlib for file paths, not string concatenation
- Context managers for resources: with open() as f:
- f-strings for formatting: f"User {name} created"
- List/dict comprehensions over map/filter when readable

# Never
- Mutable default arguments: def fn(items=[])  # BUG!
- Bare except: except:  # Always specify exception type
- String concatenation for SQL: f"SELECT * WHERE id={id}"  # SQL INJECTION!
```

### JavaScript/TypeScript

```typescript
// Always
- Use TypeScript with strict mode
- Prefer const over let, never var
- Use async/await over raw promises
- Destructure with defaults: const { name = 'Unknown' } = user
- Use optional chaining: user?.address?.city

// Never
- Use == for comparison (use ===)
- Modify function parameters directly
- Use any type without explicit reason and TODO to fix
- Ignore promise rejections
```

### Flutter/Dart

```dart
// Always
- Use null safety: String? nullable, String required
- Const constructors for immutable widgets
- Dispose controllers and subscriptions
- Use named parameters for clarity
- Separate business logic from UI (BLoC, Provider, etc.)

// Never
- setState in build method
- Infinite widgets in scrollable without keys
- Network calls in build method
- Ignore widget lifecycle
```

### SQL

```sql
-- Always
- Use parameterized queries
- Index columns used in WHERE, JOIN, ORDER BY
- Limit result sets
- Use transactions for multi-step operations
- Explicit column names (not SELECT *)

-- Never
- String concatenation for query building
- Trust user input in queries
- Unbounded queries without LIMIT
- Ignore execution plans for slow queries
```

---

## ⚡ QUICK DECISION GUIDES

### When to Create a New Function

```
- Code block is used more than once → EXTRACT
- Code block is more than 10 lines → CONSIDER EXTRACTING
- Code block has a single clear purpose → EXTRACT & NAME IT
- Code block requires a comment to explain → EXTRACT (name becomes documentation)
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
```

### When to Add Logging

```
- Application startup/shutdown → INFO
- External service calls → DEBUG (request), INFO (response status)
- Errors and exceptions → ERROR (with stack trace)
- Business-critical operations → INFO
- Security events → WARN or ERROR
- Performance-sensitive operations → DEBUG (with timing)
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
□ Ready for production deployment
```

---

## 📌 REMEMBER

> "The best time to fix a bug is before you write it. The best code is code that handles everything the first time. Every mistake is a lesson—but only if you record it and apply it."

**Your code represents your craftsmanship. Make every line count.**
