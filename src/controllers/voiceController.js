import { ttsService } from '../services/ttsService.js';
import { musicService } from '../services/musicService.js';

export const getVoices = async (req, res) => {
  try {
    const { lang } = req.query;
    const voices = ttsService.getVoices(lang);
    res.json(voices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const previewVoice = async (req, res) => {
  try {
    const { voiceId } = req.body;
    if (!voiceId) {
      return res.status(400).json({ error: 'voiceId is required' });
    }

    const preview = await ttsService.generateVoicePreview(voiceId);
    res.json(preview);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getMusicTracks = async (req, res) => {
  try {
    const tracks = musicService.getMusicTracks();
    res.json(tracks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
