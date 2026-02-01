# swan-frontend

WhatsApp automation bot written in TypeScript using @whiskeysockets/baileys. The bot listens for messages (text, image, PDF, audio), converts voice notes to MP3, forwards media to a backend for embedding or storage, and supports commands like /img and /pdf to retrieve previously uploaded content.

## Features

- WhatsApp connection and multi-file auth (Baileys).
- QR code generation saved to qrcode.png for first-time authentication.
- Audio download and transcoding (ogg -> mp3) using fluent-ffmpeg and @ffmpeg-installer/ffmpeg.
- Upload images and PDFs to a backend service (BACKEND_URI) for embedding and search.
- Commands:
  - /img [query] — search images
  - /pdf [query] — search PDFs
  - /help — command summary
- Secure credential persistence in an `auth/` folder (created by Baileys).

## Prerequisites

- Node.js >= 18 (recommended) — TypeScript target is ES2022.
- npm
- No manual ffmpeg install required because @ffmpeg-installer/ffmpeg is used. If you prefer a system ffmpeg, ensure it's in PATH.
- A running backend service that exposes the endpoints referenced below (configured via BACKEND_URI).

## Quick Start

1. Clone the repository:
   - git clone https://github.com/Kratos-024/swan-frontend.git
   - cd swan-frontend

2. Install dependencies:
   - npm install

3. Create a .env file:
   - Copy `.sample.env` to `.env`:
     - cp .sample.env .env
   - Edit `.env` and set values:
     - MOBILE_NUMBER=910123456789
     - BACKEND_URI=https://your-backend.example.com    (required)

   Example `.env`:
   ```env
   MOBILE_NUMBER=910123456789
   BACKEND_URI=https://api.example.com
   ```

   Notes:
   - MOBILE_NUMBER should be the phone number in E.164 format without the plus sign and without the '@' suffix; the code will compare messages against `${MOBILE_NUMBER}@s.whatsapp.net`.
   - BACKEND_URI must point to your backend that implements the endpoints in the API contract section below.

4. Build and run:
   - Build: npm run build
   - Start: npm run start
   - "dev" (build then start): npm run dev

   The TypeScript output will be compiled to the `dist/` directory. The bot will only start if `MOBILE_NUMBER` is set in your .env.

## Development tips

- The repository uses a simple build->start flow. For faster development you can use ts-node, nodemon, or add a watch script (not included by default).
- Ensure the `audios/` directory exists (used to store voice_note.ogg) or create it:
  - mkdir audios

## How the bot authenticates

- On first run (or when credentials are missing), the Baileys client generates a QR string and the code writes it to `qrcode.png`.
- Scan the QR with WhatsApp on your phone to connect.
- Credentials are saved by Baileys using `useMultiFileAuthState("auth")` — you will find an `auth/` directory with files (device credentials) created automatically.
- If the connection closes and the disconnection reason is not `loggedOut`, the bot attempts to reconnect automatically.

## Where files are saved

- qrcode.png — saved when a QR is generated (in repo root).
- auth/ — multi-file auth credentials created by Baileys.
- audios/voice_note.ogg — downloaded audio message (created when a voice note is received).
- output.mp3 — resulting transcoded MP3 (ffmpeg output piped).
- Temporary PDFs — created when /pdf triggers a generated PDF; the bot saves and sends then deletes the local file.

Note: Audio files are currently downloaded and transcoded (ogg → mp3). Automatic speech-to-text transcription is a planned feature (see "Audio transcription (WIP)" below).

## Supported interactions

- Send a text message -> forwarded to backend for response (via /chat).
- Send an image -> bot uploads the image to backend (/create-embed-img) and returns a confirmation or an authorization URL.
- Send a PDF -> bot uploads the PDF (/send-pdfbuffer) and returns confirmation or authorization URL.
- Send a voice note -> bot downloads the voice note and transcodes it to MP3 (saved to output.mp3). (Transcription is being implemented but currently not available.)
- Commands:
  - /img [query]: triggers a backend query (/chat-img) and returns either a base64 image to send back or an auth URL.
  - /pdf [query]: triggers search for previously uploaded PDFs and either sends metadata and covers or a PDF file (download & send).
  - /help: shows command summary.

Important: The code only processes messages where key.remoteJid equals `${MOBILE_NUMBER}@s.whatsapp.net`. If you want the bot to respond to all chats, remove or adapt that check in src/controllers/WA_controller.ts.

## Audio transcription (WIP)

- Status: Work in progress — audio transcription is being implemented but not yet functional.
- Current behavior:
  - When a voice note is received the bot downloads the audio to audios/voice_note.ogg and uses ffmpeg to transcode it to output.mp3.
  - No automatic speech-to-text transcription is produced or sent to the backend yet.
- Planned work:
  - Integrate a transcription engine (examples: OpenAI Whisper, Google Speech-to-Text, or a self-hosted model).
  - Add automatic forwarding of the transcribed text to the backend (/chat) or return it directly to the user.
- If you want to help or test:
  - Check that audios/ exists and that ffmpeg is available (the code uses @ffmpeg-installer/ffmpeg by default).
  - Watch logs for ffmpeg errors and the "Audio Transcoding succeeded!" message in the console.

## Backend API contract

The bot communicates with BACKEND_URI. These are the endpoints the bot calls and the expected request/response shapes (inferred from src/controllers/messages_controller.ts).

1) POST {BACKEND_URI}/chat
- Request body:
  {
    "message": "Your message text",
    "thread_id": "123"
  }
- Response:
  { "reply": "Text reply from backend" }

2) POST {BACKEND_URI}/chat-img
- Request body:
  { "img_query": "/img cats" }
- Response (one of):
  - Success with image (base64):
    { "imageResponse": "<base64 string>" }
  - Authorization required:
    { "auth": false, "url_string": "https://auth.example.com/..." }

3) POST {BACKEND_URI}/create-embed-img
- Request body:
  {
    "buffer": { "data": [/* array of bytes from Buffer */] }
  }
- Response (one of):
  - { "reply": "Image embedded/processed message" }
  - { "auth": false, "url_string": "https://..." }

4) POST {BACKEND_URI}/send-pdfbuffer
- Request body:
  {
    "buffer": { "data": [/* array of bytes */] },
    "pdf_name": "myfile.pdf"
  }
- Response (one of):
  - { "reply": "PDF processed or stored" }
  - { "auth": false, "url_string": "https://..." }

5) POST {BACKEND_URI}/search_pdf_query
- Request body:
  { "Pdf_query": "/pdf my search text" }
- Response (one of):
  - Found PDFs (array):
    {
      "reply": [
        {
          "File_Name": "doc.pdf",
          "date": "2026-01-01",
          "total_pages": 10,
          "cover_buffer": "<base64 image cover>"
        },
        ...
      ]
    }
  - Return single PDF to send (base64 & filename):
    { "reply": "<base64 pdf data>", "pdf_name": "file.pdf" }

Notes:
- The bot expects the backend to return JSON and to use the response shapes above.
- The code converts incoming image buffers to an array of bytes before sending to the backend.

## Example flows

1) First run
- npm run build && npm run start
- qrcode.png is created. Scan it with WhatsApp to authenticate.
- auth/ folder will contain credentials; subsequent runs will reuse them.

2) Send /img cats
- Bot calls POST /chat-img with { img_query: "/img cats" }.
- If backend returns base64 image, bot sends it back to the chat as an image with caption. If it returns an auth URL, the bot replies with the URL.

3) Upload a PDF
- Send a PDF file through WhatsApp.
- Bot downloads the PDF, sends it to the backend (/send-pdfbuffer).
- Backend may request auth (bot will forward auth URL to the user) or confirm processing.

4) Voice note
- Send a voice note; bot saves it to audios/voice_note.ogg and ffmpeg transcodes to output.mp3. (Transcription not available yet.)

## Implementation notes & customizations

- Only messages coming from `${MOBILE_NUMBER}@s.whatsapp.net` are processed. To respond in other chats, change the conditional in src/controllers/WA_controller.ts that checks key.remoteJid.
- The bot uses Pino logger with level "silent". Change logger options in makeWASocket() to enable debugging.
- ffmpeg is used via @ffmpeg-installer/ffmpeg; this should work across OSes but if you encounter ffmpeg issues you can install system ffmpeg and adjust ffmpeg path.
- The NodeCache instance is used for cachedGroupMetadata with a TTL of 5 minutes.

## Troubleshooting

- QR not appearing or qrcode.png empty:
  - Confirm the process prints QR saved messages; try deleting auth/ and restarting to force QR generation.
- Backend not reachable:
  - Ensure BACKEND_URI is set and accessible from your host; check logs for HTTP errors.
- Permission errors when writing files:
  - Check file system permissions. Ensure the process has write access to the repository folder.
- ffmpeg conversion fails:
  - Inspect console output to see ffmpeg error messages. Ensure ffmpeg binary is present (either via @ffmpeg-installer or system ffmpeg).
- Audio not working / transcription missing:
  - The bot currently downloads and transcodes audio but transcription is not implemented. Check the audios/ directory, confirm ffmpeg is available, and look at console logs for errors. Implementation of speech-to-text will be added and documented when available.

## Security & privacy

- The bot stores WhatsApp credentials in the `auth/` folder. Protect these files — do not commit them to Git or share them.
- Do not commit .env with secrets to the repository.
- Uploaded media is forwarded to your BACKEND_URI; ensure the backend is secure and trustworthy.
