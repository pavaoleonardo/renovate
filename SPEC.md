# Renovation Estimates SaaS - SPEC Document

## 1. Project Overview
A Next.js application designed to help construction companies and independent contractors create, manage, and track renovation estimates quickly and efficiently.

## 2. Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Database/Auth**: Supabase
- **UI Icons**: Lucide React
- **Dependencies**: pdf-parse, xlsx, date-fns

## 3. Current State
- Basic landing page exists at `/` (Presupuestos de Reforma).
- Includes links to `/estimates` (dashboard) and `/estimates/new` (create new estimate).
- Has basic configuration for Supabase SSR.

## 4. Development Workflow (Spec-Driven)
- All new features and architecture decisions will be documented here **before** implementation.
- This file acts as the single source of truth for the project context.
- We will prioritize a beautiful, premium aesthetic (modern design, nice typography, smooth interactions).

## 5. Upcoming Features (To-Do)
- [x] Display the logged-in company's information at the top of the Estimates Dashboard (`/estimates`).
- [ ] Implement `catalog/page.tsx` (found in open documents).
- [ ] Implement `/estimates` dashboard.
- [ ] Implement `/estimates/new` creation form.
- [ ] Connect Authentication flow via Supabase.
