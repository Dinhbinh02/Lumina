# Nexus Design Specification

## Overview
Nexus Workspace UI Design System & Tokens.

## Design Principles
- **Seamless Split Canvas**: The left chat pane and right studio preview/editor pane blend harmoniously without jarring thick lines or floating detached islands.
- **Sleek Studio IDE**: The code editor pane feels like a modern integrated developer studio (full-bleed/edge-to-edge within its container, crisp tabs, minimal status bar, unobtrusive scrollbars).
- **Subtle Surface Contrasts**: Soft borders (`rgba(0,0,0,0.08)` / `rgba(255,255,255,0.08)`), dark editor surface (`#16161a`), neutral background, and clean typography.

## Token System
```yaml
tokens:
  color:
    bg_primary: var(--nexus-bg-primary, #ffffff)
    sidebar_bg: var(--nexus-sidebar-bg, #fcfcfc)
    border_subtle: rgba(0, 0, 0, 0.08)
    editor_bg: "#16161a"
    editor_header_bg: "#1e1e24"
    editor_text: "#f8f8f2"
    accent_green: "#50fa7b"
    accent_pink: "#ff79c6"
    accent_blue: "#8be9fd"
  typography:
    font_sans: "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    font_mono: "'Google Sans Code', 'JetBrains Mono', ui-monospace, monospace"
  radius:
    lg: 16px
    md: 10px
    sm: 6px
```
