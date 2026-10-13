import glob
import os
import shutil

import yt_dlp


def find_ffmpeg_bin():
    """Automatically locate an FFmpeg bin folder installed via winget or imageio-ffmpeg."""
    user_profile = os.environ.get('USERPROFILE', 'C:\\Users\\bagdi')
    winget_pattern = os.path.join(user_profile, "AppData", "Local", "Microsoft", "WinGet", "Packages", "*Gyan.FFmpeg*")
    matches = glob.glob(winget_pattern)

    for match in matches:
        bin_path = os.path.join(match, "bin")
        if os.path.exists(os.path.join(bin_path, "ffmpeg.exe")):
            return bin_path

    try:
        import imageio_ffmpeg
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        ffmpeg_dir = os.path.dirname(ffmpeg_exe)
        ffmpeg_alias = os.path.join(ffmpeg_dir, "ffmpeg.exe")
        if not os.path.exists(ffmpeg_alias):
            shutil.copy2(ffmpeg_exe, ffmpeg_alias)
        return ffmpeg_dir
    except Exception:
        return ""


# Configure FFmpeg & FFprobe paths before importing pydub so pydub can detect the binary.
ffmpeg_dir = find_ffmpeg_bin()
if ffmpeg_dir:
    os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")
    ffmpeg_exe = os.path.join(ffmpeg_dir, "ffmpeg.exe")
    ffprobe_path = os.path.join(ffmpeg_dir, "ffprobe.exe")
    if not os.path.exists(ffmpeg_exe):
        default_ffmpeg = os.path.join(ffmpeg_dir, "ffmpeg-win-x86_64-v7.1.exe")
        if os.path.exists(default_ffmpeg):
            shutil.copy2(default_ffmpeg, ffmpeg_exe)

from pydub import AudioSegment

if ffmpeg_dir:
    AudioSegment.converter = os.path.join(ffmpeg_dir, "ffmpeg.exe")
    if os.path.exists(ffprobe_path):
        AudioSegment.ffprobe = ffprobe_path

DOWNLOAD_DIR = 'downloads'
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

def download_youtube_audio(url: str) -> str:
    output_path = os.path.join(DOWNLOAD_DIR, "%(title)s.%(ext)s")
    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": output_path,
        "ffmpeg_location": ffmpeg_dir if ffmpeg_dir else None,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "wav",
                "preferredquality": "192",
            }
        ],
        "quiet": True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        filename = ydl.prepare_filename(info).rsplit(".", 1)[0] + ".wav"
    return filename

def convert_to_wav(input_path: str) -> str:
    """Convert any audio/video file to WAV format using pydub."""
    output_path = os.path.splitext(input_path)[0] + "_converted.wav"
    audio = AudioSegment.from_file(input_path)
    audio = audio.set_channels(1).set_frame_rate(16000) # 16kHz mono
    audio.export(output_path, format="wav")
    return output_path

def chunk_audio(wav_path: str, chunk_minutes: int = 10) -> list:
    audio = AudioSegment.from_wav(wav_path)
    chunk_ms = chunk_minutes * 60 * 1000 

    chunks = []
    for i, start in enumerate(range(0, len(audio), chunk_ms)):
        chunk = audio[start: start + chunk_ms]
        chunk_path = f"{wav_path}_chunk_{i}.wav"
        chunk.export(chunk_path, format="wav")
        chunks.append(chunk_path)
    
    return chunks

def process_input(source: str) -> list:
    if source.startswith("http://") or source.startswith("https://"):
        print("Detected YouTube URL. Downloading audio...")
        wav_path = download_youtube_audio(source)
    else:
        print("Detected local file. Converting to WAV...")
        wav_path = convert_to_wav(source)

    print("Chunking audio...")
    chunks = chunk_audio(wav_path)
    print(f"Audio ready — {len(chunks)} chunk(s) created.")
    return chunks