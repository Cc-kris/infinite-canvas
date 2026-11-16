# Infinite Canvas Documentation Index

## Overview

- [Quick Start](/docs/overview/quick-start)
- [Features](/docs/overview/features)
- [Deploy on Render (legacy browser build)](/docs/overview/render)
- [Docker Deployment (legacy browser build)](/docs/overview/docker)
- [Third-party Prompt Sources](/docs/overview/third-party-prompt-repositories)

## Canvas Guide

- [Canvas Node Guide](/docs/canvas/canvas-node-manual)
- [Canvas Shortcuts](/docs/canvas/canvas-shortcuts)

## Development and Data

- [Local Development](/docs/development/local-development)
- [Desktop Backend Split Plan](V1.0/DESKTOP_BACKEND_SPLIT_PLAN.md) — repository file, not a docs-site route
- [Canvas Data Structure](/docs/development/canvas-data-structure)
- [How the Local Codex Connection Works](/docs/development/local-codex-canvas)

## Business

- [Open-source License](/docs/business/license)
- [Business Cooperation](/docs/business/business)

## Support and Security

- [Report a Vulnerability](/docs/support/security)
- [Sponsor the Project](/docs/support/sponsor)

## Project Progress

- [Changelog](/docs/progress/changelog)
- [Pending Tests](/docs/progress/pending-test)
- [TODO](/docs/progress/todo)

## Notes

- This branch ships the desktop client only; the web build is frozen on `feat/linkfox-v1-real`.
- The renderer holds UI and state only. Upstream model calls, content parsing, media processing and storage all run in the main-process service at `127.0.0.1:23212`; there is no browser fallback.
- Canvas projects and My Assets are stored as files under the local user data directory (`<userData>/data/`). This is still local data, not cloud sync; WebDAV can be configured for cross-device synchronization.
- The AI API key is stored on this machine; requests are sent by the desktop main-process service, not directly by the page.
