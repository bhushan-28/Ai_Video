import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  title: { type: String, default: 'Untitled Project' },
  description: { type: String, default: '' },
  topic: { type: String, default: '' },
  style: { type: String, default: '3d_animation' },
  duration: { type: Number, default: 0 },
  estimatedDuration: { type: Number, default: 0 },
  finalDuration: { type: Number, default: 0 },
  aspectRatio: { type: String, default: '9:16' },
  language: { type: String, default: 'en' },
  voiceId: { type: String, default: 'en-US-GuyNeural' },
  musicMood: { type: String, default: 'calm_acoustic' },
  videoProvider: { type: String, default: 'local_motion_engine' },
  characterId: { type: String, default: null },
  characters: { type: Array, default: [] },
  scenes: { type: Array, default: [] },
  isScriptApproved: { type: Boolean, default: false },
  status: { type: String, default: 'queued' },
  progress: { type: Number, default: 0 },
  currentStage: { type: String, default: 'Queued...' },
  videoUrl: { type: String, default: null },
  subtitleUrl: { type: String, default: null },
  srtContent: { type: String, default: null },
  validation: { type: Object, default: null },
  error: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const ProjectModel = mongoose.models.Project || mongoose.model('Project', projectSchema);
