import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import * as googleTTS from 'google-tts-api';
import axios from 'axios';
import { config } from '../config.js';

class TTSService {
  constructor() {
    this.audioDir = path.join(config.storageDir, 'audio');
    if (!fs.existsSync(this.audioDir)) {
      fs.mkdirSync(this.audioDir, { recursive: true });
    }

    this.voices = [
      // English Voices
      { id: 'en-US-GuyNeural', name: 'Guy (Narrator)', lang: 'en', gender: 'male', style: 'narrator', desc: 'Calm, authoritative narrator voice, great for documentaries and stories', sampleText: 'Welcome to this captivating journey into the world of storytelling.' },
      { id: 'en-US-JennyNeural', name: 'Jenny (Storyteller)', lang: 'en', gender: 'female', style: 'calm', desc: 'Warm, soothing, engaging storyteller voice', sampleText: 'Once upon a time in a faraway forest, a little rabbit made a big discovery.' },
      { id: 'en-US-AnaNeural', name: 'Ana (Child / Cute)', lang: 'en', gender: 'female', style: 'childlike', desc: 'Sweet childlike character voice, ideal for cute cartoons and animal characters', sampleText: 'Hi there! Would you like to share this delicious sweet apple with me?' },
      { id: 'en-US-ChristopherNeural', name: 'Christopher (Energetic)', lang: 'en', gender: 'male', style: 'energetic', desc: 'High energy, punchy voice tailored for fast-paced viral YouTube Shorts', sampleText: 'You will not believe what happened next! Check this out!' },
      { id: 'en-US-AriaNeural', name: 'Aria (Emotional)', lang: 'en', gender: 'female', style: 'emotional', desc: 'Deeply expressive, emotional, dramatic tone', sampleText: 'In that silent moment of kindness, everything changed forever.' },

      // Hindi Voices
      { id: 'hi-IN-SwaraNeural', name: 'Swara (स्वर - Storyteller)', lang: 'hi', gender: 'female', style: 'calm', desc: 'मधुर और कोमल कहानी वाचक आवाज़, कार्टून और कहानियों के लिए सर्वोत्तम', sampleText: 'नमस्ते! एक सुंदर जंगल में एक नन्हा प्यारा खरगोश खुशी से रहता था।' },
      { id: 'hi-IN-MadhurNeural', name: 'Madhur (मधुर - Narrator)', lang: 'hi', gender: 'male', style: 'narrator', desc: 'गंभीर, आत्मविश्वास भरी और प्रभावशाली हिंदी आवाज़', sampleText: 'सच्ची दोस्ती और नेकी हमेशा हमारे जीवन को खुशियों से भर देती है।' },

      // Marathi Voices
      { id: 'mr-IN-AarohiNeural', name: 'Aarohi (आरोही - Storyteller)', lang: 'mr', gender: 'female', style: 'calm', desc: 'अत्यंत गोड आणि प्रेमळ मराठी कथाकथन आवाज़', sampleText: 'नमस्कार! एका निसर्गरम्य सुंदर जंगलात, एका छोट्या सशाने एक सुंदर गोष्ट शिकवली.' },
      { id: 'mr-IN-ManoharNeural', name: 'Manohar (मनोहर - Narrator)', lang: 'mr', gender: 'male', style: 'narrator', desc: 'भारदस्त आणि ओघवती मराठी सूत्रसंचालक आवाज़', sampleText: 'आपुलकी आणि प्रेम वाटल्याने आनंद नेहमी द्विगुणित होतो.' },
    ];
  }

  getVoices(lang = null) {
    if (lang) {
      return this.voices.filter(v => v.lang === lang);
    }
    return this.voices;
  }

  getVoiceById(voiceId, lang = null) {
    let found = this.voices.find(v => v.id === voiceId);
    if (!found) {
      if (lang === 'hi') {
        found = this.voices.find(v => v.lang === 'hi') || this.voices.find(v => v.id === 'hi-IN-SwaraNeural');
      } else if (lang === 'mr') {
        found = this.voices.find(v => v.lang === 'mr') || this.voices.find(v => v.id === 'mr-IN-AarohiNeural');
      } else {
        found = this.voices[0];
      }
    }
    // Strict language guard: if lang is explicitly Hindi, never allow English voice
    if (lang === 'hi' && found.lang !== 'hi') {
      return this.voices.find(v => v.id === 'hi-IN-SwaraNeural') || found;
    }
    if (lang === 'mr' && found.lang !== 'mr') {
      return this.voices.find(v => v.id === 'mr-IN-AarohiNeural') || found;
    }
    return found;
  }

  /**
   * Generates a preview sample for the voice library
   */
  async generateVoicePreview(voiceId) {
    const voice = this.getVoiceById(voiceId);
    const previewFilename = `preview_${voice.id}.mp3`;
    const previewPath = path.join(this.audioDir, previewFilename);

    if (fs.existsSync(previewPath) && fs.statSync(previewPath).size > 1000) {
      return {
        url: `/outputs/audio/${previewFilename}`,
        voiceId: voice.id,
        name: voice.name
      };
    }

    await this.synthesizeToFile(voice.sampleText, voice.id, previewPath);
    return {
      url: `/outputs/audio/${previewFilename}`,
      voiceId: voice.id,
      name: voice.name
    };
  }

  /**
   * Synthesizes audio to a target file path
   */
  async synthesizeToFile(text, voiceId, targetFilePath, lang = null) {
    const voice = this.getVoiceById(voiceId, lang);
    const tempDir = path.join(this.audioDir, `temp_${Date.now()}_${Math.floor(Math.random() * 10000)}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      // 1. Primary: Microsoft Edge Neural TTS
      console.log(`[TTSService] Synthesizing speech with voice ${voice.id} (${voice.name}, lang: ${voice.lang})...`);
      const tts = new MsEdgeTTS();
      await tts.setMetadata(voice.id, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      await tts.toFile(tempDir, text);
      const generatedFile = path.join(tempDir, 'audio.mp3');

      if (fs.existsSync(generatedFile) && fs.statSync(generatedFile).size > 500) {
        fs.copyFileSync(generatedFile, targetFilePath);
        fs.rmSync(tempDir, { recursive: true, force: true });
        return {
          success: true,
          duration: this.getAudioDuration(targetFilePath)
        };
      }
    } catch (edgeErr) {
      console.warn(`Edge TTS failed for ${voice.id} (${edgeErr.message}), falling back to Google TTS...`);
    } finally {
      if (fs.existsSync(tempDir)) {
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
      }
    }

    // 2. Secondary fallback: Google TTS API
    try {
      const langCode = voice.lang || lang || 'en';
      const url = googleTTS.getAudioUrl(text.slice(0, 200), {
        lang: langCode,
        slow: false,
        host: 'https://translate.google.com',
      });

      const response = await axios({
        method: 'get',
        url,
        responseType: 'arraybuffer',
        timeout: 10000
      });

      fs.writeFileSync(targetFilePath, response.data);
      return {
        success: true,
        duration: this.getAudioDuration(targetFilePath)
      };
    } catch (gErr) {
      console.warn(`Google TTS failed (${gErr.message}), synthesizing synthetic tone audio fallback.`);
      return this.generateSyntheticAudioFallback(text, targetFilePath);
    }
  }

  /**
   * Generates speech audio for a video scene
   */
  async generateSceneAudio({ projectId, sceneNumber, voiceoverText, voiceId, lang = null }) {
    const filename = `scene_${projectId}_${sceneNumber}.mp3`;
    const targetPath = path.join(this.audioDir, filename);

    const res = await this.synthesizeToFile(voiceoverText, voiceId, targetPath, lang);
    return {
      success: res.success,
      localPath: targetPath,
      webUrl: `/outputs/audio/${filename}`,
      duration: res.duration
    };
  }

  /**
   * General speech synthesis helper
   */
  async generateSpeech({ text, voiceId, language, lang }) {
    const filename = `speech_${Date.now()}_${Math.floor(Math.random() * 10000)}.mp3`;
    const targetPath = path.join(this.audioDir, filename);
    const res = await this.synthesizeToFile(text, voiceId, targetPath, language || lang);
    return {
      success: res.success,
      localPath: targetPath,
      webUrl: `/outputs/audio/${filename}`,
      duration: res.duration
    };
  }

  /**
   * Accurately parses audio duration in seconds using FFmpeg
   */
  getAudioDuration(filePath) {
    try {
      const res = spawnSync(config.ffmpegPath, ['-i', filePath]);
      const match = res.stderr.toString().match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
      if (match) {
        const hours = parseFloat(match[1]);
        const mins = parseFloat(match[2]);
        const secs = parseFloat(match[3]);
        return Math.max(1.5, hours * 3600 + mins * 60 + secs);
      }
    } catch (e) {
      console.warn('Could not read audio duration via FFmpeg:', e.message);
    }
    return 3.5; // Reasonable default
  }

  /**
   * Resilient fallback audio tone if completely offline
   */
  generateSyntheticAudioFallback(text, targetFilePath) {
    const estimatedSecs = Math.max(2, Math.min(8, Math.round(text.length * 0.08)));
    try {
      spawnSync(config.ffmpegPath, [
        '-f', 'lavfi',
        '-i', `sine=frequency=330:duration=${estimatedSecs}`,
        '-af', 'volume=0.3',
        '-c:a', 'libmp3lame',
        '-y',
        targetFilePath
      ]);
      return { success: true, duration: estimatedSecs };
    } catch (e) {
      return { success: false, duration: estimatedSecs };
    }
  }
}

export const ttsService = new TTSService();
export const generateSceneAudio = (args) => ttsService.generateSceneAudio(args);
