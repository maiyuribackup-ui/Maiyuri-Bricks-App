# services/auth - Authentication Service CLAUDE.md

Authentication and authorization service using Supabase Auth.

## Features
- Supabase Auth integration
- Role-based access control (RBAC)
- Session management
- Protected route middleware

## User Roles
| Role | Permissions |
|------|-------------|
| Founder (Ram) | Full access, admin capabilities |
| Accountant | Add/update notes, view assigned leads |
| Engineer | Add/update notes, view assigned leads |

## Security Requirements
- JWT token validation
- Session refresh handling
- Logout cleanup
- Never store tokens in localStorage (use httpOnly cookies)

## Auth Flow
1. User signs in via Supabase Auth
2. Role fetched from users table
3. Session cookie set
4. Role verified on each protected request
