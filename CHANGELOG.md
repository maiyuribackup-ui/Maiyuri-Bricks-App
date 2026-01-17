# Changelog

All notable changes to Maiyuri Bricks App will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

---

## [0.2.0] - 2026-01-17

### Added

- **Issue #7**: WhatsApp Business auto-response button with AI-generated messages
- **Issue #8**: Enhanced lead detail page layout with status indicators and metrics
- **Issue #9**: Auto-create leads from Telegram voice messages with AI extraction
- Lead classification field (direct_customer, builder, dealer, architect, vendor)
- Requirement type field (residential_house, commercial_building, eco_friendly_building, compound_wall)
- Site region and location fields for Tamil Nadu regions
- Expanded lead source options (Facebook, Google, Instagram, Just Dial, IndiaMart, etc.)
- Tamil keyword support for regional lead extraction (வீடு, கோவை, விலை, etc.)
- 101 unit tests for lead management features

### Changed

- **Issue #2**: Auto-archive leads when status changes to 'lost'
- Improved lead forms with new classification and location fields
- Enhanced Telegram webhook to handle text message replies for lead creation

### Technical

- Processing callback endpoint for Railway worker integration
- WhatsApp URL generation with pre-filled context-aware messages
- Lead extraction from call transcriptions using pattern matching

---

## [0.1.0] - 2026-01-17

### Added

- Initial release of Maiyuri Bricks AI Lead Management System
- Lead management with CRUD operations
- AI-powered lead scoring and suggestions
- Floor Plan AI for architectural planning
- Knowledge base with RAG integration
- Call recording transcription via Gemini
- Team invitation system with email notifications
- Telegram bot integration for notifications
- Vastu compliance checking
- Sales coach tasks and recommendations
- Dashboard with KPI metrics
- Multi-role support (Founder, Accountant, Engineer)

### Technical

- Next.js 14 with App Router
- Supabase for database and authentication
- Claude AI and Gemini AI integration
- Resend for transactional emails
- Vercel deployment with auto-deploy

---

## Version History

| Version | Date       | Description                                |
| ------- | ---------- | ------------------------------------------ |
| 0.2.0   | 2026-01-17 | Lead management enhancements (Issues #2-9) |
| 0.1.0   | 2026-01-17 | Initial release                            |

[Unreleased]: https://github.com/maiyuribackup-ui/Maiyuri-Bricks-App/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/maiyuribackup-ui/Maiyuri-Bricks-App/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/maiyuribackup-ui/Maiyuri-Bricks-App/releases/tag/v0.1.0
