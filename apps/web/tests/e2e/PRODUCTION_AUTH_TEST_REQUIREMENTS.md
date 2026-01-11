# Production Auth - User Journey Test Requirements

## Document Information
- **Created**: 2026-01-10
- **Version**: 1.0
- **Author**: Claude Code
- **Status**: Testing Phase

---

## 1. Executive Summary

This document outlines the test requirements for verifying the Production Authentication System for Maiyuri Bricks AI Lead Management application. The system supports 3-5 staff members with email-based authentication, invitation flow, and role-based access control.

---

## 2. System Under Test

### 2.1 Authentication Components
| Component | Location | Purpose |
|-----------|----------|---------|
| Login Page | `/login` | Email/password authentication |
| Forgot Password | `/forgot-password` | Password reset request |
| Reset Password | `/reset-password` | Password update with token |
| Accept Invite | `/accept-invite` | New staff onboarding |
| Settings/Team | `/settings` (Team tab) | Staff management |

### 2.2 User Roles
| Role | Permissions |
|------|-------------|
| Founder | Full access, can invite/manage staff |
| Accountant | Reports, leads, limited admin |
| Engineer | Leads, tasks, basic access |

### 2.3 Test Users
| Email | Role | Password |
|-------|------|----------|
| ram@maiyuribricks.com | founder | TempPass123! |
| kavitha@maiyuribricks.com | accountant | TempPass123! |
| srinivasan@maiyuribricks.com | engineer | TempPass123! |

---

## 3. User Journeys

### Journey 1: Staff Login (Phase 1-2 Verification)
**Actors**: Any staff member
**Precondition**: User has active account
**Flow**:
1. Navigate to `/login`
2. Enter email and password
3. Click "Sign In"
4. Verify redirect to `/dashboard`
5. Verify user name displayed in header

**Expected**: Successful login with session persistence

### Journey 2: Password Reset (Phase 4 Verification)
**Actors**: Any staff member
**Precondition**: User has active account
**Flow**:
1. Navigate to `/login`
2. Click "Forgot password?"
3. Enter email address
4. Click "Send reset link"
5. Verify success message displayed
6. (Email would contain reset link)

**Expected**: Success message shown, email sent

### Journey 3: Founder Invites Staff (Phase 3, 7 Verification)
**Actors**: Founder only
**Precondition**: Founder is logged in
**Flow**:
1. Navigate to `/settings`
2. Click "Team" tab
3. Click "Invite Member" button
4. Fill in: name, email, phone, role
5. Click "Send Invitation"
6. Verify success message
7. Verify new member appears in list with "Pending" status

**Expected**: Invitation sent, member added to list

### Journey 4: Staff Accepts Invitation (Phase 3 Verification)
**Actors**: New staff member
**Precondition**: Invitation email received
**Flow**:
1. Click invitation link (with token)
2. Verify user info pre-populated
3. Enter new password
4. Confirm password
5. Click "Create Account"
6. Verify redirect to login

**Expected**: Account created, can login with new password

### Journey 5: Rate Limiting Protection (Phase 6 Verification)
**Actors**: System test
**Precondition**: None
**Flow**:
1. Attempt 11+ login requests within 60 seconds
2. Verify 429 "Too Many Requests" response
3. Verify Retry-After header present

**Expected**: Rate limiting blocks excessive requests

### Journey 6: Security Headers (Phase 6 Verification)
**Actors**: System test
**Precondition**: None
**Flow**:
1. Make request to any protected page
2. Verify X-Frame-Options: DENY
3. Verify X-Content-Type-Options: nosniff
4. Verify Content-Security-Policy present

**Expected**: All security headers present

### Journey 7: Team Management (Phase 7 Verification)
**Actors**: Founder
**Precondition**: Founder logged in, has team members
**Flow**:
1. Navigate to `/settings`
2. Click "Team" tab
3. Verify all team members listed
4. Verify status badges (Active/Pending/Deactivated)
5. Verify role badges displayed
6. For pending member: verify "Resend Invite" option
7. Verify "Deactivate" option for non-founder members

**Expected**: Full team management functionality

---

## 4. Test Matrix

| Test ID | Journey | Phase Covered | Priority |
|---------|---------|---------------|----------|
| TC001 | Login - Valid credentials | 1, 2 | Critical |
| TC002 | Login - Invalid credentials | 1 | Critical |
| TC003 | Login - Form validation | 1 | High |
| TC004 | Forgot Password - Submit | 4 | Critical |
| TC005 | Reset Password - Invalid link | 4 | High |
| TC006 | Team - View members | 7 | High |
| TC007 | Team - Invite flow | 3, 7 | Critical |
| TC008 | Team - Role-based access | 7 | High |
| TC009 | Security - Headers check | 6 | Critical |
| TC010 | Security - Rate limiting | 6 | Critical |
| TC011 | Accept Invite - Valid token | 3 | Critical |
| TC012 | Accept Invite - Invalid token | 3 | High |

---

## 5. Acceptance Criteria

### 5.1 Must Pass (Blocking)
- [ ] TC001: Valid login works
- [ ] TC004: Forgot password sends email
- [ ] TC007: Founder can invite staff
- [ ] TC009: Security headers present
- [ ] TC011: Accept invite with valid token works

### 5.2 Should Pass (High Priority)
- [ ] TC002: Invalid login shows error
- [ ] TC003: Form validation works
- [ ] TC006: Team list displays correctly
- [ ] TC010: Rate limiting enforced

### 5.3 Nice to Have
- [ ] TC005: Reset password handles expired links
- [ ] TC008: Non-founders cannot invite
- [ ] TC012: Invalid invite tokens handled

---

## 6. Test Environment

- **Base URL**: http://localhost:3000
- **Browser**: Chromium (Playwright)
- **Test Framework**: Playwright
- **Timeout**: 30 seconds per test
