# Crawler Queue V2 Resume And Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect V2 terminal retry controls to registered data checkpoints and expose truthful retry behavior in the admin monitor.

**Architecture:** Keep the existing Redis schema. Derive launch mode from the persisted queue enqueue mode, retry identity, and immutable action registry; render terminal actions directly from the state machine.

**Tech Stack:** Spring Boot, Java records, Redis V2 repository, Node crawler scripts, Nuxt/Vue admin tests.

---

### Task 1: Restore Terminal Action Contract

- [x] Add failing application-service tests for failed retry/cleanup and completed cleanup actions.
- [x] Remove terminal action suppression from overview and dispatch results.
- [x] Run the focused application-service tests.

### Task 2: Connect Resume Launch Arguments

- [x] Add failing supervisor tests for fresh first launch, resumable retry auto mode, and non-resumable retry fresh mode.
- [x] Extend action command rendering with validated resume arguments.
- [x] Derive the launch mode from queue identity and retry identity.
- [x] Run supervisor, registry, and resume-script tests.

### Task 3: Expose Truthful Admin Controls

- [x] Add failing workbench/page tests for `接着爬`, `重新爬`, and cleanup routing.
- [x] Add registry resume capability to V2 attempt/domain DTO projection.
- [x] Render and route retry/cleanup through exact V2 controls.
- [x] Run focused admin tests and typecheck.

### Task 4: Verify Recovery And Closeout

- [x] Verify queued/retry-wait reconciliation and exact running recovery tests.
- [x] Run focused backend and admin regression selections.
- [x] Run `git diff --check` and inspect user-owned generated paths remain unstaged/unmodified by this follow-up.
- [x] Update the active devlog with fresh evidence and residual risks.
