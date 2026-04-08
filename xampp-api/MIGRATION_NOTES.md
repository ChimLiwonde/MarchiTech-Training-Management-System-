# XAMPP Migration Notes

## Completed in this scaffold

- Chosen migration direction: keep the React frontend and replace Supabase with PHP/MySQL
- Added a PHP API skeleton for XAMPP
- Added token-based auth endpoints
- Added training program endpoints
- Added enrollment endpoints
- Added session endpoints
- Added attendance endpoints
- Added a dashboard overview endpoint
- Added resource endpoints with local upload handling
- Added an admin reports overview endpoint
- Added assessment, question, and attempt endpoints
- Added certificate and public verification endpoints
- Added a MySQL schema covering the current app's main tables
- Added frontend backend switching with `VITE_BACKEND_MODE`
- Migrated `useAuth.tsx` to support XAMPP auth mode
- Migrated `TrainingPrograms.tsx` to support XAMPP mode
- Migrated `Sessions.tsx` to support XAMPP mode
- Migrated `Attendance.tsx` to support XAMPP mode
- Migrated `Dashboard.tsx` to support XAMPP mode
- Migrated `Resources.tsx` to support XAMPP mode
- Migrated `Reports.tsx` to support XAMPP mode
- Migrated `Assessments.tsx` to support XAMPP mode
- Migrated `Certificates.tsx` to support XAMPP mode
- Migrated `VerifyCertificate.tsx` to support XAMPP mode
- Migrated `Profile.tsx` to support XAMPP mode
- Migrated `Progress.tsx` to support XAMPP mode
- Migrated `Feedback.tsx` to support XAMPP mode
- Migrated `UserManagement.tsx` to support XAMPP mode
- Replaced XAMPP notification fallback with API polling in `NotificationBell.tsx`
- Added PayChangu checkout, verification, and webhook endpoints for XAMPP
- Extended `TrainingPrograms.tsx` with XAMPP payment status, checkout, and return verification
- Expanded the attendance schema to allow `excused` status

## Remaining frontend-to-backend work

- Optional polish for realtime notifications via SSE or WebSockets
- Optional payment/admin tooling such as manual reconciliation screens
- End-to-end cleanup and parity testing

## Suggested migration order

1. End-to-end cleanup and parity testing
2. Optional realtime notification upgrade
3. Optional payment/admin tooling improvements

## Reality check

Auth, dashboard, reports, resources, assessments, certificates, training programs, sessions, attendance, profile, progress, feedback, user management, notifications, and payments now have a real XAMPP path. The remaining work is mostly cleanup, optional realtime polish, and broader end-to-end testing with real PayChangu credentials.
