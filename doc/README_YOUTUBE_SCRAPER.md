# YouTube Shorts Scraper

## Overview

Scrapes YouTube Shorts from `@Honkaistarrail_kr` channel and links them to characters.

## Features

- ✅ Scrapes Shorts metadata (title, URL, thumbnail)
- ✅ Parses character names from titles (e.g., `#스파키`)
- ✅ Downloads videos as MP4 (~2-3MB each)
- ✅ Updates `Character.metadata.keyVisualUrl`
- ✅ Saves to `Video` table with local path

## Usage

### Full Sync (All Videos)

```bash
npx ts-node -T scripts/sync_youtube_shorts.ts
```

### Test Single Video

```bash
npx ts-node -T scripts/test_video_download.ts
```

### Verify Results

```bash
npx ts-node -T scripts/verify_youtube_sync.ts
```

## Database Schema

### Video Table

- `url`: YouTube Shorts URL
- `localPath`: Relative path to downloaded file (e.g., `assets/video/9Z9twPFh9iU.f135.mp4`)
- `characterId`: Linked character (nullable)
- `title`, `thumbnailUrl`, `type`

### Character Metadata

- `keyVisualUrl`: YouTube Shorts URL for key visual

## File Structure

```
static/video/
  ├── 9Z9twPFh9iU.f135.mp4  (2.37 MB)
  ├── IrPPoM9_QIU.f135.mp4
  └── ...
```

## Notes

- Videos are downloaded in MP4 format
- WebM conversion requires ffmpeg (not currently enabled)
- Character matching is case-insensitive
- Duplicate videos are skipped
