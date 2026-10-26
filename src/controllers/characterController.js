import { v4 as uuidv4 } from 'uuid';
import { db } from '../database/db.js';

export const getCharacters = async (req, res) => {
  try {
    const userId = req.user?.id;
    const characters = db.getCharacters(userId);
    res.json(characters);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getCharacterById = async (req, res) => {
  try {
    const character = db.getCharacterById(req.params.id);
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }
    res.json(character);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const createCharacter = async (req, res) => {
  try {
    const { name, type, age, appearance, color, personality, voiceType, artStyle, referenceImage } = req.body;

    if (!name || !appearance) {
      return res.status(400).json({ error: 'Character name and appearance description are required' });
    }

    const newChar = {
      id: `char-${uuidv4().slice(0, 8)}`,
      userId: req.user?.id || 'usr-demo-001',
      name: name.trim(),
      type: type || 'human',
      age: age || 'Young',
      appearance: appearance.trim(),
      color: color || '',
      personality: personality || '',
      voiceType: voiceType || 'narrator',
      artStyle: artStyle || '3d_animation',
      referenceImage: referenceImage || null,
      referencePrompt: `${name.trim()}, a ${age || ''} ${type || 'character'}, ${appearance.trim()}, ${color ? 'colors: ' + color : ''}, art style: ${artStyle || '3d_animation'}`
    };

    db.saveCharacter(newChar);
    res.status(201).json(newChar);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateCharacter = async (req, res) => {
  try {
    const char = db.getCharacterById(req.params.id);
    if (!char) {
      return res.status(404).json({ error: 'Character not found' });
    }

    const { name, type, age, appearance, color, personality, voiceType, artStyle, referenceImage } = req.body;
    const updated = {
      ...char,
      name: name !== undefined ? name.trim() : char.name,
      type: type !== undefined ? type : char.type,
      age: age !== undefined ? age : char.age,
      appearance: appearance !== undefined ? appearance.trim() : char.appearance,
      color: color !== undefined ? color : char.color,
      personality: personality !== undefined ? personality : char.personality,
      voiceType: voiceType !== undefined ? voiceType : char.voiceType,
      artStyle: artStyle !== undefined ? artStyle : char.artStyle,
      referenceImage: referenceImage !== undefined ? referenceImage : char.referenceImage,
      referencePrompt: `${name || char.name}, a ${age || char.age} ${type || char.type}, ${appearance || char.appearance}`
    };

    db.saveCharacter(updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const regenerateCharacterRef = async (req, res) => {
  try {
    const char = db.getCharacterById(req.params.id);
    if (!char) {
      return res.status(404).json({ error: 'Character not found' });
    }

    const { visualService } = await import('../services/visualService.js');
    const refResult = await visualService.generateCharacterReferenceSheet({
      character: char,
      style: char.artStyle || '3d_animation'
    });

    char.referenceImage = refResult.primaryRefUrl;
    char.referenceSheet = refResult.sheetUrl;
    char.views = refResult.views;

    db.saveCharacter(char);
    res.json({
      message: `Reference images regenerated for ${char.name}`,
      character: char,
      views: refResult.views
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteCharacter = async (req, res) => {
  try {
    const success = db.deleteCharacter(req.params.id, req.user?.id);
    if (!success) {
      return res.status(404).json({ error: 'Character not found or unauthorized' });
    }
    res.json({ message: 'Character deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

