import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { mongoManager } from './mongo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '../../data');
const dbFile = path.join(dataDir, 'db.json');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initial default state
const getInitialData = () => {
  const salt = bcrypt.genSaltSync(10);
  const demoPasswordHash = bcrypt.hashSync('demo1234', salt);

  return {
    users: [
      {
        id: 'usr-demo-001',
        name: 'Demo Creator',
        email: 'demo@aivideo.com',
        passwordHash: demoPasswordHash,
        credits: 100,
        createdAt: new Date().toISOString()
      }
    ],
    characters: [
      {
        id: 'char-rabbit-01',
        userId: 'usr-demo-001',
        name: 'Barnaby the Rabbit',
        type: 'animal',
        age: 'Young rabbit',
        appearance: 'Fluffy cream-colored rabbit with long floppy ears, warm brown expressive eyes, wearing a tiny emerald green knitted scarf',
        color: 'Cream and white with soft pink nose',
        personality: 'Gentle, generous, kind-hearted, always willing to share',
        voiceType: 'childlike',
        artStyle: '3d_animation',
        referencePrompt: 'cute fluffy cream-colored rabbit wearing a tiny emerald green scarf, large expressive warm eyes, 3D Pixar character design',
        referenceImage: null,
        createdAt: new Date().toISOString()
      },
      {
        id: 'char-squirrel-02',
        userId: 'usr-demo-001',
        name: 'Pip the Squirrel',
        type: 'animal',
        age: 'Baby squirrel',
        appearance: 'Tiny reddish-brown squirrel with an oversized bushy tail and curious shiny black eyes',
        color: 'Chestnut red and warm beige belly',
        personality: 'Energetic, curious, grateful, shy at first',
        voiceType: 'energetic',
        artStyle: '3d_animation',
        referencePrompt: 'tiny cute reddish-brown baby squirrel with huge fluffy tail and shiny black eyes, 3D animated movie character style',
        referenceImage: null,
        createdAt: new Date().toISOString()
      },
      {
        id: 'char-arav-03',
        userId: 'usr-demo-001',
        name: 'Aarav (Indian Boy)',
        type: 'human',
        age: '10 years old',
        appearance: 'Young Indian boy with messy dark curly hair, bright curious smile, wearing a mustard yellow hoodie and blue jeans',
        color: 'Warm brown skin tone, dark brown eyes',
        personality: 'Smart, observant, adventurous, loves science and folk stories',
        voiceType: 'childlike',
        artStyle: 'cartoon',
        referencePrompt: '10-year-old Indian boy with curly black hair, cheerful expressive eyes, wearing a mustard yellow hoodie, vibrant cartoon animation style',
        referenceImage: null,
        createdAt: new Date().toISOString()
      },
      {
        id: 'char-guru-04',
        userId: 'usr-demo-001',
        name: 'Grandmother Shanta',
        type: 'human',
        age: '65 years old',
        appearance: 'Kind elderly Indian grandmother with silver hair tied in a neat bun, gentle smile, wearing a traditional green cotton saree',
        color: 'Warm skin tone, wise gentle eyes',
        personality: 'Wise, loving storyteller, calm and encouraging',
        voiceType: 'storytelling',
        artStyle: 'storytelling',
        referencePrompt: 'Elderly kind Indian grandmother with silver hair, gentle smiling face, wearing traditional green cotton saree, warm storybook art style',
        referenceImage: null,
        createdAt: new Date().toISOString()
      }
    ],
    projects: [],
    settings: {
      geminiApiKey: process.env.GEMINI_API_KEY || '',
      visualProvider: 'pollinations',
      ttsProvider: 'edge',
      volumeVoice: 1.0,
      volumeMusic: 0.18,
      defaultAspectRatio: '9:16',
      totalVideosGenerated: 0
    }
  };
};

class Database {
  constructor() {
    this.data = this.load();
  }

  load() {
    try {
      if (fs.existsSync(dbFile)) {
        const raw = fs.readFileSync(dbFile, 'utf8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error('Failed to load db.json, recreating defaults:', e.message);
    }
    const initial = getInitialData();
    this.save(initial);
    return initial;
  }

  save(data = this.data) {
    try {
      fs.writeFileSync(dbFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to save db.json:', e.message);
    }
  }

  // Users
  findUserByEmail(email) {
    return this.data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  findUserById(id) {
    return this.data.users.find(u => u.id === id);
  }

  createUser(userData) {
    this.data.users.push(userData);
    this.save();
    mongoManager.saveUser(userData);
    return userData;
  }

  // Characters
  getCharacters(userId) {
    return this.data.characters.filter(c => !c.userId || c.userId === userId || c.userId === 'usr-demo-001');
  }

  getCharacterById(id) {
    return this.data.characters.find(c => c.id === id);
  }

  saveCharacter(char) {
    const idx = this.data.characters.findIndex(c => c.id === char.id);
    if (idx >= 0) {
      this.data.characters[idx] = { ...this.data.characters[idx], ...char, updatedAt: new Date().toISOString() };
    } else {
      this.data.characters.unshift({ ...char, createdAt: new Date().toISOString() });
    }
    this.save();
    mongoManager.saveCharacter(char);
    return char;
  }

  deleteCharacter(id, userId) {
    const idx = this.data.characters.findIndex(c => c.id === id && (c.userId === userId || !userId));
    if (idx >= 0) {
      this.data.characters.splice(idx, 1);
      this.save();
      mongoManager.deleteCharacter(id);
      return true;
    }
    return false;
  }

  // Projects / Videos
  getProjects(userId) {
    return this.data.projects
      .filter(p => !userId || p.userId === userId || p.userId === 'usr-demo-001')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  getProjectById(id) {
    return this.data.projects.find(p => p.id === id);
  }

  saveProject(project) {
    const idx = this.data.projects.findIndex(p => p.id === project.id);
    if (idx >= 0) {
      this.data.projects[idx] = { ...this.data.projects[idx], ...project, updatedAt: new Date().toISOString() };
    } else {
      this.data.projects.unshift({ ...project, createdAt: new Date().toISOString() });
    }
    this.save();
    mongoManager.saveProject(project);
    return project;
  }

  updateProjectStatus(id, updateData) {
    const project = this.getProjectById(id);
    if (project) {
      Object.assign(project, updateData, { updatedAt: new Date().toISOString() });
      this.save();
      mongoManager.saveProject(project);
      return project;
    }
    return null;
  }

  deleteProject(id, userId) {
    const idx = this.data.projects.findIndex(p => p.id === id && (!userId || p.userId === userId));
    if (idx >= 0) {
      this.data.projects.splice(idx, 1);
      this.save();
      mongoManager.deleteProject(id);
      return true;
    }
    return false;
  }

  // Settings
  getSettings() {
    return this.data.settings;
  }

  updateSettings(newSettings) {
    this.data.settings = { ...this.data.settings, ...newSettings };
    this.save();
    mongoManager.saveSettings(this.data.settings);
    return this.data.settings;
  }
}

export const db = new Database();
