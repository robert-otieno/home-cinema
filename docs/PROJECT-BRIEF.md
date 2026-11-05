# PROJECT: Build a Complete Self-Hosted Netflix-Style Media Streaming Platform

## 1. Your Role

Act as a senior full-stack software architect, streaming-media engineer, UI/UX designer, and DevOps engineer.

Your task is to design, develop, test, and deploy a fully functional, production-quality, self-hosted personal movie streaming platform.

The application must provide the visual experience of a premium streaming platform similar to Netflix, Prime Video, or Apple TV+, while operating from my own home computer.

Do not build a simple video gallery or proof-of-concept interface. Build an actual working media server with a beautiful, responsive browser client.

The platform must be local-first, resource-efficient, secure, and extensible.

Use established open-source libraries where appropriate rather than unnecessarily rebuilding streaming protocols.

**Important:** The platform streams movies and videos stored locally that I own or am authorized to access. Do not implement piracy, torrent acquisition, third-party streaming-service extraction, or DRM circumvention.

## 2. Project Objectives

Build a complete system where:

1. My home PC acts as the central media server.
2. Movies remain on local HDDs, SSDs, or configured network drives.
3. The application automatically discovers movies inside configured folders.
4. Movie information is retrieved from external metadata services.
5. Movies are displayed in a premium Netflix-style interface.
6. Users can browse, search, select, and stream movies.
7. Multiple devices can connect to the server simultaneously.
8. Playback continues from the last watched position.
9. Different household users can maintain separate profiles.
10. Compatible smart TVs, computers, tablets, and mobile devices can access the application through their browsers.
11. Playback operates on a local network without requiring an internet connection after metadata has been cached.
12. The architecture can later support TV series, casting, mobile apps, and remote access.

Build the system with actual working functionality, not mock functionality.

## 3. Preferred Technology Stack

### Frontend

- React with TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Lucide React icons
- TanStack Query for server state
- Zustand where global client state is needed
- React Router
- Native HTML5 Video with HLS.js support
- PWA support where practical

### Backend

- Node.js with TypeScript
- Fastify
- REST API
- WebSockets or Server-Sent Events for real-time updates
- FFmpeg and FFprobe for media processing
- Background processing jobs with configurable concurrency
- Chokidar or equivalent for directory monitoring
- Zod for input validation

### Database

Use SQLite with Drizzle ORM as the default.

Store all application data locally and ensure the application can function without cloud database services.

Design the data-access layer so PostgreSQL can be supported later without major restructuring.

### Infrastructure

- Windows 11 and Ubuntu Linux compatibility
- pnpm workspaces
- Local environment configuration
- Optional Docker support for Linux
- Automatic startup configuration
- Structured application logs
- Local cache and transcode directories

Do not introduce paid dependencies or unnecessary cloud services.

## 4. System Architecture

Design the project as a monorepo.

Suggested structure:

```text
home-cinema/
├── apps/
│   ├── web/
│   └── server/
├── packages/
│   ├── shared/
│   ├── database/
│   └── media-core/
├── data/
│   ├── database/
│   ├── cache/
│   ├── artwork/
│   ├── thumbnails/
│   └── transcodes/
├── scripts/
├── docs/
├── .env.example
└── README.md
```

Separate frontend presentation, media management, streaming logic, metadata integrations, database operations, and authentication.

The frontend must not directly access files on the server filesystem.

## 5. Automatic Movie Library Management

Develop a media library management system with the following capabilities:

### Folder management

Allow an administrator to:

- Add one or multiple local movie directories.
- Configure network-mounted media directories.
- Remove directories without deleting actual movie files.
- Start manual scans.
- Enable automatic background scanning.
- See media storage usage.
- View missing or unavailable files.

Support common formats including MP4, MKV, MOV, AVI, M4V, and WebM, subject to what FFmpeg can decode.

### Media discovery

When scanning directories:

1. Detect supported media files.
2. Extract media information using FFprobe.
3. Read filename, duration, resolution, codecs, audio tracks, and subtitles.
4. Parse movie title and release year from filenames.
5. Match movies with TMDB metadata.
6. Store matching results in the local database.
7. Download and cache poster and backdrop artwork.
8. Avoid duplicate library entries.
9. Detect renamed, moved, or removed files.
10. Preserve manually corrected metadata and watch history.

Support configurable folder structures, such as:

Movies / Interstellar (2014) / Interstellar.mkv

### Metadata matching

Use a confidence-based matching algorithm.

When matching is uncertain, flag the movie for manual review instead of automatically assigning incorrect information.

Allow administrators to manually search for and select the correct movie, edit its title, and override metadata.

## 6. Movie Metadata Integration

Primary provider: TMDB API.

Design a reusable metadata provider abstraction to allow future integrations.

Retrieve available information including:

- Movie title
- Original title
- Synopsis
- Release year and date
- Runtime
- Genres
- Posters
- Backdrop artwork
- Cast and crew
- Director
- Ratings
- Original language
- Production country
- Content certification where available
- Trailer links
- Collection or franchise details

Use the official TMDB image configuration to select appropriate image sizes.

Keep API credentials on the server and never expose them to browser clients.

Implement caching, rate-limit handling, retry logic, metadata refresh, and manual corrections.

Comply with TMDB's licensing and attribution requirements.

The streaming server must not depend on TMDB being online once metadata has been cached.

If no valid metadata match is available, generate a useful local library entry from the media filename and technical information.

## 7. Streaming Engine — Critical Component

Build a real media playback service capable of delivering locally stored video files across my home network.

The server must support:

### Direct Play

Stream compatible media directly without transcoding.

Implement HTTP byte-range requests correctly, including appropriate HTTP headers and status codes.

Support seeking, pausing, resuming, and playback progression.

### Remuxing

Where the client supports the source video and audio codecs but not the original container, use FFmpeg to repackage compatible streams without unnecessary re-encoding.

### Transcoding

When a client cannot play the original file:

- Use FFmpeg to generate HLS streams.
- Provide H.264/AAC compatibility profiles.
- Implement configurable quality settings.
- Support 1080p and 720p output profiles initially.
- Add 4K handling where hardware and client compatibility permit.
- Support adaptive bitrate streaming where practical.
- Clean up temporary transcode files when sessions end.

Use hardware acceleration where supported:

- Intel Quick Sync
- NVIDIA NVENC
- AMD AMF or VA-API, depending on operating system

Detect supported encoders rather than assuming they are available.

Provide CPU fallback, hardware capability reporting, concurrent transcode limits, and error handling.

Do not transcode every movie unnecessarily.

### Streaming session management

Track:

- Active playback sessions
- User and device
- Movie being watched
- Playback mode
- Current quality
- Bandwidth where measurable
- Transcoding status
- Errors and session duration

Allow users to switch between Auto, Original, 1080p, and 720p where supported.

Provide a fallback when the selected format cannot be played.

## 8. Premium Streaming Interface

Create a polished dark-themed cinema experience.

The interface should feel like a real streaming service, not an administrative dashboard.

### Design language

- Cinematic black and charcoal backgrounds
- Carefully selected accent color
- Large backdrop imagery
- Modern typography
- Rounded movie artwork
- Subtle gradients
- Smooth hover effects
- Elegant animations
- High-quality skeleton loading states
- Minimal visual clutter

Avoid copying proprietary logos, artwork layouts exactly, or branded design assets.

### Home page

Include:

1. Full-width featured movie hero
2. Play and More Information buttons
3. Continue Watching
4. Recently Added
5. Recommended From My Library
6. Action Movies
7. Comedy
8. Drama
9. Science Fiction
10. Horror
11. Family Movies
12. Collections and Franchises
13. Watchlist

Only show genre sections containing movies available in my actual library.

Make recommendations based on locally available movies, user preferences, genres, and viewing history.

Do not display external movies as playable unless their media files actually exist on the server.

### Movie details page

Include:

- Cinematic backdrop
- Poster
- Title and release year
- Synopsis
- Runtime
- Genre tags
- Rating
- Play or Resume button
- Watchlist action
- Cast
- Director
- Trailer link or player where permitted
- Related movies already in my library
- Audio and subtitle availability

### Search

Implement fast, responsive search across:

- Movie titles
- Actors
- Directors
- Genres
- Release years

Support filters and sorting by genre, year, rating, resolution, and recently added.

## 9. Video Player

Build a polished media player suitable for desktop, mobile, and TV navigation.

Required features:

- Play and pause
- Seek forward and backward
- Volume control
- Mute
- Fullscreen
- Progress bar
- Elapsed and remaining time
- Playback speed where supported
- Audio track selection
- Subtitle selection
- Quality selection
- Resume playback
- Skip forward/backward controls
- Keyboard shortcuts
- Auto-hiding player controls
- Buffering indicator
- Helpful playback error messages

Support external SRT and WebVTT subtitles.

Where feasible, extract or convert compatible embedded subtitles into a browser-friendly format.

Handle unsupported subtitle formats gracefully.

Save playback progress periodically and on pause, seek, and session termination.

Mark movies completed near the end of playback.

Use HLS.js when supported and native HLS when available.

## 10. Smart TV and Device Compatibility

The application must support responsive use on:

- Windows and Linux computers
- macOS computers
- Android phones and tablets
- iPhones and iPads
- Compatible smart TV browsers
- TV-connected streaming devices with suitable browsers

### TV-specific requirements

Develop a 10-foot user interface optimized for viewing from a distance.

Include:

- Large focusable buttons
- Visible focus states
- Arrow-key navigation
- Enter/select navigation
- Back navigation
- Remote-friendly movie selection
- Large readable text
- Minimal dependence on hover gestures

Do not assume all smart TV browsers support the same video codecs, JavaScript features, or streaming formats.

Implement compatibility checks and useful fallback messages.

Design casting support as a later extension, including Chromecast or Google Cast where supported.

Do not claim universal TV compatibility without actual device testing.

## 11. Household Accounts and Profiles

Implement a simple local household account system.

Support:

- Administrator account
- Multiple viewing profiles
- Individual watch histories
- Separate watchlists
- Profile avatars
- Continue Watching per profile
- Optional profile PIN
- Optional child-friendly profiles

Use secure password hashing, authenticated sessions, and appropriate authorization.

Allow the administrator to configure whether household devices require login.

Provide an initial administrator setup flow.

## 12. Administrator Dashboard

Create a separate settings and administration area.

Include:

### Media management

- Add/edit/remove library directories
- Scan status
- Last successful scan
- Metadata matching issues
- Missing files
- Manual metadata matching
- Metadata refresh
- Poster and artwork cache management

### Playback management

- Active streams
- Device information
- Playback resolution
- Direct Play versus transcoding
- Active transcoding jobs
- Playback errors
- Concurrent session limits

### System monitoring

- CPU and memory usage
- Available disk capacity
- FFmpeg availability
- Media server status
- Library size
- Total movie count
- Server uptime
- Recent errors

### Settings

- Server name
- Network port
- Media directories
- Transcode directory
- Hardware acceleration
- Default playback quality
- Cache limits
- Metadata API credentials
- User and profile management
- Backup and restore

Make administrator controls functional rather than decorative.

## 13. Local Network Accessibility

The backend must be accessible from other devices on my home network.

For example:

[http://192.168.1.100:8094](http://192.168.1.100:8094)

Use configurable binding, host, and port settings.

Document how to:

1. Find the computer's LAN IP address.
2. Start the server.
3. Configure the operating system firewall.
4. Access the application from another device.
5. Reserve a consistent LAN address through the router.
6. Automatically start the server after reboot.

Do not assume the host PC is connected to the internet.

Design the application so its local IP address can change without corrupting library information.

Provide a connection or pairing page displaying an appropriate local URL and QR code.

## 14. Security Requirements

This system serves media files and should never expose arbitrary filesystem access.

Implement:

- Secure authentication and authorization
- Password hashing
- Protected media endpoints
- Protected HLS playlists and segments
- Secure session cookies where appropriate
- Validated API input
- Rate limiting for authentication endpoints
- Filesystem path validation
- Protection against directory traversal
- Safe FFmpeg invocation without shell injection
- Restricted access to configured media roots
- Safe logging without credentials
- Secure secret storage
- Appropriate network and CORS configuration

Use least-privilege filesystem access.

Never automatically open the streaming service to the public internet.

Treat remote access as an optional future feature, preferably through a private VPN such as Tailscale.

## 15. Performance and Reliability

The platform should work efficiently on an ordinary home PC.

Prioritize Direct Play whenever possible.

Requirements:

- Stream files without loading entire movies into RAM.
- Perform media scans asynchronously.
- Cache metadata and artwork.
- Limit concurrent transcoding jobs.
- Avoid unnecessary repeated metadata requests.
- Recover gracefully after unexpected restarts.
- Preserve watch progress.
- Avoid duplicate entries during rescans.
- Support large media libraries using database indexes and pagination.
- Keep the frontend responsive during media scanning.
- Handle disconnected drives gracefully.
- Avoid corrupting the library database on failure.

Build meaningful diagnostic logging and graceful shutdown behavior.

## 16. Database Design

Create a normalized database schema covering:

- Users
- Profiles
- Media libraries
- Media files
- Movies
- Genres
- Cast and crew
- Metadata provider matches
- Movie artwork
- Subtitles
- Audio tracks
- Watch history
- Playback progress
- Watchlists
- Playback sessions
- Media scan jobs
- Transcode jobs
- Application settings

Use migrations.

Document table relationships and ensure that deleting a metadata record does not accidentally delete an actual movie file.

## 17. Future-Ready Features

Design extension points for:

- TV shows, seasons, and episodes
- Automatic next-episode playback
- Chromecast/Google Cast
- AirPlay where supported
- Dedicated Android TV applications
- Offline downloads for authorized devices
- Remote access through VPN
- Multiple media storage locations
- NAS integration
- Custom themes
- Parental controls
- Library sharing between trusted households
- Local recommendation algorithms
- Optional PostgreSQL backend

Do not delay the working MVP to implement these extensions.

## 18. Development Phases

Build in the following order.

### Phase 1 — Working foundation

- Initialize monorepo.
- Build backend and frontend.
- Configure database.
- Configure environment variables.
- Implement admin setup.
- Implement movie directory management.
- Scan local media.
- Extract metadata with FFprobe.
- Save movies in the database.

**Acceptance test:** A real movie stored on the PC appears in the library.

### Phase 2 — Metadata and artwork

- Integrate TMDB.
- Implement movie matching.
- Download artwork.
- Implement metadata caching.
- Build manual corrections.

**Acceptance test:** Local movies display accurate metadata and artwork.

### Phase 3 — Playback engine

- Implement HTTP Range streaming.
- Build video player.
- Add playback progress persistence.
- Integrate FFmpeg fallback.
- Add basic HLS streaming.
- Test seeking and playback from another device.

**Acceptance test:** A movie plays on another computer or phone over the home network.

### Phase 4 — Premium interface

- Build cinematic homepage.
- Build movie details.
- Build search.
- Build category shelves.
- Add Continue Watching.
- Add watchlists.
- Implement responsive layouts.

**Acceptance test:** All UI actions work with real library data.

### Phase 5 — Household and TV support

- Add user profiles.
- Add separate watch histories.
- Add TV remote navigation.
- Add subtitle and quality controls.
- Improve playback compatibility.
- Test supported smart TV browsers.

**Acceptance test:** Household profiles can independently browse and watch media.

### Phase 6 — Administration and deployment

- Build administration dashboard.
- Implement system health monitoring.
- Add automated startup.
- Add backup and restore.
- Create installation documentation.
- Complete security review.
- Run end-to-end tests.

**Acceptance test:** The platform can restart and recover without manual rebuilding or losing library data.

## 19. Testing Requirements

Write automated tests where appropriate, including:

- Media filename parsing
- Duplicate movie detection
- Metadata matching
- Media directory security
- Authentication
- HTTP Range requests
- Invalid byte ranges
- Streaming authorization
- Watch progress saving
- Resume playback
- HLS session cleanup
- Missing source files
- Failed FFmpeg executions
- Database migrations

Test with legally available sample media, including different containers and video/audio codecs.

Use real end-to-end tests for critical playback functionality.

Clearly distinguish automated test results from device compatibility that requires physical hardware testing.

## 20. Required Deliverables

Provide:

1. Complete source code.
2. Working backend.
3. Working browser client.
4. Database schema and migrations.
5. FFmpeg streaming integration.
6. TMDB metadata integration.
7. Administration dashboard.
8. Local network access.
9. Installation scripts.
10. Environment configuration example.
11. Automated tests.
12. Comprehensive README.
13. Windows installation instructions.
14. Ubuntu installation instructions.
15. Troubleshooting guide.
16. Deployment and startup instructions.

## 21. Execution Instructions

Before writing code:

1. Inspect the development machine's operating system, CPU, GPU, RAM, and storage.
2. Check installed versions of Node.js, package managers, FFmpeg, and FFprobe.
3. Identify hardware acceleration capabilities.
4. Explain the proposed architecture and any necessary adjustments.
5. Create a concise implementation plan.

Then proceed with implementation.

Do not stop after scaffolding the project.

Do not create fake buttons, nonfunctional pages, or mock playback and describe them as completed features.

Implement features in manageable increments, run relevant tests, and resolve errors before advancing.

Where credentials or filesystem access are required, provide a configuration step rather than hardcoding values.

Ask permission before installing major system dependencies, modifying firewall rules, downloading large assets, or changing system-level settings.

If any feature cannot be implemented reliably, document the limitation and propose a working alternative.

Maintain a project progress document identifying completed, partially completed, and unimplemented features.

**Final objective:** Deliver a self-hosted streaming platform where I can put a movie file into a configured directory on my home PC, have the system discover and identify it automatically, view it through a premium Netflix-style interface, and play it smoothly on compatible devices connected to my home network.
