import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../database/db.js';
import { config } from '../config.js';

class GeminiService {
  getApiKey(userApiKey) {
    if (userApiKey && userApiKey.trim().length > 5) return userApiKey.trim();
    const settings = db.getSettings();
    if (settings.geminiApiKey && settings.geminiApiKey.trim().length > 5) return settings.geminiApiKey.trim();
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 5) return process.env.GEMINI_API_KEY.trim();
    return null;
  }

  getClient(userApiKey) {
    const key = this.getApiKey(userApiKey);
    if (!key) return null;
    return new GoogleGenerativeAI(key);
  }

  /**
   * Improves a raw user prompt into a cinematic concept
   */
  async improvePrompt({ prompt, style = '3d_animation', duration = 30, language = 'en', character = null, userApiKey = null }) {
    const client = this.getClient(userApiKey);
    const styleObj = config.videoStyles.find(s => s.id === style) || config.videoStyles[1];
    const langObj = config.supportedLanguages.find(l => l.code === language) || config.supportedLanguages[0];

    if (!client) {
      console.log('Gemini API key not configured, using intelligent procedural prompt expansion.');
      return this.generateProceduralPromptEnhancement(prompt, styleObj, duration, langObj, character);
    }

    try {
      const model = client.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const systemInstruction = `You are an elite YouTube Shorts AI Video Director and Scriptwriter.
Transform the user's raw video idea into an ultra-engaging, viral concept for a ${duration}-second video.
Language: ${langObj.name} (${langObj.native}).
Art Style: ${styleObj.label} (${styleObj.promptSuffix}).
${character ? `Main Character: ${character.name} (${character.appearance}, personality: ${character.personality})` : ''}

Return ONLY valid JSON with no markdown wrapping or backticks. Format:
{
  "improvedPrompt": "Richly detailed visual and narrative description of the video concept",
  "suggestedTitle": "Catchy YouTube Shorts Title with emoji",
  "hook": "The first 3 seconds hook to stop the scroll",
  "narrativeArc": "Brief synopsis of beginning, climax, and emotional ending or moral",
  "visualTheme": "Color palette, lighting, and camera aesthetics",
  "musicMood": "One of: calm_acoustic, upbeat_energetic, cinematic_epic, playful_cartoon, lofi_ambient",
  "recommendedVoice": "Recommended voice style (e.g. Warm Storyteller, Energetic, Childlike)",
  "keywords": ["tag1", "tag2", "tag3"]
}`;

      const result = await model.generateContent([
        { text: systemInstruction },
        { text: `Raw User Idea: "${prompt}"` }
      ]);

      const responseText = result.response.text();
      const cleaned = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      return JSON.parse(cleaned);
    } catch (err) {
      console.warn('Gemini improvePrompt failed, falling back to intelligent procedural enhancement:', err.message);
      return this.generateProceduralPromptEnhancement(prompt, styleObj, duration, langObj, character);
    }
  }

  /**
   * Generates scene-by-scene storyboard
   */
  async generateScript({ prompt, style = '3d_animation', duration = 30, language = 'en', character = null, aspectRatio = '9:16', userApiKey = null }) {
    const client = this.getClient(userApiKey);
    const styleObj = config.videoStyles.find(s => s.id === style) || config.videoStyles[1];
    const langObj = config.supportedLanguages.find(l => l.code === language) || config.supportedLanguages[0];
    const numScenes = duration <= 15 ? 4 : duration <= 30 ? 6 : duration <= 45 ? 8 : 10;

    if (!client) {
      console.log('Gemini API key not configured, using intelligent procedural storyboard generator.');
      return this.generateProceduralStoryboard(prompt, styleObj, duration, numScenes, langObj, character, aspectRatio);
    }

    try {
      const model = client.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const promptText = `You are a professional AI video generator and storyboard artist.
Create a complete scene-by-scene storyboard for a ${duration}-second YouTube Shorts video (${aspectRatio} aspect ratio).
Language for voiceover & subtitles: ${langObj.name} (${langObj.native}).
CRITICAL FOR HINDI & MARATHI: Write the "voiceoverText" and "subtitleText" in proper, natural, native DEVANAGARI SCRIPT (e.g. for Hindi use हिन्दी, for Marathi use मराठी). Ensure pronunciation is natural when read aloud by TTS.
Visual Art Style: ${styleObj.label} (${styleObj.promptSuffix}).
${character ? `CHARACTER CONSISTENCY MANDATE: You MUST include the character description in EVERY scene visual prompt: "${character.name}, a ${character.appearance}, ${character.color}"` : ''}

Generate exactly ${numScenes} scenes. Total duration must add up to approximately ${duration} seconds.

Return ONLY pure valid JSON (no markdown formatting, no backticks):
{
  "title": "Engaging Title",
  "description": "Engaging YouTube Shorts description with hashtags",
  "musicMood": "One of: calm_acoustic, upbeat_energetic, cinematic_epic, playful_cartoon, lofi_ambient",
  "moralOrEnding": "Ending takeaway or CTA",
  "characterConsistencyPrompt": "${character ? character.name + ' - ' + character.appearance : ''}",
  "scenes": [
    {
      "sceneNumber": 1,
      "estimatedDuration": 4.5,
      "visualPrompt": "Ultra-detailed visual prompt for AI image generator. Describe subject, environment, lighting, angle, and art style (${styleObj.promptSuffix}).",
      "voiceoverText": "Exact text spoken in ${langObj.name} (use authentic native script)",
      "subtitleText": "Punchy on-screen caption (1-2 short lines in ${langObj.name})",
      "cameraDirection": "e.g. Slow zoom in / Wide pan / Dramatic close-up",
      "soundEffect": "e.g. birds chirping / whoosh / magic sparkle"
    }
  ]
}

User Topic / Story: "${prompt}"`;

      const result = await model.generateContent(promptText);
      const text = result.response.text();
      const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      // Validate scenes
      if (!parsed.scenes || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
        throw new Error('Invalid scene array returned by Gemini');
      }

      return parsed;
    } catch (err) {
      console.warn('Gemini script generation failed, using procedural fallback:', err.message);
      return this.generateProceduralStoryboard(prompt, styleObj, duration, numScenes, langObj, character, aspectRatio);
    }
  }

  /**
   * Procedural prompt enhancement when Gemini API is pending configuration or offline
   */
  generateProceduralPromptEnhancement(prompt, styleObj, duration, langObj, character) {
    const charName = character ? character.name : 'our adorable protagonist';
    return {
      improvedPrompt: `In a vivid and breathtaking animated world rendered in ${styleObj.label}, ${prompt}. The story follows ${charName} navigating a heartwarming adventure filled with wonder, warmth, and an inspiring life lesson. Visualized with masterwork lighting, expressive emotion, and cinematic framing.`,
      suggestedTitle: `✨ The Story of ${charName}: A Heartwarming Journey 🌟 #Shorts`,
      hook: `Watch what happens when kindness transforms an ordinary day into something magical!`,
      narrativeArc: `Introduction to ${charName} -> An unexpected challenge or meeting -> An act of genuine sharing and courage -> A joyful, heartwarming resolution.`,
      visualTheme: `${styleObj.label}, vibrant warm illumination, volumetric god rays, detailed textures, 8k resolution.`,
      musicMood: styleObj.id === 'motivational' ? 'cinematic_epic' : styleObj.id === 'cartoon' ? 'playful_cartoon' : 'calm_acoustic',
      recommendedVoice: langObj.code === 'mr' ? 'Aarohi (Warm Marathi Storyteller)' : langObj.code === 'hi' ? 'Swara (Expressive Hindi Narrator)' : 'Guy (Warm English Storyteller)',
      keywords: ['AIAnimation', 'YouTubeShorts', 'StoryTime', styleObj.id, langObj.name]
    };
  }

  /**
   * Procedural storyboard generator for instant zero-dependency testing
   */
  generateProceduralStoryboard(prompt, styleObj, duration, numScenes, langObj, character, aspectRatio) {
    const charDesc = character 
      ? `${character.name}, a ${character.appearance}, ${character.color}`
      : 'a charming expressive character';

    const baseDuration = Math.round((duration / numScenes) * 10) / 10;

    // Multilingual sample scripts
    const scriptTemplates = {
      en: [
        { vo: `Once upon a time in a sunlit magical glade, ${prompt.toLowerCase().includes('rabbit') ? 'Barnaby the fluffy rabbit found something wonderful.' : 'an unexpected adventure was about to begin.'}`, sub: 'A magical discovery in the forest ✨' },
        { vo: `Nearby, a hungry little squirrel looked on with eager, hopeful eyes.`, sub: 'A small friend in great need 🥺' },
        { vo: `Without a second thought, the kindness within led to sharing the precious gift.`, sub: 'Sharing is the greatest joy ❤️' },
        { vo: `A bond of true friendship was forged in that single, selfless moment.`, sub: 'Friendship lights up the world 🌟' },
        { vo: `Together, they smiled as golden sunshine warmed the peaceful woodland.`, sub: 'Together through every season 🍃' },
        { vo: `Remember, a small act of kindness always creates the biggest miracles.`, sub: 'Be kind, share the love! 💫 #Shorts' }
      ],
      hi: [
        { vo: `एक सुंदर और सुनहरे जंगल में, एक नन्हा प्यारा खरगोश खुशी से खेल रहा था।`, sub: 'एक सुनहरे जंगल की कहानी 🌲' },
        { vo: `तभी पास के पेड़ से एक नन्हीं भूखी गिलहरी उम्मीद से देखने लगी।`, sub: 'भूखी नन्हीं गिलहरी आई 🥺' },
        { vo: `खरगोश ने बिना सोचे अपना मीठा लाल सेब उसके साथ बांट लिया।`, sub: 'सच्चा दिल और बांटने की खुशी ❤️' },
        { vo: `उस प्यारे पल में दोनों के बीच एक अनमोल दोस्ती की शुरुआत हुई।`, sub: 'सच्ची दोस्ती हमेशा के लिए 🤝' },
        { vo: `पूरा जंगल उनकी खिलखिलाहट और खुशियों से गूंज उठा।`, sub: 'जंगल में खिली खुशियां ✨' },
        { vo: `सच्ची सीख: खुशियां बांटने से हमेशा दोगुनी हो जाती हैं।`, sub: 'बांटने में ही असली खुशी है! 💫' }
      ],
      mr: [
        { vo: `एका निसर्गरम्य हिरव्यागार जंगलात, एक गोंडस ससा आनंदाने बागडत होता.`, sub: 'हिरव्यागार जंगलातील गोष्ट 🌿' },
        { vo: `तेवढ्यात एका झाडावर एक भुकेलेली छोटी खारुताई आशेने पाहू लागली.`, sub: 'एक भुकेली छोटी खारुताई 🥺' },
        { vo: `सशाने क्षणाचाही विचार न करता आपले गोड सफरचंद तिच्यासोबत वाटून खाल्ले.`, sub: 'शेअरिंग म्हणजेच खरा आनंद ❤️' },
        { vo: `त्या क्षणी त्यांच्यात निस्वार्थ आणि सुंदर मैत्रीचे नाते निर्माण झाले.`, sub: 'अतूट मैत्रीची सुरुवात 🤝' },
        { vo: `दोघांच्या चेहऱ्यावरचा आनंद पाहून संपूर्ण जंगल उजळून निघाले.`, sub: 'आनंदाचे गोड क्षण ✨' },
        { vo: `सुविचार: वाटून खाल्ल्याने आनंद नेहमी दुप्पट होतो!`, sub: 'आनंद वाटा, प्रेम वाढवा! 💫' }
      ]
    };

    const currentLangScripts = scriptTemplates[langObj.code] || scriptTemplates.en;

    const scenes = [];
    for (let i = 0; i < numScenes; i++) {
      const template = currentLangScripts[i % currentLangScripts.length];
      const sceneNum = i + 1;
      
      let visualAction = '';
      if (sceneNum === 1) visualAction = `establishing shot of sunbeams filtering through magical ancient trees, featuring ${charDesc}`;
      else if (sceneNum === 2) visualAction = `emotional close-up of ${charDesc} noticing a companion in need, warm expressive eyes`;
      else if (sceneNum === 3) visualAction = `heartwarming medium shot of ${charDesc} offering food and sharing with joyful gestures`;
      else if (sceneNum === 4) visualAction = `delightful two-shot of friends smiling and enjoying together under golden sunlight`;
      else if (sceneNum === 5) visualAction = `cinematic wide vista of the beautiful landscape bathed in radiant twilight glow with ${charDesc}`;
      else visualAction = `inspirational final shot of friends together, looking towards the horizon with hope, ${charDesc}`;

      scenes.push({
        sceneNumber: sceneNum,
        estimatedDuration: baseDuration,
        visualPrompt: `${visualAction}, ${styleObj.promptSuffix}, cinematic composition, 8k, vibrant lighting, highly detailed`,
        voiceoverText: template.vo,
        subtitleText: template.sub,
        cameraDirection: sceneNum % 2 === 1 ? 'Slow pan and gentle zoom in' : 'Dynamic cinematic tracking shot',
        soundEffect: sceneNum === 1 ? 'forest birds ambient' : sceneNum === 3 ? 'gentle harp chime' : 'sparkle chime'
      });
    }

    return {
      title: `${prompt.slice(0, 35)} | AI Shorts`,
      description: `A heartwarming story about kindness and sharing. Created with Gemini AI & AI Video Studio. #Shorts #AIAnimation #${langObj.name}`,
      musicMood: styleObj.id === 'motivational' ? 'cinematic_epic' : styleObj.id === 'cartoon' ? 'playful_cartoon' : 'calm_acoustic',
      moralOrEnding: langObj.code === 'mr' ? 'आनंद वाटल्याने आनंद वाढतो!' : langObj.code === 'hi' ? 'बांटने से खुशियां बढ़ती हैं!' : 'Sharing is caring!',
      characterConsistencyPrompt: charDesc,
      scenes
    };
  }
}

export const geminiService = new GeminiService();
