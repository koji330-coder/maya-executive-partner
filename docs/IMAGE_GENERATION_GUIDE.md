# MAYA Image Generation Guide

## Canonical reference

Use `assets/reference/maya-character-bible.png` as the visual source of truth.

The approved character is MAYA A.

## Objective

Generate production assets that preserve the same person while varying only:

- expression
- pose
- clothing mode
- scene
- camera framing

Do not redesign MAYA from asset to asset.

## Base prompt concept

Use the reference image and preserve the exact character identity.

Canonical characteristics:

- adult Japanese / East Asian woman, age 27
- dark-brown long hair
- soft but intelligent facial features
- large expressive eyes
- attractive polished AI-beauty appearance
- stylized 2.5D / premium game-character rendering
- feminine, elegant proportions
- ivory / white business-casual wardrobe as default
- warm modern office environment
- approachable but confident presence
- visually cute and appealing rather than photorealistic

## Negative direction

Avoid:

- photorealistic influencer photography
- uncanny realism
- chibi proportions
- generic black suit
- cyberpunk neon
- sci-fi holograms
- excessive makeup
- changing face shape between generations
- changing hair length/color
- exaggerated sexual posing

## Production generation order

Generate in this order:

1. neutral front pose
2. blink eye states while preserving all other pixels as closely as possible
3. mouth states while preserving all other pixels as closely as possible
4. expression set
5. pose set
6. scene variations

## Required expressions

- neutral
- smile
- thinking
- serious
- challenge
- annoyed
- happy
- concerned
- relaxed
- wink

## Required pose concepts

- default standing/sitting
- thinking
- lean forward
- arms crossed
- holding tablet
- holding coffee
- relaxed late-night

## Important implementation note

Animation material should be generated with minimal changes between variants. The goal is not to create separate illustrations that merely depict the same character; it is to create states that can switch without visible identity jumps.
