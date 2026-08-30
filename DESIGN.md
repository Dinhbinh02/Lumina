# DESIGN.md — Nexus UI Design Tokens & Guidelines

## 1. Design Overview
Nexus is a sleek, minimalist browser AI workspace featuring high-contrast typography, zero-clutter surfaces, customizable accent colors, and seamless side-by-side Canvas & Chat layouts.

## 2. Design Tokens

### Colors & Surfaces
- **Light Theme**:
  - Background: `#FFFFFF` / Light Surface: `#F5F5F7`
  - Text Primary: `#202124` / Secondary: `#5F6368` / Muted: `#9AA0A6`
  - Border: `rgba(0, 0, 0, 0.1)`
- **Dark Theme**:
  - Background: `#3C3C3C` / Dark Surface: `#2C2C2C`
  - Text Primary: `#FFFFFF` / Secondary: `#E0E0E0` / Muted: `#80848C`
  - Border: `rgba(255, 255, 255, 0.15)`
- **Accents**:
  - Default: Primary Monochrome (Black/White)
  - Options: Amber (`#d97706`), Emerald (`#059669`), Sky (`#0284c7`), Indigo (`#4f46e5`), Rose (`#e11d48`)

### Typography
- **UI & Prose**: `Inter, system-ui, sans-serif`
- **Code & Numbers**: `Google Sans Code, Consolas, monospace`
- **Math**: `KaTeX fonts`

### Spacing & Borders
- **Border Radius**: Small `12px`, Medium `16px`, Large `24px`, Pill `9999px`
- **Card Padding**: 16px - 20px

### Component Specific Tokens
- **Canvas Card in Chat**: Rounded `16px`, clean border, interactive hover state.
- **Canvas Toolbar**: Compact `42px` height, segmented tab pills, type badges with language-specific color coding.
- **Streaming Cards (Sequence/Timeline/Chips)**: Clean flat cards, responsive layout.
