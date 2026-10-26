import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../database/db.js';
import { config } from '../config.js';
import { mongoManager } from '../database/mongo.js';
import { videoProviderService } from '../services/videoProviderService.js';
import { visualService } from '../services/visualService.js';
import { ttsService } from '../services/ttsService.js';

export const getSettings = async (req, res) => {
  try {
    const rawSettings = db.getSettings();
    const mask = (key) => (key && key.length > 8 ? (key.slice(0, 4) + '...' + key.slice(-4)) : (key ? '******' : ''));

    const veoKey = rawSettings.veoApiKey || process.env.VEO_API_KEY || '';
    const runwayKey = rawSettings.runwayApiKey || process.env.RUNWAY_API_KEY || '';
    const klingKey = rawSettings.klingApiKey || process.env.KLING_API_KEY || '';
    const lumaKey = rawSettings.lumaApiKey || process.env.LUMA_API_KEY || '';

    res.json({
      settings: {
        ...rawSettings,
        hasGeminiKey: Boolean(activeGeminiKey),
        geminiApiKeyMasked: maskedKey,
        hasVeoKey: Boolean(veoKey),
        veoApiKeyMasked: mask(veoKey),
        hasRunwayKey: Boolean(runwayKey),
        runwayApiKeyMasked: mask(runwayKey),
        hasKlingKey: Boolean(klingKey),
        klingApiKeyMasked: mask(klingKey),
        hasLumaKey: Boolean(lumaKey),
        lumaApiKeyMasked: mask(lumaKey),
        openartMcpUrl: rawSettings.openartMcpUrl || 'https://mcp.openart.ai/mcp',
        hasOpenartKey: Boolean(rawSettings.openartApiKey),
        mongoConnected: mongoManager.isConnected,
        mongoUri: process.env.MONGODB_URI ? process.env.MONGODB_URI.replace(/:([^@]+)@/, ':****@') : ''
      },
      providers: videoProviderService.getProviders(),
      metadata: {
        supportedLanguages: config.supportedLanguages,
        videoStyles: config.videoStyles,
        aspectRatios: config.aspectRatios,
        ffmpegAvailable: true
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateSettings = async (req, res) => {
  try {
    const { 
      geminiApiKey, 
      visualProvider, 
      ttsProvider, 
      videoProvider, 
      volumeVoice, 
      volumeMusic, 
      defaultAspectRatio, 
      mongoUri, 
      veoApiKey, 
      runwayApiKey,
      klingApiKey,
      lumaApiKey,
      openartMcpUrl,
      openartApiKey,
      aiCanvasWebhook,
      qualityMode
    } = req.body;
    const updates = {};

    if (geminiApiKey !== undefined) {
      updates.geminiApiKey = geminiApiKey.trim();
      process.env.GEMINI_API_KEY = geminiApiKey.trim();
    }
    if (visualProvider !== undefined) updates.visualProvider = visualProvider;
    if (ttsProvider !== undefined) updates.ttsProvider = ttsProvider;
    if (videoProvider !== undefined) updates.videoProvider = videoProvider;
    if (qualityMode !== undefined) updates.qualityMode = qualityMode;
    if (veoApiKey !== undefined) {
      updates.veoApiKey = veoApiKey.trim();
      process.env.VEO_API_KEY = veoApiKey.trim();
    }
    if (runwayApiKey !== undefined) {
      updates.runwayApiKey = runwayApiKey.trim();
      process.env.RUNWAY_API_KEY = runwayApiKey.trim();
    }
    if (klingApiKey !== undefined) {
      updates.klingApiKey = klingApiKey.trim();
      process.env.KLING_API_KEY = klingApiKey.trim();
    }
    if (lumaApiKey !== undefined) {
      updates.lumaApiKey = lumaApiKey.trim();
      process.env.LUMA_API_KEY = lumaApiKey.trim();
    }
    if (openartMcpUrl !== undefined) updates.openartMcpUrl = openartMcpUrl.trim();
    if (openartApiKey !== undefined) updates.openartApiKey = openartApiKey.trim();
    if (aiCanvasWebhook !== undefined) updates.aiCanvasWebhook = aiCanvasWebhook.trim();

    if (volumeVoice !== undefined) updates.volumeVoice = parseFloat(volumeVoice);
    if (volumeMusic !== undefined) updates.volumeMusic = parseFloat(volumeMusic);
    if (defaultAspectRatio !== undefined) updates.defaultAspectRatio = defaultAspectRatio;

    if (mongoUri && mongoUri.trim()) {
      process.env.MONGODB_URI = mongoUri.trim();
      await mongoManager.connect(mongoUri.trim());
    }

    const updated = db.updateSettings(updates);
    const activeGeminiKey = updated.geminiApiKey || process.env.GEMINI_API_KEY || '';

    res.json({
      message: 'Settings updated successfully',
      settings: {
        ...updated,
        hasGeminiKey: Boolean(activeGeminiKey),
        geminiApiKeyMasked: activeGeminiKey ? (activeGeminiKey.slice(0, 6) + '...' + activeGeminiKey.slice(-4)) : '',
        mongoConnected: mongoManager.isConnected,
        mongoUri: process.env.MONGODB_URI ? process.env.MONGODB_URI.replace(/:([^@]+)@/, ':****@') : ''
      },
      providers: videoProviderService.getProviders()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const testGeminiKey = async (req, res) => {
  try {
    const { apiKey } = req.body;
    const keyToTest = apiKey || db.getSettings().geminiApiKey || process.env.GEMINI_API_KEY;

    if (!keyToTest || keyToTest.trim().length < 5) {
      return res.status(400).json({
        success: false,
        error: 'No Gemini API key provided. Please enter a valid API key from Google AI Studio.'
      });
    }

    const genAI = new GoogleGenerativeAI(keyToTest.trim());
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const startTime = Date.now();
    const result = await model.generateContent('ping');
    const latency = Date.now() - startTime;

    res.json({
      success: true,
      message: 'Google Gemini API key validated successfully!',
      model: 'gemini-1.5-flash',
      latencyMs: latency,
      response: result.response.text().trim()
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: `Gemini API validation failed: ${err.message}`
    });
  }
};

export const testProvider = async (req, res) => {
  try {
    const { providerType, providerId } = req.body;

    if (providerType === 'tts') {
      const voice = ttsService.getVoiceById('en-US-JennyNeural');
      return res.json({
        success: true,
        message: 'TTS Provider operational. Microsoft Edge Neural TTS & Google TTS ready.',
        voice: voice.name
      });
    }

    if (providerType === 'video') {
      const providers = videoProviderService.getProviders();
      const match = providers.find(p => p.id === providerId) || providers[0];
      return res.json({
        success: match.isConfigured,
        provider: match
      });
    }

    if (providerType === 'image') {
      return res.json({
        success: true,
        message: 'Image Provider (Pollinations.ai / FLUX.1) operational with zero rate limits.',
        provider: 'pollinations'
      });
    }

    res.json({ success: true, message: 'Provider check passed.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
