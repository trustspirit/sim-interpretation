# Real-time Voice Translator

A desktop application for real-time speech recognition and translation. Uses OpenAI API to convert speech to text and translate it into your desired language.

![Electron](https://img.shields.io/badge/Electron-44-47848F?logo=electron)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![OpenAI](https://img.shields.io/badge/OpenAI-API-412991?logo=openai)

## Features

### Real-time Voice Translation
- Real-time microphone input recognition
- Two selectable engines (toggle in the control bar):
  - **Standard**: Realtime API transcription (`gpt-transcribe`) + Chat Completions translation (`gpt-6-luna`, falling back automatically to `gpt-5.4-mini` / `gpt-4.1-mini` if unavailable). Supports Auto direction, custom instructions and voice choice.
  - **Realtime**: single `gpt-realtime-translate` connection for transcription, translation and speech. Fixed direction only (A → B or B → A); instructions and voice choice do not apply.
- Translations are always shown in the order the sentences were spoken
- Continuous speech without pauses is still translated every few seconds (committed at the next short gap, or after 8s at most)
- Each line is translated with the previous lines as reference context, and the model is constrained to return only a translation (it never answers questions addressed to "you")
- Listening never pauses while earlier speech is being translated: capture, transcription and translation run independently
- Audio is kept until its transcript arrives; after a dropped connection anything not yet transcribed is replayed, so nothing said during a hiccup is lost
- Session refreshes hand over to a new connection with no gap: the old one finishes transcribing what it already received

### Hallucination Guards
- Silent audio is never force-committed, and transcripts that arrive without microphone activity are dropped
- Known Whisper artifacts and streaming outros ("thanks for watching", "구독과 좋아요…") are filtered
- Repeated transcripts, the transcription prompt read back on silence, and the app's own spoken output picked up by the mic are ignored
- The speech detector adapts to quiet microphones and loopback devices

### Supported Languages
- English
- Korean
- Japanese
- Chinese
- Spanish
- French
- German

### Voice Mode (Text-to-Speech)
Listen to translations spoken aloud. Standard mode streams `gpt-4o-mini-tts` (2025-12-15) audio over a separate HTTP request, so microphone capture and playback run in parallel without blocking each other.

- **Multiple voices**: Marin, Cedar, Alloy, Echo, Fable, Onyx, Nova, Shimmer (Standard mode)
- **Voice-only mode**: Hide text and only hear audio output
- Queued playback keeps sentences in order; Stop cuts playback immediately

### Translation Direction
Control how languages are detected and translated.

- **Auto**: Automatically detect input language and translate to the other
- **A → B**: Force translation from language A to B
- **B ← A**: Force translation from language B to A

### Subtitle Mode
View translation results while watching videos or during video conferences with subtitle mode.

- Displays as a subtitle bar at the top or bottom of the screen
- Always on top of other windows
- Works over fullscreen applications
- Semi-transparent background to see content behind
- Controls appear only on mouse hover
- Smart queue system for smooth text display

### Settings
- **Microphone Selection**: Choose your input device
- **Subtitle Position**: Top or bottom of screen
- **Translation Instructions**: Add context to improve translation quality
- **Presets**: Save frequently used instructions (2 slots)
- **API Key**: Stored encrypted with the OS keychain (Electron `safeStorage`); `.env` is the fallback
- Languages, direction, voice, font size and text direction are remembered between runs

### Display Options
- **Font size**: 6 levels from small to extra large
- **Text direction**: Top-to-bottom or bottom-to-top flow

## Installation

### Requirements
- Node.js 18+
- OpenAI API Key

### Setup

```bash
# Clone the repository
git clone https://github.com/your-repo/sim-interpretation.git
cd sim-interpretation

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env file and set your OPENAI_API_KEY
```

### Running

```bash
# Development mode
npm run start

# Or build and run separately
npm run build
npm run electron

# Unit tests (filters, ordering, subtitle timing, session config)
npm test
```

## Usage

### Basic Usage

1. **Set Languages**: Select input and output languages from the top bar
2. **Start Recording**: Click the Play button to begin speech recognition
3. **View Translation**: Recognized speech is translated and displayed in real-time
4. **Stop Recording**: Click the Stop button to end recording

### Voice Mode

1. Click the speaker icon to enable voice mode
2. When enabled, translations are read aloud automatically
3. Additional controls appear:
   - **Voice selector**: Choose from 6 different voices (Standard mode only)
   - **Eye icon**: Toggle voice-only mode (hides text)

### Translation Direction

1. Click the direction icon (↔) between languages
2. Choose your preferred mode:
   - **Auto (↔)**: Detect language automatically (Standard mode only)
   - **A → B**: Always translate from first to second language
   - **B ← A**: Always translate from second to first language

### Subtitle Mode

1. Click the subtitle mode button (panel icon) on the main screen
2. A subtitle bar appears at the top or bottom of your screen
3. Hover your mouse to reveal controls:
   - **Maximize icon**: Return to normal mode
   - **Arrow icon**: Toggle subtitle position (top ↔ bottom)
   - **Play/Stop icon**: Start/stop recording

### Translation Instructions

Add instructions in Settings to improve translation quality:

```
Examples:
• Use formal/informal tone
• Technical terminology preferences
• Speaker names or context information
```

## Keyboard Shortcuts

| Action | Control |
|--------|---------|
| Move window | Drag the top area |

## API Key Configuration

You can set your API key in two ways:

### 1. Environment Variable (.env)
```
OPENAI_API_KEY=sk-your-api-key-here
```

### 2. In-App Settings
Settings > API Key section. The key is encrypted with the OS keychain and stored under the app's user data directory; it never goes into localStorage.

## Tech Stack

- **Electron**: Cross-platform desktop application
- **React**: UI framework
- **Vite**: Build tool
- **Tailwind CSS**: Styling
- **OpenAI API**: Realtime transcription / translation, Chat Completions, Speech (TTS)
- **Vitest**: Unit tests for the pure translation-pipeline logic

## Project Structure

```
sim-interpretation/
├── main.js              # Electron main process (sandboxed renderers, IPC)
├── main/apiKeyStore.js  # Encrypted API key storage (safeStorage)
├── preload.cjs          # Electron preload script
├── renderer/
│   ├── App.jsx          # Main app component
│   ├── Settings.jsx     # Settings screen
│   ├── hooks/engines/   # Standard (Whisper) and Realtime Translate engines
│   ├── utils/           # Pure pipeline logic (ordering, chunking, filters) + tests
│   ├── styles.css       # Global styles
│   └── audio-processor.js  # Audio worklet: PCM16 chunks + speech level
├── assets/
│   ├── icon.svg         # App icon source
│   ├── icon.png         # PNG icon
│   └── icon.icns        # macOS icon
└── scripts/
    └── generate-icons.js  # Icon generation script
```

## License

MIT License
