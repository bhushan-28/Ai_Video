import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import ffmpegPath from 'ffmpeg-static';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load .env
dotenv.config({ path: path.join(rootDir, '.env') });

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'ai-video-generator-jwt-secret-key-2026',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  storageDir: path.resolve(rootDir, process.env.STORAGE_DIR || 'outputs'),
  assetsDir: path.resolve(rootDir, 'assets'),
  ffmpegPath: ffmpegPath || 'ffmpeg',
  supportedLanguages: [
    { code: 'en', name: 'English', native: 'English', defaultVoice: 'en-US-GuyNeural' },
    { code: 'hi', name: 'Hindi', native: 'हिन्दी', defaultVoice: 'hi-IN-SwaraNeural' },
    { code: 'mr', name: 'Marathi', native: 'मराठी', defaultVoice: 'mr-IN-AarohiNeural' },
  ],
  aspectRatios: {
    '9:16': { width: 1080, height: 1920, label: 'YouTube Shorts (9:16)' },
    '16:9': { width: 1920, height: 1080, label: 'YouTube Video (16:9)' },
    '1:1': { width: 1080, height: 1080, label: 'Square (1:1)' },
  },
  videoStyles: [
    { id: '3d_animation', label: 'High-Quality 3D Animation', promptSuffix: 'high-quality 3D Disney Pixar animated cartoon style, Octane 3D render, expressive facial features, raytraced volumetric lighting, vivid textures, subsurface scattering, cinema 4D masterpiece' },
    { id: 'cute_animals', label: 'Cute Animals', promptSuffix: 'adorable cute 3D cartoon animal characters, detailed fluffy fur texture, glossy expressive warm eyes, charming woodland wildlife, Pixar animated feature style, bright joyful lighting, vibrant 8k' },
    { id: 'fantasy', label: 'Fantasy & Magic', promptSuffix: 'magical fantasy 3D animation, enchanted glowing flora, magical sparkles and floating particles, mystical fairytale environment, dreamy atmospheric lighting, legendary storybook aesthetic, 8k render' },
    { id: 'children_stories', label: "Children's Stories", promptSuffix: "heartwarming children's storybook 3D cartoon illustration, friendly lovable characters, gentle pastel-vibrant colors, whimsical cozy atmosphere, moral bedtime story aesthetic, 8k" },
    { id: 'cartoon', label: 'Cartoon / 2D Animation', promptSuffix: 'vibrant 2D cartoon animation style, colorful, expressive, Disney and Pixar inspired art' },
    { id: 'storytelling', label: 'Storybook Illustration', promptSuffix: 'storybook digital watercolor and gouache illustration, whimsical, warm inviting atmosphere, magical children book art' },
    { id: 'cinematic', label: 'Cinematic Movie Style', promptSuffix: 'cinematic still, dramatic anamorphic lighting, blockbuster movie production, shallow depth of field, 8k resolution' },
    { id: 'realistic', label: 'Realistic / Photorealistic', promptSuffix: 'photorealistic 8k, ultra-detailed photograph, natural cinematic lighting, shot on 35mm lens, hyper-realistic' },
    { id: 'educational', label: 'Educational / Infographic', promptSuffix: 'clean modern educational vector illustration, minimalist, colorful infographic visuals, clear crisp details' },
    { id: 'motivational', label: 'Motivational / Inspiring', promptSuffix: 'epic heroic dramatic lighting, golden hour sunrise, atmospheric mist, inspiring cinematic concept art' }
  ]
};

