import mongoose from 'mongoose';

const characterSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  name: { type: String, required: true },
  type: { type: String, default: 'human' },
  age: { type: String, default: 'Young' },
  appearance: { type: String, required: true },
  color: { type: String, default: '' },
  personality: { type: String, default: '' },
  voiceType: { type: String, default: 'narrator' },
  artStyle: { type: String, default: '3d_animation' },
  referencePrompt: { type: String, default: '' },
  referenceImage: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const CharacterModel = mongoose.models.Character || mongoose.model('Character', characterSchema);
