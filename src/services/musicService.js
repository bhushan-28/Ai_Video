import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { config } from '../config.js';

class MusicService {
  constructor() {
    this.musicDir = path.join(config.assetsDir, 'music');
    if (!fs.existsSync(this.musicDir)) {
      fs.mkdirSync(this.musicDir, { recursive: true });
    }

    this.tracks = [
      { id: 'calm_acoustic', name: 'Gentle Acoustic Story', mood: 'Calm & Heartwarming', bpm: 85, filename: 'calm_acoustic.mp3' },
      { id: 'upbeat_energetic', name: 'Upbeat Adventure', mood: 'Energetic & Inspiring', bpm: 120, filename: 'upbeat_energetic.mp3' },
      { id: 'cinematic_epic', name: 'Cinematic Wonder', mood: 'Dramatic & Epic', bpm: 95, filename: 'cinematic_epic.mp3' },
      { id: 'playful_cartoon', name: 'Playful Whimsical Bounce', mood: 'Fun & Cartoon', bpm: 110, filename: 'playful_cartoon.mp3' },
      { id: 'lofi_ambient', name: 'Peaceful Forest Ambient', mood: 'Chill & Atmospheric', bpm: 75, filename: 'lofi_ambient.mp3' },
      { id: 'none', name: 'No Background Music', mood: 'Muted', bpm: 0, filename: null }
    ];

    // Ensure initial audio tracks exist
    this.initializeDefaultTracks();
  }

  getMusicTracks() {
    return this.tracks.map(t => ({
      ...t,
      previewUrl: t.filename ? `/outputs/music/${t.filename}` : null
    }));
  }

  getTrackById(id) {
    return this.tracks.find(t => t.id === id) || this.tracks[0];
  }

  /**
   * Generates pleasing procedural ambient chord tracks using FFmpeg audio synthesis
   */
  initializeDefaultTracks() {
    // Also link or copy to outputs for static serving
    const outputMusicDir = path.join(config.storageDir, 'music');
    if (!fs.existsSync(outputMusicDir)) {
      fs.mkdirSync(outputMusicDir, { recursive: true });
    }

    const synthesizers = {
      calm_acoustic: {
        filter: 'aevalsrc=exprs=0.08*sin(2*PI*261.63*t)+0.06*sin(2*PI*329.63*t)+0.05*sin(2*PI*392*t)+0.04*sin(2*PI*523.25*t):s=44100:d=45',
        fade: 'afade=t=in:ss=0:d=2,afade=t=out:st=42:d=3'
      },
      upbeat_energetic: {
        filter: 'aevalsrc=exprs=0.07*sin(2*PI*293.66*t)+0.06*sin(2*PI*369.99*t)+0.05*sin(2*PI*440*t)+0.03*sin(2*PI*587.33*t*(1+0.05*sin(8*PI*t))):s=44100:d=45',
        fade: 'afade=t=in:ss=0:d=1.5,afade=t=out:st=42:d=3'
      },
      cinematic_epic: {
        filter: 'aevalsrc=exprs=0.10*sin(2*PI*130.81*t)+0.07*sin(2*PI*196*t)+0.06*sin(2*PI*261.63*t)+0.05*sin(2*PI*311.13*t):s=44100:d=45',
        fade: 'afade=t=in:ss=0:d=3,afade=t=out:st=41:d=4'
      },
      playful_cartoon: {
        filter: 'aevalsrc=exprs=0.06*sin(2*PI*349.23*t)+0.05*sin(2*PI*440*t)+0.05*sin(2*PI*523.25*t*(1+0.08*sin(6*PI*t))):s=44100:d=45',
        fade: 'afade=t=in:ss=0:d=1,afade=t=out:st=43:d=2'
      },
      lofi_ambient: {
        filter: 'aevalsrc=exprs=0.06*sin(2*PI*174.61*t)+0.05*sin(2*PI*220*t)+0.04*sin(2*PI*261.63*t)+0.03*sin(2*PI*329.63*t):s=44100:d=45',
        fade: 'afade=t=in:ss=0:d=3,afade=t=out:st=41:d=4'
      }
    };

    for (const [key, spec] of Object.entries(synthesizers)) {
      const assetPath = path.join(this.musicDir, `${key}.mp3`);
      const webPath = path.join(outputMusicDir, `${key}.mp3`);

      if (!fs.existsSync(assetPath) || fs.statSync(assetPath).size < 1000) {
        try {
          console.log(`Generating background music track: ${key}...`);
          spawnSync(config.ffmpegPath, [
            '-f', 'lavfi',
            '-i', spec.filter,
            '-af', spec.fade,
            '-c:a', 'libmp3lame',
            '-b:a', '128k',
            '-y',
            assetPath
          ]);
        } catch (e) {
          console.warn(`Could not synthesize music track ${key}:`, e.message);
        }
      }

      if (fs.existsSync(assetPath)) {
        try {
          fs.copyFileSync(assetPath, webPath);
        } catch (_) {}
      }
    }
  }

  getMusicFilePath(trackId) {
    if (!trackId || trackId === 'none') return null;
    const track = this.getTrackById(trackId);
    if (!track || !track.filename) return null;
    const p = path.join(this.musicDir, track.filename);
    return fs.existsSync(p) ? p : null;
  }
}

export const musicService = new MusicService();
