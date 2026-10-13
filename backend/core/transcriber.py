import os
import time

import requests
import whisper
from pydub import AudioSegment

# Sarvam's sync STT-translate API rejects audio longer than 30s.
# We slice each chunk into shorter pieces with a larger safety margin to reduce
# timeouts and upstream 504s on slower connections.
SARVAM_PIECE_SECONDS = max(10, int(os.getenv("SARVAM_PIECE_SECONDS", "15")))
SARVAM_TIMEOUT_SECONDS = max(60, int(os.getenv("SARVAM_TIMEOUT_SECONDS", "180")))
SARVAM_MAX_RETRIES = max(1, int(os.getenv("SARVAM_MAX_RETRIES", "3")))

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small")

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")
SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text"
SARVAM_MODEL = os.getenv("SARVAM_STT_MODEL", "saaras:v3")

_model = None


def load_model():

    global _model  

    if _model is None: 
        print(f"Loading Whisper model: {WHISPER_MODEL} ...")
        _model = whisper.load_model(WHISPER_MODEL) 
        print("Whisper model loaded.")
    return _model 


def transcribe_chunk_whisper(chunk_path: str) -> str:

    model = load_model()  

    result = model.transcribe(chunk_path, task="transcribe")  
    return result["text"]  


def _send_to_sarvam(piece_path: str) -> str:
    """Send one short WAV file to Sarvam and return the English transcript."""
    headers = {"api-subscription-key": SARVAM_API_KEY}
    data = {"model": SARVAM_MODEL, "mode": "translate"}

    for attempt in range(1, SARVAM_MAX_RETRIES + 1):
        try:
            # Reopen the file on every retry; requests consumes the stream.
            with open(piece_path, "rb") as f:
                files = {"file": (os.path.basename(piece_path), f, "audio/wav")}
                response = requests.post(
                    SARVAM_STT_URL,
                    headers=headers,
                    files=files,
                    data=data,
                    timeout=SARVAM_TIMEOUT_SECONDS,
                )
            if response.ok:
                return response.json().get("transcript", "")

            error = (
                f"Sarvam returned {response.status_code}: {response.text[:1000]}"
            )
            if response.status_code not in {408, 429, 500, 502, 503, 504}:
                raise RuntimeError(error)
            if attempt == SARVAM_MAX_RETRIES:
                raise RuntimeError(
                    f"Sarvam request failed after {attempt} attempts: {error}"
                )
            print(
                f"\n⚠️ Sarvam temporary failure "
                f"(attempt {attempt}/{SARVAM_MAX_RETRIES}): {error}\n"
            )
        except requests.RequestException as exc:
            if attempt == SARVAM_MAX_RETRIES:
                raise RuntimeError(
                    f"Sarvam request failed after {attempt} attempts: {exc}"
                ) from exc
            print(
                f"\n⚠️ Sarvam request failed "
                f"(attempt {attempt}/{SARVAM_MAX_RETRIES}): {exc}\n"
            )

        time.sleep(min(2 ** attempt, 10))

    raise RuntimeError("Sarvam request failed without returning a response.")


def transcribe_chunk_sarvam(chunk_path: str) -> str:
    """
    Sarvam sync API only accepts short audio. We split each chunk into
    smaller pieces to reduce upstream timeout/504 errors.
    """
    if not SARVAM_API_KEY:
        raise RuntimeError("SARVAM_API_KEY is not set in environment / .env")

    audio = AudioSegment.from_wav(chunk_path)
    piece_ms = SARVAM_PIECE_SECONDS * 1000

    full_text = ""
    total_pieces = (len(audio) + piece_ms - 1) // piece_ms

    for i, start in enumerate(range(0, len(audio), piece_ms)):
        piece = audio[start: start + piece_ms]
        piece_path = f"{chunk_path}_sv_{i}.wav"
        piece.export(piece_path, format="wav")

        try:
            print(f"  → Sarvam piece {i + 1}/{total_pieces} ...")
            full_text += _send_to_sarvam(piece_path) + " "
        finally:
            if os.path.exists(piece_path):
                os.remove(piece_path)

    return full_text.strip()

   



def transcribe_chunk(chunk_path: str, language: str = "english") -> str:
    """
    Route one chunk to Whisper or Sarvam depending on language choice.
    - english  → Whisper (local model)
    - hinglish → Sarvam (translates to English while transcribing)
    """
    if language.lower() == "hinglish":
        return transcribe_chunk_sarvam(chunk_path)
    return transcribe_chunk_whisper(chunk_path)


def transcribe_all(chunks: list, language: str = "english") -> str:

    full_transcript = "" 

    engine = "Sarvam AI" if language.lower() == "hinglish" else "Whisper"
    print(f"Using {engine} for transcription.")

    for i, chunk in enumerate(chunks):  

        print(f"Transcribing chunk {i + 1}/{len(chunks)}...")

        text = transcribe_chunk(chunk, language=language)  

        full_transcript += text + " "  

    print("Transcription complete.")

    return full_transcript.strip()  
