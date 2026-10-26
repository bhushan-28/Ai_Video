import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { UserModel } from './models/User.js';
import { CharacterModel } from './models/Character.js';
import { ProjectModel } from './models/Project.js';
import { SettingModel } from './models/Setting.js';

dotenv.config();

class MongoManager {
  constructor() {
    this.isConnected = false;
    // Prevent unhandled error events from terminating Node
    mongoose.connection.on('error', (err) => {
      console.warn(`[MongoDB Warning]: ${err.message}`);
      this.isConnected = false;
    });
    mongoose.connection.on('disconnected', () => {
      this.isConnected = false;
    });
    // Disable command buffering so queries fail immediately or fall back cleanly
    mongoose.set('bufferCommands', false);
  }

  async connect(customUri = null) {
    const targetUri = customUri || process.env.MONGODB_URI;
    if (!targetUri) {
      console.log('ℹ️  MONGODB_URI not provided. Running in resilient local file storage mode.');
      this.isConnected = false;
      return false;
    }

    if (targetUri.includes('<db_username>')) {
      console.warn('⚠️  MONGODB_URI contains placeholder "<db_username>". Operating in resilient local storage mode.');
      this.isConnected = false;
      return false;
    }

    try {
      console.log('Connecting to MongoDB Atlas cluster...');
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect().catch(() => {});
      }

      await mongoose.connect(targetUri, {
        serverSelectionTimeoutMS: 4000,
        connectTimeoutMS: 4000,
      });

      if (mongoose.connection.readyState === 1) {
        this.isConnected = true;
        console.log('✅ Connected to MongoDB Atlas successfully!');
        await this.seedInitialDataIfEmpty();
        return true;
      } else {
        throw new Error('MongoDB connection state: ' + mongoose.connection.readyState);
      }
    } catch (err) {
      console.warn(`⚠️  MongoDB connection failed (${err.message}). Seamlessly operating in resilient local storage mode.`);
      this.isConnected = false;
      return false;
    }
  }

  async seedInitialDataIfEmpty() {
    if (!this.isConnected || mongoose.connection.readyState !== 1) return;
    try {
      const charCount = await CharacterModel.countDocuments();
      if (charCount === 0) {
        console.log('Seeding initial characters to MongoDB...');
        await CharacterModel.insertMany([
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
          }
        ]);
      }
    } catch (e) {
      console.warn('Seed check failed:', e.message);
    }
  }

  // MongoDB Operations
  async saveUser(user) {
    if (!this.isConnected) return;
    try {
      await UserModel.findOneAndUpdate({ id: user.id }, user, { upsert: true });
    } catch (e) {
      console.warn('Mongo saveUser error:', e.message);
    }
  }

  async saveCharacter(char) {
    if (!this.isConnected) return;
    try {
      await CharacterModel.findOneAndUpdate({ id: char.id }, char, { upsert: true });
    } catch (e) {
      console.warn('Mongo saveCharacter error:', e.message);
    }
  }

  async deleteCharacter(id) {
    if (!this.isConnected) return;
    try {
      await CharacterModel.deleteOne({ id });
    } catch (e) {
      console.warn('Mongo deleteCharacter error:', e.message);
    }
  }

  async saveProject(project) {
    if (!this.isConnected) return;
    try {
      await ProjectModel.findOneAndUpdate({ id: project.id }, project, { upsert: true });
    } catch (e) {
      console.warn('Mongo saveProject error:', e.message);
    }
  }

  async deleteProject(id) {
    if (!this.isConnected) return;
    try {
      await ProjectModel.deleteOne({ id });
    } catch (e) {
      console.warn('Mongo deleteProject error:', e.message);
    }
  }

  async saveSettings(settings) {
    if (!this.isConnected) return;
    try {
      await SettingModel.findOneAndUpdate({}, settings, { upsert: true });
    } catch (e) {
      console.warn('Mongo saveSettings error:', e.message);
    }
  }
}

export const mongoManager = new MongoManager();
