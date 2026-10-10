# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Friends taking part in a mysterious, enigmatic treasure hunt. They play almost entirely on their phones, often on the move, opening the site to read the current riddle and type in their answer.

## Product Purpose

A static site where each player signs up (username + password), reads the published riddles, and submits or edits an answer per riddle at any time. Answers land in a Google Sheet that the organizer reads. Success: players feel they have entered a mysterious game, and answering is effortless on mobile.

## Operating Context

- Mobile-first: primary use is a phone browser, one hand, variable light and connection.
- Riddles are published by the organizer by editing `puzzles.json` and pushing to `main`; the site re-fetches it on load.
- The organizer reads every answer and password directly in the Google Sheet.

## Capabilities and Constraints

- Plain static HTML/CSS/JS, no build step, hosted on GitHub Pages; backend is a Google Apps Script Web App (`config.js` holds its URL).
- Login and registration share one form (two submit buttons); a player sees only their own answers; answers can be edited indefinitely.
- Riddle `text` supports line breaks (`\n`); `id` must never change after publication.
- UI copy is Italian.

## Brand Commitments

- Theme (confirmed by the organizer): the hunt is mysterious and enigmatic, and the site must carry that theme.
- Tone is playful among friends (passwords are meant to be "goliardiche").

## Evidence on Hand

- One published riddle in `puzzles.json` ("Enigma 1"). No logo, imagery, or story text exists; do not invent lore presented as the organizer's.

## Product Principles

1. Answering a riddle is never harder than typing in a text box: atmosphere never blocks the task.
2. The site is part of the mystery, not a neutral form around it.
3. Mobile first, always: thumb reach, small screens, flaky networks.
4. The organizer controls content; the site never assumes riddles beyond what `puzzles.json` publishes.

## Accessibility & Inclusion

Respect `prefers-reduced-motion` for all animation and the animated background; keep text contrast readable outdoors on a phone.
