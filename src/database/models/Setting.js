import mongoose from 'mongoose';

const settingSchema = new mongoose.Schema({
  geminiApiKey: { type: String, default: '' },
  visualProvider: { type: String, default: 'pollinations' },
  ttsProvider: { type: String, default: 'edge' },
  volumeVoice: { type: Number, default: 1.0 },
  volumeMusic: { type: Number, default: 0.16 },
  defaultAspectRatio: { type: String, default: '9:16' },
  totalVideosGenerated: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
});

export const SettingModel = mongoose.models.Setting || mongoose.model('Setting', settingSchema);
