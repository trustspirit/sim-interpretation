# Real-time Voice Translator

A desktop application for real-time speech recognition and translation. Uses OpenAI API to convert speech to text and translate it into your desired language.

![Electron](https://img.shields.io/badge/Electron-28-47848F?logo=electron)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![OpenAI](https://img.shields.io/badge/OpenAI-API-412991?logo=openai)

## Features

### Real-time Voice Translation
- Real-time microphone input recognition
- Speech-to-text conversion using OpenAI Whisper API
- Natural translation using OpenAI GPT API

### Supported Languages
- English
- Korean
- Japanese
- Chinese
- Spanish
- French
- German

### Voice Mode (Text-to-Speech)
Listen to translations spoken aloud with OpenAI's TTS.

- **Multiple voices**: Alloy, Echo, Fable, Onyx, Nova, Shimmer
- **Speed control**: 0.5x to 2x playback speed
- **Voice-only mode**: Hide text and only hear audio output
- Queued playback for continuous translation

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
- **API Key**: Configure OpenAI API key

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
   - **Voice selector**: Choose from 6 different voices
   - **Speed selector**: Adjust playback speed (0.5x - 2x)
   - **Eye icon**: Toggle voice-only mode (hides text)

### Translation Direction

1. Click the direction icon (↔) between languages
2. Choose your preferred mode:
   - **Auto (↔)**: Detect language automatically
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
Settings > API Key section

## Tech Stack

- **Electron**: Cross-platform desktop application
- **React**: UI framework
- **Vite**: Build tool
- **Tailwind CSS**: Styling
- **OpenAI API**: Speech recognition (Whisper) + Translation (GPT) + Text-to-Speech (TTS)

## Project Structure

```
sim-interpretation/
├── main.js              # Electron main process
├── preload.cjs          # Electron preload script
├── renderer/
│   ├── App.jsx          # Main app component
│   ├── Settings.jsx     # Settings screen
│   ├── styles.css       # Global styles
│   └── audio-processor.js  # Audio processing
├── assets/
│   ├── icon.svg         # App icon source
│   ├── icon.png         # PNG icon
│   └── icon.icns        # macOS icon
└── scripts/
    └── generate-icons.js  # Icon generation script
```

## License

MIT License
