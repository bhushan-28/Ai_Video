import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../database/db.js';
import { config } from '../config.js';

class ScriptAnalysisService {
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
   * Automatically translates story text into authentic native script (Hindi/Marathi)
   */
  async translateText(text, targetLang = 'hi') {
    if (!text || typeof text !== 'string' || text.trim().length === 0) return text;
    if (targetLang === 'en' && !/[\u0900-\u097F]/.test(text)) return text;
    // If target is Hindi or Marathi and already contains Devanagari script, keep it
    if ((targetLang === 'hi' || targetLang === 'mr') && /[\u0900-\u097F]/.test(text)) {
      return text;
    }

    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
      const res = await axios.get(url, { timeout: 6000 });
      if (res.data && res.data[0] && Array.isArray(res.data[0])) {
        const translated = res.data[0].map(item => item[0]).join('');
        if (translated && translated.trim().length > 0) {
          return translated.trim();
        }
      }
    } catch (e) {
      console.warn(`[ScriptAnalysisService] Translation to ${targetLang} fallback error:`, e.message);
    }
    return text;
  }

  /**
   * Analyzes an original story script and generates:
   * 1. Extracted characters with persistent visual features and voice suggestions
   * 2. Comprehensive Scene Timing Plan allocating proper screen time to the main character
   * 3. Structured scene-by-scene production plan with visual prompts containing character anchor tokens
   */
  /**
   * Automatically calculates natural scene duration from script elements:
   * - Length of spoken dialogue (word count, syllables, character count)
   * - Narration speed and breathing pauses (punctuation)
   * - Character actions and physical movements
   * - Emotional reactions and expressions
   * - Camera movements and scene transitions
   * - Visual storytelling moments & required animation time
   */
  estimateSceneDuration(scene) {
    if (!scene) return 4.0;

    // 1. Dialogue / Voiceover timing
    const text = (scene.voiceoverText || scene.dialogue || scene.scriptSegment || '').trim();
    let speechDuration = 0;

    if (text.length > 0) {
      const isDevanagari = /[\u0900-\u097F]/.test(text);
      const words = text.split(/\s+/).filter(Boolean);
      const wordCount = words.length;

      // Natural storytelling speech rate: ~2.1 wps for Devanagari, ~2.4 wps for English
      const wordsPerSecond = isDevanagari ? 2.1 : 2.4;
      const baseSpeech = wordCount / wordsPerSecond;

      // Character-based pacing safeguard
      const charsPerSecond = isDevanagari ? 10.0 : 13.5;
      const charBasedDuration = text.length / charsPerSecond;

      speechDuration = Math.max(baseSpeech, charBasedDuration);

      // Natural breathing pauses based on punctuation
      const commas = (text.match(/[,;:]/g) || []).length;
      const sentenceEnds = (text.match(/[.!?।॥]/g) || []).length;
      speechDuration += (commas * 0.25) + (sentenceEnds * 0.45);

      // Natural speech tail buffer
      speechDuration += 0.5;
    }

    // 2. Character physical actions & movements
    const actionText = (scene.characterActions || scene.characterAction || scene.action || '').toLowerCase();
    let actionDuration = 0;

    if (/(run|sprint|dash|hop|jump|climb|fly|chase|struggle|pull|build|dance|race|explore|walk|stroll|wander|hurry|pack)/i.test(actionText)) {
      actionDuration += 1.8;
    } else if (/(pick|grab|offer|share|give|open|unwrap|examine|discover|spot|find|hug|eat|feast|bite|crunch|show)/i.test(actionText)) {
      actionDuration += 1.3;
    } else if (actionText.length > 0) {
      actionDuration += 0.8;
    }

    // 3. Emotional reactions & expressions
    if (/(smile|laugh|cry|sob|gasp|sigh|surprise|amazed|shock|wonder|stare|blush|giggle|proud|sad|joy|happy)/i.test(actionText) ||
        /(smile|laugh|cry|gasp|sigh|amazed|wonder|sad|joy)/i.test(text.toLowerCase())) {
      actionDuration += 1.1;
    }

    // 4. Camera movement & visual scene transitions
    let visualDuration = 0;
    const camera = (scene.cameraFraming || scene.cameraDirection || scene.cameraMovement || '').toLowerCase();
    if (/(wide|pan|tracking|dolly|sweep|establishing|vista|landscape|orbit)/i.test(camera)) {
      visualDuration += 1.2;
    } else {
      visualDuration += 0.6;
    }

    // 5. Multi-shot animation time requirement: each distinct shot needs at least 2.2s to breathe
    const shotCount = (scene.shots && Array.isArray(scene.shots) && scene.shots.length > 1) ? scene.shots.length : 1;
    const minShotRequirement = shotCount * 2.2;

    // Calculated duration balances speech with visual storytelling
    const calculatedDuration = Math.max(
      speechDuration + (actionDuration * 0.5),
      actionDuration + visualDuration,
      minShotRequirement,
      3.5 // absolute minimum scene duration
    );

    return Math.round(calculatedDuration * 10) / 10;
  }

  /**
   * Plans and structures scenes across the entire submitted script text.
   * Guarantees 100% text coverage, natural timing calculation per scene,
   * multi-shot visual moments, and character consistency.
   */
  /**
   * Generates a detailed Scene Continuity Plan for real character movement between locations:
   * - Starting and destination locations
   * - Direction of travel (maintains screen vector consistency)
   * - Character physical movement type (walking stride, running sprint, crossing bridge, etc.)
   * - Kinetic character action (legs, arms, body weight shift, head direction)
   * - Environmental transition details (path -> bridge -> lake shore)
   * - Carried objects (props that must stay consistent across scenes)
   * - Cinematic camera views matching the action
   * - Ending pose & starting pose for the next scene
   */
  extractSceneContinuityPlan({
    segmentText,
    sceneNum,
    totalScenes,
    prevPlan = null,
    mainChar = null,
    carriedObjects = []
  }) {
    const text = (segmentText || '').toLowerCase();

    // 1. Location detection
    const locationKeywords = [
      { key: 'finish line', label: 'Woodland Finish Line Ribbon' },
      { key: 'finish', label: 'Woodland Finish Line Ribbon' },
      { key: 'shady tree', label: 'Shady Ancient Oak Tree' },
      { key: 'oak tree', label: 'Shady Ancient Oak Tree' },
      { key: 'tree', label: 'Shady Forest Tree' },
      { key: 'start line', label: 'Forest Race Starting Line' },
      { key: 'starting line', label: 'Forest Race Starting Line' },
      { key: 'race', label: 'Forest Race Track' },
      { key: 'home', label: "Ruby's Cozy Burrow Home" },
      { key: 'cottage', label: 'Forest Cottage Porch' },
      { key: 'burrow', label: 'Cozy Underground Burrow' },
      { key: 'house', label: 'Character House Entrance' },
      { key: 'bridge', label: 'Rustic Wooden Footbridge' },
      { key: 'lake', label: 'Shimmering Crystal Lake' },
      { key: 'river', label: 'Sparkling Riverbank' },
      { key: 'stream', label: 'Babbling Forest Stream' },
      { key: 'pond', label: 'Enchanted Water Lily Pond' },
      { key: 'forest path', label: 'Sunlit Pine Forest Path' },
      { key: 'path', label: 'Wildflower Forest Trail' },
      { key: 'trail', label: 'Mountain Trail' },
      { key: 'woods', label: 'Deep Whispering Woods' },
      { key: 'clearing', label: 'Golden Meadow Clearing' },
      { key: 'meadow', label: 'Sunny Clover Meadow' },
      { key: 'mountain', label: 'Rainbow Mountain Summit' },
      { key: 'hill', label: 'Lush Green Hillside' },
      { key: 'ravine', label: 'Rocky Ravine Crossing' },
      { key: 'cave', label: 'Glowing Crystal Cave' },
      { key: 'village', label: 'Charming Woodland Village' },
      { key: 'garden', label: 'Enchanted Blossom Garden' }
    ];

    let detectedDest = null;
    for (const loc of locationKeywords) {
      if (text.includes(loc.key)) {
        detectedDest = loc.label;
        break;
      }
    }

    let startLocation = prevPlan ? prevPlan.endLocation : (detectedDest || "Forest Race Starting Line");
    let endLocation = detectedDest || startLocation;

    if (text.includes('leaves') || text.includes('starts') || text.includes('left')) {
      if (detectedDest && detectedDest !== startLocation) {
        endLocation = detectedDest;
      } else {
        endLocation = 'Sunlit Pine Forest Path';
      }
    } else if (text.includes('finish line') || text.includes('crosses') || text.includes('first')) {
      startLocation = 'Trail Approach to Finish';
      endLocation = 'Woodland Finish Line Ribbon';
    } else if (text.includes('sleep') || text.includes('tree') || text.includes('nap')) {
      startLocation = 'Forest Race Track';
      endLocation = 'Shady Ancient Oak Tree';
    } else if (text.includes('reaches') || text.includes('arrives') || text.includes('at the')) {
      endLocation = detectedDest || 'Shimmering Crystal Lake';
    } else if (text.includes('cross') || text.includes('bridge')) {
      startLocation = 'Forest Path Edge';
      endLocation = 'Rustic Wooden Footbridge';
    }

    // 2. Travel Direction & Screen Direction Vector
    let travelDirection = prevPlan ? prevPlan.travelDirection : 'left_to_right';
    if (text.includes('turn') || text.includes('looked back')) {
      travelDirection = travelDirection === 'left_to_right' ? 'right_to_left' : 'left_to_right';
    } else if (text.includes('toward the camera') || text.includes('approaches') || text.includes('comes closer')) {
      travelDirection = 'toward_camera';
    } else if (text.includes('into the distance') || text.includes('away') || text.includes('walks off')) {
      travelDirection = 'away_from_camera';
    } else if (text.includes('sleep') || text.includes('asleep') || text.includes('stops') || text.includes('sits') || text.includes('talks') || text.includes('sharing')) {
      travelDirection = 'stationary_interaction';
    } else if (!prevPlan) {
      travelDirection = 'left_to_right';
    }

    // 3. Movement Type & Kinetic Action
    let movementType = 'walking_stride';
    let characterMovement = '';
    let startPosition = 'Screen-left';
    let endPosition = 'Screen-right';

    if (text.includes('sleep') || text.includes('asleep') || text.includes('nap') || text.includes('rests') || text.includes('rest') || text.includes('resting') || text.includes('lies down') || text.includes('lay down') || text.includes('सो जा') || text.includes('झोप')) {
      movementType = 'sleeping_rest';
      characterMovement = 'Resting peacefully in deep slumber on soft mossy grass under the shady ancient tree, breathing rhythmically and slowly';
      startPosition = 'Center-screen under tree shade';
      endPosition = 'Resting in peaceful deep sleep';
    } else if (text.includes('wakes') || text.includes('wake') || text.includes('woke') || text.includes('shock') || text.includes('surprised') || text.includes('scrambles') || text.includes('frantic') || text.includes('जागता') || text.includes('जागा') || text.includes('आश्चर्य')) {
      movementType = 'waking_surprise';
      characterMovement = 'Startled sudden awakening with wide panic-stricken eyes, scrambling to feet and launching into desperate full-speed dash';
      startPosition = 'Under tree leaping up in shock';
      endPosition = 'Sprinting desperately right toward finish line';
    } else if (text.includes('finish line') || text.includes('crosses') || text.includes('crossed') || text.includes('wins') || text.includes('first') || text.includes('पार करता') || text.includes('रेषा पार') || text.includes('जीत हासिल') || text.includes('जिंकतो')) {
      movementType = 'victory_finish';
      characterMovement = 'Stepping triumphantly across the finish line ribbon with proud joyful smile as woodland friends cheer in celebration';
      startPosition = 'Approaching finish line banner';
      endPosition = 'Across finish line, victorious and celebrating';
    } else if ((text.includes('tortoise') || text.includes('turtle') || text.includes('कछुआ') || text.includes('कासव')) && (text.includes('walk') || text.includes('steady') || text.includes('continue') || text.includes('slowly') || text.includes('passing') || text.includes('steps') || text.includes('चल') || text.includes('पावलां') || text.includes('संथ') || text.includes('धीमी') || text.includes('हळूहळू'))) {
      movementType = 'slow_steady_walk';
      characterMovement = 'Determined, patient step-by-step walking stride, emerald-green patterned shell gleaming, head held forward, walking with steady focus';
      startPosition = 'Screen-left trail';
      endPosition = 'Screen-right advancing steadily along path';
    } else if (text.includes('bridge') || text.includes('cross') || text.includes('पुल')) {
      movementType = 'crossing_bridge';
      characterMovement = 'Rhythmic walking locomotion stepping forward onto wooden bridge timbers, swinging arms naturally, balancing weight as bridge gently creaks underfoot';
      startPosition = 'Bridge approach, screen-left';
      endPosition = 'Across wooden bridge planks, screen-right';
    } else if (text.includes('run') || text.includes('sprint') || text.includes('dash') || text.includes('dart') || text.includes('hurry') || text.includes('fast') || text.includes('दौड़') || text.includes('धाव')) {
      movementType = 'running_sprint';
      characterMovement = 'Dynamic energetic running sprint, leaning forward, legs pumping with powerful strides, arms swinging in high-speed motion cycle';
      startPosition = 'Left edge of frame';
      endPosition = 'Right edge of frame in active sprint';
    } else if (text.includes('jump') || text.includes('leap') || text.includes('hop')) {
      movementType = 'leaping_jump';
      characterMovement = 'Springing off back feet into a joyful parabolic leap, ears trailing backwards in the breeze, landing softly with flexed knees';
      startPosition = 'Mid-screen takeoff';
      endPosition = 'Mid-screen landing with natural weight compression';
    } else if (text.includes('climb') || text.includes('step') || text.includes('ascend')) {
      movementType = 'climbing_ascent';
      characterMovement = 'Upward climbing locomotion, reaching paws up, hoisting body weight upward step-by-step with determined focus';
      startPosition = 'Bottom of incline';
      endPosition = 'Top of ridge / stairs';
    } else if (text.includes('reaches') || text.includes('arrives') || text.includes('stop')) {
      movementType = 'arrival_stop';
      characterMovement = 'Decelerating from walk cycle to a graceful halt, shifting weight onto both feet, rotating head smoothly to look around in wonder';
      startPosition = 'Walking into frame from left';
      endPosition = 'Center-frame, standing still and observing';
    } else {
      movementType = 'walking_stride';
      characterMovement = 'Natural continuous walking stride cycle: left and right footfalls alternating with forward momentum, arms swinging smoothly, ears gently bobbing';
      startPosition = 'Screen-left entering trail';
      endPosition = 'Screen-right traveling forward';
    }

    // 4. Props & Carried Objects
    const detectedProps = new Set(carriedObjects);
    if (text.includes('backpack') || text.includes('bag')) detectedProps.add('red adventurer backpack');
    if (text.includes('apple')) detectedProps.add('shiny red apple');
    if (text.includes('key')) detectedProps.add('ancient bronze key');
    if (text.includes('map')) detectedProps.add('glowing star map');
    if (text.includes('acorn')) detectedProps.add('golden acorn');
    if (text.includes('flower')) detectedProps.add('wildflower bouquet');
    if (text.includes('scarf')) detectedProps.add('sky-blue scarf');
    if (text.includes('vest')) detectedProps.add('runner vest');

    const activeProps = Array.from(detectedProps);

    // 5. Environment & Scenic Details
    let environmentDetails = `${startLocation} transitioning naturally into ${endLocation}, detailed 3D Pixar environment with volumetric lighting, mossy textures, raytraced shadows, and depth of field`;
    if (movementType === 'sleeping_rest') {
      environmentDetails = 'Underneath the vast leafy canopy of a majestic ancient oak tree, golden sunbeams filtering through leaves onto a soft bed of moss and wildflowers';
    } else if (movementType === 'victory_finish') {
      environmentDetails = 'Woodland race finish line marked with bright red satin ribbon between carved birch posts, cheering forest animal spectators, fluttering colorful banners';
    } else if (movementType === 'slow_steady_walk') {
      environmentDetails = 'Rugged winding forest trail flanked by ancient pine trees, granite boulders, and blooming forest flowers under clear golden skies';
    } else if (movementType === 'crossing_bridge') {
      environmentDetails = 'Rustic weathered wooden plank footbridge with rope railings suspended over a sparkling clear rushing forest creek, surrounded by weeping willows and mossy stones';
    } else if (movementType === 'arrival_stop' || endLocation.includes('Lake')) {
      environmentDetails = 'Shoreline of a breathtaking shimmering crystal lake, calm turquoise water with golden sunlight caustics, soft pebbles, and distant lavender mountains';
    } else if (movementType === 'walking_stride') {
      environmentDetails = 'Winding forest pathway carpeted with soft pine needles and dappled sunlight filtering through tall ancient trees, glowing wildflowers along the borders';
    }

    // 6. Intelligent Cinematic Camera Views
    let shotType = 'side_tracking';
    let cameraMovement = 'Side-tracking tracking shot at waist height moving smoothly alongside character';
    if (sceneNum === 1) {
      shotType = 'wide_establishing';
      cameraMovement = 'Cinematic wide establishing shot slowly pushing in as character starts journey';
    } else if (movementType === 'sleeping_rest') {
      shotType = 'medium_close_resting';
      cameraMovement = 'Gentle cinematic push-in toward character resting peacefully in tree shade';
    } else if (movementType === 'waking_surprise') {
      shotType = 'dramatic_reaction_tracking';
      cameraMovement = 'Dynamic whip-pan tracking character scrambling to feet and dashing in surprise';
    } else if (movementType === 'victory_finish') {
      shotType = 'cinematic_triumph_wide';
      cameraMovement = 'Cinematic low-angle wide shot capturing victorious finish line crossing with crowd cheer';
    } else if (movementType === 'slow_steady_walk') {
      shotType = 'side_tracking_steady';
      cameraMovement = 'Low-angle steady tracking shot moving alongside character with patient stride';
    } else if (movementType === 'running_sprint') {
      shotType = 'tracking_sprint';
      cameraMovement = 'High-speed side tracking shot following character sprinting at top velocity';
    } else if (movementType === 'crossing_bridge') {
      shotType = 'low_angle_dramatic';
      cameraMovement = 'Low-angle side tracking shot following character stepping across bridge';
    } else if (movementType === 'arrival_stop') {
      shotType = 'wide_arrival_vista';
      cameraMovement = 'Medium-to-wide crane shot revealing character standing at the destination';
    } else if (travelDirection === 'toward_camera') {
      shotType = 'front_tracking';
      cameraMovement = 'Front-tracking dolly camera reversing smoothly as character walks towards camera';
    } else if (travelDirection === 'away_from_camera') {
      shotType = 'rear_follow';
      cameraMovement = 'Over-the-shoulder follow shot observing character moving into the distance';
    }

    const endingPose = `${mainChar?.name || 'Main Character'} with ${travelDirection === 'left_to_right' ? 'right foot forward' : 'facing forward'}, body oriented toward ${endLocation}`;
    const startingPoseNext = `${mainChar?.name || 'Main Character'} continuing stride cycle from ${endLocation}, maintaining continuous directional momentum`;

    return {
      startLocation,
      endLocation,
      startPosition,
      endPosition,
      travelDirection,
      movementType,
      characterMovement,
      environmentDetails,
      carriedObjects: activeProps,
      cinematicCamera: {
        shotType,
        cameraMovement,
        focalSubject: mainChar?.name || 'Main Character'
      },
      endingPose,
      startingPoseNext
    };
  }

  /**
   * Plans and structures scenes across the entire submitted script text.
   * Guarantees 100% text coverage, natural timing calculation per scene,
   * multi-shot visual moments, and character consistency.
   */
  async planScenes({
    scriptText,
    sentences = [],
    dialogueEntries = [],
    characters = [],
    styleObj,
    langObj,
    aspectRatio = '9:16'
  }) {
    const mainChar = characters[0] || {
      name: 'Ruby the Rabbit',
      continuityAnchor: 'Ruby the Rabbit, cute white bunny with pink inner ears, sky-blue scarf, red backpack, holding a shiny red apple'
    };
    const secondaryChars = characters.slice(1);

    // Group sentences and dialogue turns into beats ensuring 100% text coverage
    const beats = [];
    if (dialogueEntries.length > 0) {
      // Build beats from dialogue turns
      dialogueEntries.forEach((entry) => {
        beats.push({
          speaker: entry.speaker,
          text: entry.text,
          scriptSegment: `${entry.speaker}: "${entry.text}"`
        });
      });

      // Ensure non-dialogue narration sentences are also represented
      if (sentences.length > dialogueEntries.length) {
        const nonDialogueSentences = sentences.filter(s => 
          !dialogueEntries.some(d => s.toLowerCase().includes(d.text.slice(0, 20).toLowerCase()))
        );
        if (nonDialogueSentences.length > 0) {
          if (!beats[0].text.includes(nonDialogueSentences[0])) {
            beats.unshift({
              speaker: 'Narrator',
              text: nonDialogueSentences[0],
              scriptSegment: nonDialogueSentences[0]
            });
          }
          for (let k = 1; k < nonDialogueSentences.length; k++) {
            beats.push({
              speaker: 'Narrator',
              text: nonDialogueSentences[k],
              scriptSegment: nonDialogueSentences[k]
            });
          }
        }
      }
    } else {
      // Narrative script: chunk sentences so 100% of sentences are included
      let effectiveSentences = [...sentences];
      if (effectiveSentences.length === 1) {
        // If single sentence, detect compound actions/events (e.g. "and then", "and", "then", "until", "where")
        const clauses = effectiveSentences[0]
          .split(/\s+(?:and then|and|then|suddenly|until|where)\s+/i)
          .map(s => s.trim())
          .filter(s => s.length > 8);
        if (clauses.length >= 2) {
          effectiveSentences = clauses;
        }
      }

      const chunkSize = 1;
      for (let i = 0; i < effectiveSentences.length; i += chunkSize) {
        const chunk = effectiveSentences.slice(i, i + chunkSize);
        const segmentText = chunk.join(' ').trim();
        beats.push({
          speaker: 'Narrator',
          text: segmentText,
          scriptSegment: segmentText
        });
      }
    }

    if (beats.length === 0) {
      beats.push({
        speaker: 'Narrator',
        text: scriptText || 'A wonderful cartoon adventure.',
        scriptSegment: scriptText || 'A wonderful cartoon adventure.'
      });
    }

    const scenes = [];
    let cumulativeSecs = 0;
    let prevContinuityPlan = null;
    const persistentCarriedObjects = new Set(['red adventurer backpack']);

    for (let i = 0; i < beats.length; i++) {
      const beat = beats[i];
      const sceneNum = i + 1;

      // Characters present: check which characters are active in this beat
      const segLower = beat.scriptSegment.toLowerCase();
      let presentChars = [];
      for (const char of characters) {
        const nameKeywords = char.name.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const speciesPart = (char.species || '').toLowerCase();
        if (nameKeywords.some(kw => segLower.includes(kw)) || (speciesPart && segLower.includes(speciesPart))) {
          presentChars.push(char.name);
        }
      }
      if (beat.speaker && beat.speaker !== 'Narrator' && !presentChars.includes(beat.speaker)) {
        presentChars.push(beat.speaker);
      }
      // Ensure lead main character is always present across 100% of scenes for character continuity
      if (!presentChars.some(c => c.toLowerCase() === mainChar.name.toLowerCase())) {
        presentChars.unshift(mainChar.name);
      }

      // Voiceover text and language localization
      let voiceoverText = beat.text;
      if ((langObj.code === 'hi' || langObj.code === 'mr') && !/[\u0900-\u097F]/.test(voiceoverText)) {
        voiceoverText = await this.translateText(voiceoverText, langObj.code);
      } else if (langObj.code === 'en' && /[\u0900-\u097F]/.test(voiceoverText)) {
        voiceoverText = await this.translateText(voiceoverText, 'en');
      }
      const subtitleText = voiceoverText.slice(0, 50) + (voiceoverText.length > 50 ? '...' : '');

      let visualAction = beat.scriptSegment.slice(0, 90);
      if (/[\u0900-\u097F]/.test(visualAction)) {
        try { visualAction = await this.translateText(visualAction, 'en'); } catch (_) {}
      }

      // Generate detailed scene continuity plan for character movement & location transitions
      const continuityPlan = this.extractSceneContinuityPlan({
        segmentText: beat.scriptSegment,
        sceneNum,
        totalScenes: beats.length,
        prevPlan: prevContinuityPlan,
        mainChar,
        carriedObjects: Array.from(persistentCarriedObjects)
      });
      prevContinuityPlan = continuityPlan;
      continuityPlan.carriedObjects.forEach(obj => persistentCarriedObjects.add(obj));

      const friendAnchor = presentChars.length > 1 && secondaryChars.length > 0
        ? `, accompanied by ${secondaryChars[0].continuityAnchor}`
        : '';

      const visualPrompt = `Scene ${sceneNum}: Masterpiece 3D Pixar animated film shot of ${mainChar.continuityAnchor}${friendAnchor}, performing: "${visualAction}", actively in ${continuityPlan.movementType} (${continuityPlan.characterMovement}), traveling from ${continuityPlan.startPosition} at ${continuityPlan.startLocation} to ${continuityPlan.endPosition} at ${continuityPlan.endLocation}, ${continuityPlan.environmentDetails}, carrying: ${continuityPlan.carriedObjects.join(', ')}, ${continuityPlan.cinematicCamera.shotType}, ${continuityPlan.cinematicCamera.cameraMovement}, ${styleObj.promptSuffix}, vibrant cinematic lighting, volumetric sunbeams, Octane 3D render, 8k resolution, cinematic ${aspectRatio} composition`;

      // Multi-shot visual journey progression:
      // Shot 1: Departure / Action Initiation
      // Shot 2: Active Mid-Journey / Bridge Crossing / Dynamic Locomotion
      // Shot 3: Arrival / Reaction / Environmental Interaction
      const shot1Action = `${mainChar.name} initiates ${continuityPlan.movementType} at ${continuityPlan.startLocation}, stepping forward toward ${continuityPlan.endLocation}`;
      const shot2Action = `${mainChar.name} in full active motion: ${continuityPlan.characterMovement}`;
      const shot3Action = `${mainChar.name} reaches ${continuityPlan.endLocation}, looking around with expressive reaction`;

      const shot1Prompt = `Scene ${sceneNum} Shot 1: Full-body 3D Pixar animated film shot of ${mainChar.continuityAnchor}${friendAnchor}, starting ${continuityPlan.movementType} from ${continuityPlan.startLocation}, facing ${continuityPlan.travelDirection}, ${continuityPlan.cinematicCamera.shotType}, ${continuityPlan.environmentDetails}, carrying: ${continuityPlan.carriedObjects.join(', ')}, ${styleObj.promptSuffix}, cinematic volumetric lighting, 8k`;
      const shot2Prompt = `Scene ${sceneNum} Shot 2: Dynamic 3D Pixar animated feature shot of ${mainChar.continuityAnchor}${friendAnchor}, in active mid-stride locomotion, ${continuityPlan.characterMovement}, traveling from ${continuityPlan.startPosition} across ${continuityPlan.endLocation}, carrying: ${continuityPlan.carriedObjects.join(', ')}, side-tracking camera tracking alongside character, ${styleObj.promptSuffix}, raytraced lighting, 8k`;
      const shot3Prompt = `Scene ${sceneNum} Shot 3: Expressive 3D Pixar animated film shot of ${mainChar.continuityAnchor}${friendAnchor}, arriving at ${continuityPlan.endLocation}, expressive face with large sparkling eyes, reacting with joy, ${continuityPlan.environmentDetails}, soft cinematic rim lighting, shallow depth of field, 8k`;

      const shots = [
        {
          shotNumber: 1,
          action: shot1Action,
          cameraAngle: continuityPlan.cinematicCamera.cameraMovement,
          visualPrompt: shot1Prompt,
          durationRatio: 0.35,
          continuityPlan
        },
        {
          shotNumber: 2,
          action: shot2Action,
          cameraAngle: 'Side-tracking active movement shot',
          visualPrompt: shot2Prompt,
          durationRatio: 0.40,
          continuityPlan
        },
        {
          shotNumber: 3,
          action: shot3Action,
          cameraAngle: 'Medium close-up arrival reaction',
          visualPrompt: shot3Prompt,
          durationRatio: 0.25,
          continuityPlan
        }
      ];

      let soundEffect = 'gentle melodic sparkle';
      if (continuityPlan.movementType === 'sleeping_rest') {
        soundEffect = 'peaceful crickets, soft wind chimes and rhythmic breathing';
      } else if (continuityPlan.movementType === 'slow_steady_walk') {
        soundEffect = 'steady rhythmic footsteps on forest trail';
      } else if (continuityPlan.movementType === 'waking_surprise') {
        soundEffect = 'startled gasp and frantic footstep scramble';
      } else if (continuityPlan.movementType === 'victory_finish') {
        soundEffect = 'triumphant fanfare, crowd cheering and applause';
      } else if (continuityPlan.movementType === 'running_sprint') {
        soundEffect = 'rapid footstep thuds and rushing wind';
      } else if (continuityPlan.movementType === 'crossing_bridge') {
        soundEffect = 'wooden bridge creak and flowing water';
      } else if (sceneNum === 1) {
        soundEffect = 'forest birds chirping and gentle breeze';
      } else if (sceneNum % 2 === 0) {
        soundEffect = 'gentle melodic sparkle';
      } else {
        soundEffect = 'footsteps on trail';
      }

      const sceneObj = {
        sceneNumber: sceneNum,
        scriptSegment: beat.scriptSegment,
        charactersPresent: presentChars,
        mainCharacterVisible: presentChars.some(c => c.toLowerCase().includes(mainChar.name.toLowerCase())),
        speakerName: beat.speaker,
        voiceoverText,
        subtitleText,
        characterAction: `${mainChar.name} active: "${continuityPlan.characterMovement.slice(0, 80)}"`,
        characterActions: `${mainChar.name} active: "${continuityPlan.characterMovement.slice(0, 80)}"`,
        environment: continuityPlan.environmentDetails,
        cameraFraming: continuityPlan.cinematicCamera.shotType,
        cameraMovement: continuityPlan.cinematicCamera.cameraMovement,
        cameraDirection: continuityPlan.cinematicCamera.cameraMovement,
        soundEffect,
        visualPrompt,
        shots,
        sceneContinuityPlan: continuityPlan,
        continuityPlan,
        travelDirection: continuityPlan.travelDirection,
        movementType: continuityPlan.movementType,
        startLocation: continuityPlan.startLocation,
        endLocation: continuityPlan.endLocation,
        carriedObjects: continuityPlan.carriedObjects
      };

      // Calculate suitable duration automatically from dialogue, action, emotion & animation time
      const sceneDuration = this.estimateSceneDuration(sceneObj);
      sceneObj.estimatedDuration = sceneDuration;
      sceneObj.duration = sceneDuration;
      sceneObj.characterScreenTime = `${Math.round(sceneDuration * 0.9 * 10) / 10}s (90% of scene)`;
      sceneObj.characterScreenTimeSeconds = Math.round(sceneDuration * 0.9 * 10) / 10;

      const startSecs = Math.round(cumulativeSecs * 10) / 10;
      const endSecs = Math.round((cumulativeSecs + sceneDuration) * 10) / 10;
      sceneObj.startTime = startSecs;
      sceneObj.endTime = endSecs;

      const startMin = Math.floor(startSecs / 60);
      const startSecDisplay = Math.floor(startSecs % 60);
      const endMin = Math.floor(endSecs / 60);
      const endSecDisplay = Math.floor(endSecs % 60);
      sceneObj.startTimeFormatted = `${startMin < 10 ? '0' : ''}${startMin}:${startSecDisplay < 10 ? '0' : ''}${startSecDisplay}`;
      sceneObj.endTimeFormatted = `${endMin < 10 ? '0' : ''}${endMin}:${endSecDisplay < 10 ? '0' : ''}${endSecDisplay}`;

      cumulativeSecs += sceneDuration;
      scenes.push(sceneObj);
    }

    const totalEstimatedDuration = Math.round(cumulativeSecs * 10) / 10;
    return {
      scenes,
      estimatedTotalDuration: totalEstimatedDuration,
      estimatedDuration: totalEstimatedDuration
    };
  }

  /**
   * Analyzes an original story script and generates:
   * 1. Extracted characters with persistent visual features and voice suggestions
   * 2. Comprehensive Scene Timing Plan allocating proper screen time to the characters
   * 3. Structured scene-by-scene production plan with visual prompts containing character anchor tokens
   * 4. Automatically calculated video duration derived from the complete script
   */
  async analyzeScript({
    script,
    style = '3d_animation',
    duration = null, // Optional hint preserved for backward compatibility; duration is calculated dynamically
    language = 'en',
    aspectRatio = '9:16',
    userApiKey = null
  }) {
    if (!script || typeof script !== 'string' || script.trim().length === 0) {
      throw new Error('Script text is required for story analysis.');
    }

    const cleanScript = script.trim();
    const styleObj = config.videoStyles.find(s => s.id === style) || config.videoStyles[1];
    const langObj = config.supportedLanguages.find(l => l.code === language) || config.supportedLanguages[0];
    const client = this.getClient(userApiKey);

    if (client) {
      try {
        console.log(`[ScriptAnalysisService] Calling Gemini API for dynamic script analysis (${cleanScript.length} chars)...`);
        const model = client.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const prompt = `You are an elite children's animated cartoon director, character designer, and animation pipeline architect.
Analyze the user's COMPLETE story script and return a strictly structured JSON production breakdown for an animated video.

User Script:
"""
${cleanScript}
"""

Target Specifications:
- Aspect Ratio: ${aspectRatio} (${aspectRatio === '9:16' ? 'Vertical YouTube Shorts' : 'Horizontal'})
- Visual Style: ${styleObj.label} (${styleObj.promptSuffix})
- Spoken Language: ${langObj.name} (${langObj.native})
${language === 'hi' ? '- Write voiceoverText & subtitleText in pure natural HINDI Devanagari script.' : ''}
${language === 'mr' ? '- Write voiceoverText & subtitleText in pure natural MARATHI Devanagari script.' : ''}

CRITICAL DURATION & COMPLETE SCRIPT COVERAGE MANDATE:
1. STORY INPUT HANDLING:
   - If the user provided only a title or short story idea (e.g. fewer than 3 sentences or short concept such as "The Rabbit and the Tortoise"), FIRST develop a complete, age-appropriate children's moral story with a beginning, rising action, middle, climax, ending, and a clear moral lesson.
   - If the user provided a complete script, preserve 100% of the narrative, sentences, events, and dialogue without cutting anything.
2. DYNAMIC SCENE BREAKDOWN: Divide the story into as many naturally timed scenes as needed to represent 100% of the narrative. Never force or truncate to a predefined duration.
3. AUTOMATICALLY CALCULATE SCENE DURATION: For each scene, calculate a realistic "estimatedDuration" (in seconds) based on:
   - Spoken dialogue / voiceover length at natural storytelling pace (~2.4 words per second + breathing pauses)
   - Character physical actions, reactions, and movements
   - Emotional expressions and pauses
   - Visual storytelling moments and transitions
   - Every scene must be at least 3.5 seconds to allow proper animation.
4. CALCULATE TOTAL DURATION: Sum all planned scene durations to provide "estimatedTotalDuration".
5. CHARACTER CONTINUITY:
   - Identify lead character ("isMainCharacter": true) who remains visible in at least 80% to 100% of scenes.
   - Identify secondary characters with "isMainCharacter": false.
   - For every character, formulate a detailed "continuityAnchor" token string.
6. SCENE CONTINUITY & CHARACTER LOCOMOTION MANDATE:
   - Characters must NOT remain stationary while only the background or camera moves.
   - For every scene, provide a "sceneContinuityPlan" detailing the character's journey between locations (e.g., starting line -> pine forest race track -> shady oak tree -> rocky trail -> finish line).
   - Detail physical movement ("movementType": walking_stride, slow_steady_walk, running_sprint, sleeping_rest, waking_surprise, victory_finish, crossing_bridge, leaping_jump, climbing_ascent, arrival_stop).
   - Maintain screen direction ("travelDirection": left_to_right, right_to_left, toward_camera, away_from_camera, stationary_interaction).
   - Track persistent carried props ("carriedObjects": ["red runner vest", "running headband", "emerald shell", "neckerchief"]).
   - Specify intelligent cinematic camera views and transitional poses ("endingPose", "startingPoseNext").
7. Return ONLY valid JSON with no markdown wrapping or backticks.

Expected JSON Structure:
{
  "title": "Short catchy title with emoji",
  "logline": "1-sentence summary of the story",
  "musicMood": "One of: calm_acoustic, upbeat_energetic, cinematic_epic, playful_cartoon, lofi_ambient",
  "moral": "Positive takeaway or moral of the story",
  "mainCharacterName": "Lead protagonist name",
  "estimatedTotalDuration": 42.5,
  "characters": [
    {
      "name": "Character Name",
      "isMainCharacter": true,
      "species": "e.g. Rabbit / Squirrel / Turtle / Human / Fox",
      "age": "e.g. Young / Child / Wise Elder",
      "gender": "male / female / neutral",
      "appearance": "Detailed physical description (fur/skin, face, eyes, ears, body)",
      "color": "Dominant colors",
      "clothing": "Exact clothes, accessories, hats, or scarves",
      "distinctiveFeatures": "Key identifying features for AI image generator",
      "personality": "Core behavioral traits",
      "voiceType": "childlike / energetic / calm / narrator / emotional",
      "continuityAnchor": "Compact token string to inject into scene prompts",
      "referencePrompt": "Full character prompt for generating a multi-view reference sheet"
    }
  ],
  "scenes": [
    {
      "sceneNumber": 1,
      "startTime": 0.0,
      "endTime": 5.2,
      "estimatedDuration": 5.2,
      "scriptSegment": "The excerpt from user's script for this beat",
      "charactersPresent": ["Main Character Name"],
      "mainCharacterVisible": true,
      "characterScreenTime": "4.7s (90% of scene)",
      "speakerName": "Narrator or Character Name",
      "voiceoverText": "Spoken line in ${langObj.name}",
      "subtitleText": "Punchy 1-line caption for YouTube Shorts screen",
      "characterActions": "What the characters are doing and their facial expressions",
      "environment": "Backdrop, lighting, weather, and setting details",
      "cameraFraming": "Close-up / Medium two-shot / Wide action",
      "cameraDirection": "e.g. Low-angle slow dolly in / Wide tracking shot / Close-up",
      "soundEffect": "e.g. birds chirping / apple crunch / bell chime / footstep",
      "visualPrompt": "Comprehensive visual prompt combining main character continuityAnchor, action, environment, lighting, and ${styleObj.promptSuffix}",
      "sceneContinuityPlan": {
        "startLocation": "Ruby's Cozy Burrow Home",
        "endLocation": "Sunlit Pine Forest Path",
        "startPosition": "Screen-left",
        "endPosition": "Screen-right",
        "travelDirection": "left_to_right",
        "movementType": "walking_stride",
        "characterMovement": "Continuous natural walking stride cycle, swinging arms, ears bobbing gently",
        "environmentDetails": "Forest path transitioning into wooden bridge, 3D Pixar lighting",
        "carriedObjects": ["red adventurer backpack", "shiny red apple"],
        "cinematicCamera": {
          "shotType": "side_tracking",
          "cameraMovement": "Side-tracking shot following character moving horizontally",
          "focalSubject": "Ruby the Rabbit"
        },
        "endingPose": "Ruby facing right with forward momentum",
        "startingPoseNext": "Ruby continuing stride cycle onto path"
      },
      "shots": [
        {
          "shotNumber": 1,
          "action": "Departure / Action initiation",
          "cameraAngle": "Wide establishing / tracking shot",
          "visualPrompt": "Visual prompt for shot 1 with main character anchor"
        },
        {
          "shotNumber": 2,
          "action": "Active mid-journey locomotion or obstacle crossing",
          "cameraAngle": "Side-tracking active movement shot",
          "visualPrompt": "Visual prompt for shot 2 with active stride"
        },
        {
          "shotNumber": 3,
          "action": "Arrival at destination and expressive reaction",
          "cameraAngle": "Medium close-up arrival reaction",
          "visualPrompt": "Visual prompt for shot 3 with facial reaction"
        }
      ]
    }
  ]
}`;

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Gemini API call timed out after 15s')), 15000)
        );
        const result = await Promise.race([model.generateContent(prompt), timeoutPromise]);
        const text = result.response.text();
        const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);

        this.validateSchema(parsed);
        parsed.language = langObj.code;
        parsed.providerUsed = 'google-gemini-1.5-flash';
        parsed.isAiGenerated = true;
        return parsed;
      } catch (err) {
        console.warn(`[ScriptAnalysisService] Gemini API call failed (${err.message}). Falling back to dynamic Local Script Parser.`);
      }
    } else {
      console.log('[ScriptAnalysisService] Gemini API key not provided. Using intelligent dynamic Local Script Parser.');
    }

    // Dynamic Local Script Parser (Parses user's actual text dynamically, never returns hardcoded stories)
    const parsed = await this.parseScriptLocally(cleanScript, styleObj, langObj, aspectRatio);
    parsed.providerUsed = client ? 'local-nlp-fallback' : 'local-nlp-parser';
    parsed.isAiGenerated = false;
    parsed.providerNotice = client 
      ? 'Gemini API call timed out or failed. Script parsed dynamically using Local NLP Script Parser.' 
      : 'Gemini API key is not configured in Settings. Your script was analyzed and broken down into characters and scenes with automatic duration using the built-in Local Script Parser.';
    return parsed;
  }

  /**
   * Validates structured storyboard JSON against schema and calculates total duration
   */
  validateSchema(data) {
    if (!data.title || typeof data.title !== 'string') {
      throw new Error('Invalid storyboard: missing title');
    }
    if (!data.characters || !Array.isArray(data.characters) || data.characters.length === 0) {
      throw new Error('Invalid storyboard: at least one character must be extracted from the script');
    }
    if (!data.scenes || !Array.isArray(data.scenes) || data.scenes.length === 0) {
      throw new Error('Invalid storyboard: at least one scene must be generated');
    }

    // Ensure main character flag
    if (!data.characters.some(c => c.isMainCharacter)) {
      data.characters[0].isMainCharacter = true;
    }
    const mainChar = data.characters.find(c => c.isMainCharacter) || data.characters[0];
    data.mainCharacter = mainChar.name;
    data.mainCharacterName = mainChar.name;

    let cumulativeSecs = 0;
    let prevContinuityPlan = null;
    const persistentCarriedObjects = new Set(['red adventurer backpack']);

    data.scenes.forEach((sc, idx) => {
      sc.sceneNumber = idx + 1;
      let dur = typeof sc.estimatedDuration === 'number' && sc.estimatedDuration > 0
        ? sc.estimatedDuration
        : (typeof sc.duration === 'number' && sc.duration > 0 ? sc.duration : null);
      if (!dur) {
        dur = this.estimateSceneDuration(sc);
      }
      dur = Math.round(dur * 10) / 10;
      sc.estimatedDuration = dur;
      sc.duration = dur;

      sc.startTime = Math.round(cumulativeSecs * 10) / 10;
      sc.endTime = Math.round((cumulativeSecs + dur) * 10) / 10;
      cumulativeSecs += dur;

      if (!sc.visualPrompt) throw new Error(`Scene ${idx + 1} missing visualPrompt`);
      if (!sc.voiceoverText) throw new Error(`Scene ${idx + 1} missing voiceoverText`);
      if (!sc.charactersPresent || sc.charactersPresent.length === 0) {
        sc.charactersPresent = [mainChar.name];
      }
      sc.mainCharacterVisible = sc.charactersPresent.some(c => c.toLowerCase().includes(mainChar.name.toLowerCase()));
      if (!sc.characterScreenTime) {
        sc.characterScreenTime = `${Math.round(dur * 0.9 * 10) / 10}s (90% of scene)`;
      }
      if (!sc.cameraFraming) sc.cameraFraming = 'Medium Shot';
      if (!sc.cameraMovement) sc.cameraMovement = sc.cameraDirection || 'Smooth tracking shot';
      if (!sc.characterAction) sc.characterAction = `${mainChar.name} active in scene`;

      // Guarantee Scene Continuity Plan
      if (!sc.sceneContinuityPlan || !sc.sceneContinuityPlan.startLocation) {
        sc.sceneContinuityPlan = this.extractSceneContinuityPlan({
          segmentText: sc.scriptSegment || sc.characterActions || sc.voiceoverText || '',
          sceneNum: idx + 1,
          totalScenes: data.scenes.length,
          prevPlan: prevContinuityPlan,
          mainChar,
          carriedObjects: Array.from(persistentCarriedObjects)
        });
      }

      prevContinuityPlan = sc.sceneContinuityPlan;
      if (sc.sceneContinuityPlan.carriedObjects && Array.isArray(sc.sceneContinuityPlan.carriedObjects)) {
        sc.sceneContinuityPlan.carriedObjects.forEach(obj => persistentCarriedObjects.add(obj));
      }

      sc.continuityPlan = sc.sceneContinuityPlan;
      sc.travelDirection = sc.sceneContinuityPlan.travelDirection;
      sc.movementType = sc.sceneContinuityPlan.movementType;
      sc.startLocation = sc.sceneContinuityPlan.startLocation;
      sc.endLocation = sc.sceneContinuityPlan.endLocation;
      sc.carriedObjects = sc.sceneContinuityPlan.carriedObjects;

      // Guarantee 3 connected visual shots per scene for real journey progression
      if (!sc.shots || !Array.isArray(sc.shots) || sc.shots.length === 0) {
        sc.shots = [
          {
            shotNumber: 1,
            action: `${mainChar.name} initiating ${sc.movementType} from ${sc.startLocation}`,
            cameraAngle: sc.sceneContinuityPlan.cinematicCamera?.shotType || 'Wide establishing shot',
            visualPrompt: `Full-body shot of ${mainChar.continuityAnchor || mainChar.name}, starting ${sc.movementType} at ${sc.startLocation}, ${sc.visualPrompt}`
          },
          {
            shotNumber: 2,
            action: `${mainChar.name} in active motion: ${sc.sceneContinuityPlan.characterMovement || 'stepping forward'}`,
            cameraAngle: 'Side-tracking active locomotion shot',
            visualPrompt: `Dynamic motion shot of ${mainChar.continuityAnchor || mainChar.name}, active stride cycle, traveling toward ${sc.endLocation}, ${sc.visualPrompt}`
          },
          {
            shotNumber: 3,
            action: `${mainChar.name} arriving at ${sc.endLocation} with expressive reaction`,
            cameraAngle: 'Medium close-up arrival reaction',
            visualPrompt: `Expressive angle of ${mainChar.continuityAnchor || mainChar.name}, arriving at ${sc.endLocation}, sparkling eyes, ${sc.visualPrompt}`
          }
        ];
      } else if (sc.shots.length === 2) {
        sc.shots.push({
          shotNumber: 3,
          action: `${mainChar.name} arriving at ${sc.endLocation} with joyful reaction`,
          cameraAngle: 'Medium close-up arrival reaction',
          visualPrompt: `Expressive reaction shot of ${mainChar.continuityAnchor || mainChar.name}, reaching ${sc.endLocation}, ${sc.visualPrompt}`
        });
      }
    });

    data.estimatedTotalDuration = Math.round(cumulativeSecs * 10) / 10;
    data.estimatedDuration = data.estimatedTotalDuration;
    data.duration = data.estimatedTotalDuration;

    data.youtubeMetadata = this.generateYouTubeMetadata({
      title: data.title,
      moral: data.moral,
      scenes: data.scenes,
      characters: data.characters,
      language: data.language || 'en',
      mainCharacterName: data.mainCharacterName || (mainChar ? mainChar.name : '')
    });
  }

  /**
   * Generates YouTube metadata, chapters, tags, and audience engagement features
   * tailored for children's storytelling channels (inspired by YouTube reference videos).
   */
  generateYouTubeMetadata({ title, moral, scenes = [], characters = [], language = 'en', mainCharacterName = '' }) {
    const cleanTitle = (title || 'AI Animated Moral Story').replace(/^[^\w\s\u0900-\u097F]+/, '').trim();
    const isHindi = language === 'hi';
    const isMarathi = language === 'mr';

    const titles = [];
    if (isHindi) {
      titles.push(`${cleanTitle} | 3D Hindi Kahaniya - Moral Story for Kids`);
      titles.push(`${cleanTitle} (3D Cartoon Story) | मजेदार हिंदी कहानियां`);
      titles.push(`${cleanTitle} | बच्चों की प्रेरक कहानी | 3D Animation`);
    } else if (isMarathi) {
      titles.push(`${cleanTitle} | 3D Marathi Goshti - लहान मुलांसाठी बोधकथा`);
      titles.push(`${cleanTitle} | 3D Cartoon Story for Kids`);
    } else {
      titles.push(`${cleanTitle} | 3D Animated Moral Story for Kids`);
      titles.push(`${cleanTitle} - Cartoon Bedtime Story | 3D Animation`);
      titles.push(`The Amazing Tale of ${cleanTitle} | Kids 3D Story`);
    }

    // Video Chapters with exact timestamps
    const chapters = [];
    let currentSec = 0;
    scenes.forEach((sc, idx) => {
      const mins = Math.floor(currentSec / 60).toString().padStart(2, '0');
      const secs = Math.floor(currentSec % 60).toString().padStart(2, '0');
      const timeStr = `${mins}:${secs}`;
      const chapterName = sc.environment || sc.characterAction?.slice(0, 35) || `Scene ${sc.sceneNumber || idx + 1}`;
      chapters.push({
        timestamp: timeStr,
        seconds: currentSec,
        title: chapterName.replace(/^[^a-zA-Z0-9\u0900-\u097F]+/, '').trim()
      });
      currentSec += (sc.duration || sc.estimatedDuration || 4.5);
    });

    const chaptersText = chapters.map(c => `${c.timestamp} - ${c.title}`).join('\n');

    // Engaging Description
    const charNames = characters.map(c => c.name).filter(Boolean).join(', ');
    const description = [
      `🎬 Enjoy this beautiful 3D animated moral cartoon story for children: "${cleanTitle}"!`,
      ``,
      `🌟 Moral of the Story: ${moral || 'Slow and steady wins the race!'}`,
      ``,
      `⏱️ Video Chapters:`,
      chaptersText,
      ``,
      charNames ? `🐾 Featuring: ${charNames}` : '',
      ``,
      `🔔 Don't forget to Like, Share, and Subscribe for more high-quality 3D cartoon moral stories and bedtime tales!`,
      `#3DCartoon #MoralStories #KidsAnimation #BedtimeStories ${isHindi ? '#HindiKahaniya #HindiStories' : ''} ${isMarathi ? '#MarathiGoshti' : ''}`
    ].filter(line => line !== undefined).join('\n');

    // YouTube SEO Tags
    const baseTags = [
      '3d cartoon', 'moral stories for kids', 'bedtime stories', 'kids animation',
      '3d animated story', 'children cartoon video', 'fairy tales'
    ];
    if (isHindi) {
      baseTags.unshift('hindi kahaniya', 'moral hindi stories', 'kahani for kids', 'panchatantra in hindi', 'cartoon in hindi');
    } else if (isMarathi) {
      baseTags.unshift('marathi goshti', 'bodhkatha', 'marathi cartoon', 'kids marathi stories');
    }
    if (cleanTitle.toLowerCase().includes('rabbit') || cleanTitle.toLowerCase().includes('tortoise') || cleanTitle.includes('खरगोश') || cleanTitle.includes('कछुआ')) {
      baseTags.push('rabbit and tortoise', 'hare and tortoise race', 'खरगोश और कछुआ', 'slow and steady wins the race');
    }
    characters.forEach(c => {
      if (c.name) baseTags.push(c.name.toLowerCase());
    });

    // Pinned Comment for Audience Engagement
    const pinnedComment = isHindi
      ? `🌟 इस कहानी से आपको क्या सीख मिली? कछुए और खरगोश में से आपका पसंदीदा पात्र कौन सा है? हमें कमेंट्स में जरूर बताएं! 👇✨`
      : `🌟 What was your favorite moment in this story? Tell us in the comments below! Don't forget to subscribe for more 3D moral tales! 👇✨`;

    return {
      primaryTitle: titles[0],
      suggestedTitles: titles,
      description,
      chapters,
      tags: Array.from(new Set(baseTags)),
      tagsString: Array.from(new Set(baseTags)).join(', '),
      pinnedComment,
      pinnedCommentPrompt: pinnedComment,
      moral: moral || 'Slow and steady wins the race!',
      moralLesson: moral || 'Slow and steady wins the race!'
    };
  }

  /**
   * Intelligently expands a short title or story idea into a complete, age-appropriate
   * children's moral story with a beginning, middle, climax, ending, and meaningful moral lesson.
   */
  async expandShortStoryIdea(shortInput, langCode = 'en', styleObj = null) {
    const inputLower = (shortInput || '').toLowerCase();
    const styleSuffix = styleObj?.promptSuffix || '3D Pixar animation, Disney digital art, soft volumetric lighting, Octane 3D render, 8k';

    // 1. Canonical: The Rabbit and the Tortoise
    const hasRabbit = inputLower.includes('rabbit') || inputLower.includes('hare') || inputLower.includes('खरगोश') || inputLower.includes('ससा');
    const hasTortoise = inputLower.includes('tortoise') || inputLower.includes('turtle') || inputLower.includes('कछुआ') || inputLower.includes('कासव') || inputLower.includes('race') || inputLower.includes('steady');

    if (hasRabbit && hasTortoise) {
      let targetLang = langCode;
      if (langCode === 'en' && (inputLower.includes('खरगोश') || inputLower.includes('कछुआ'))) {
        targetLang = 'hi';
      } else if (langCode === 'en' && (inputLower.includes('ससा') || inputLower.includes('कासव'))) {
        targetLang = 'mr';
      }

      const storyTitle = 'The Rabbit and the Tortoise';
      const storyMoral = 'Slow and steady wins the race!';
      const englishSentences = [
        'The rabbit and tortoise stand on a forest path. The rabbit looks confident and challenges the tortoise.',
        'The race begins. The rabbit runs quickly while the tortoise starts walking slowly.',
        'Use a tracking shot to follow the rabbit running through the forest.',
        'The rabbit reaches a shady tree, becomes overconfident, lies down, and falls asleep.',
        'The tortoise continues walking along the path, passing trees and rocks with steady, visible steps.',
        'The tortoise moves closer to the finish line while the rabbit is still asleep.',
        'The rabbit wakes up, looks surprised, and runs toward the finish line.',
        'The tortoise crosses the finish line first. The animals react, and the story ends with the moral: Slow and steady wins the race.'
      ];

      let localizedSentences = englishSentences;
      let localizedTitle = storyTitle;
      let localizedMoral = storyMoral;

      if (targetLang === 'hi') {
        localizedTitle = 'खरगोश और कछुआ';
        localizedMoral = 'धीमी और स्थिर गति से ही जीत हासिल होती है!';
        localizedSentences = [
          'खरगोश और कछुआ जंगल के रास्ते पर खड़े हैं। खरगोश गर्व से कछुए को दौड़ की चुनौती देता है।',
          'दौड़ शुरू होती है। खरगोश तेजी से दौड़ता है जबकि कछुआ धीमी गति से चलना शुरू करता है।',
          'ट्रैकिंग शॉट जंगल के बीच से तेजी से दौड़ते हुए खरगोश का पीछा करता है।',
          'खरगोश एक छायादार पेड़ के पास पहुंचता है, अधिक आत्मविश्वासी होकर लेट जाता है और सो जाता है।',
          'कछुआ पेड़ों और पत्थरों को पार करते हुए स्थिर और दृढ़ कदमों से रास्ते पर चलता रहता है।',
          'कछुआ फिनिश लाइन के करीब पहुंचता है जबकि खरगोश अभी भी सो रहा है।',
          'खरगोश जागता है, आश्चर्यचकित होता है और फिनिश लाइन की ओर तेजी से दौड़ता है।',
          'कछुआ पहले फिनिश लाइन पार करता है। जानवर खुशी से झूम उठते हैं और सीख मिलती है: धीमी और स्थिर गति से ही जीत हासिल होती है।'
        ];
      } else if (langCode === 'mr') {
        localizedTitle = 'ससा आणि कासव';
        localizedMoral = 'हळू पण सातत्यपूर्ण चालणाराच शर्यत जिंकतो!';
        localizedSentences = [
          'ससा आणि कासव जंगलाच्या वाटेवर उभे आहेत. ससा आत्मविश्वासाने कासवाला शर्यतीचे आव्हान देतो.',
          'शर्यत सुरू होते. ससा वेगाने धावतो तर कासव हळूहळू चालण्यास सुरुवात करतो.',
          'ट्रॅकिंग शॉट जंगलातून वेगाने धावणाऱ्या सशाचा पाठलाग करतो.',
          'ससा एका सावलीदार झाडाजवळ पोहोचतो, अतिआत्मविश्वासाने खाली झोपतो आणि त्याला गाढ झोप लागते.',
          'कासव झाडे आणि दगड पार करत आपल्या संथ पण स्थिर पावलांनी वाटेवर पुढे जात राहतो.',
          'ससा अजूनही झोपलेला असताना कासव अंतिम रेषेच्या जवळ पोहोचतो.',
          'ससा जागा होतो, आश्चर्यचकित होऊन पाहतो आणि अंतिम रेषेकडे वेगाने धाव घेतो.',
          'कासव पहिल्यांदा अंतिम रेषा पार करतो. सर्व प्राणी आनंदोत्सव साजरा करतात आणि शिकवण मिळते: हळू पण सातत्यपूर्ण चालणाराच शर्यत जिंकतो.'
        ];
      }

      return {
        title: `🏆 ${localizedTitle}`,
        moral: localizedMoral,
        sentences: localizedSentences,
        mainCharacterName: 'Barnaby the Rabbit',
        characters: [
          {
            name: 'Barnaby the Rabbit',
            isMainCharacter: true,
            species: 'rabbit',
            age: 'Young',
            gender: 'male',
            appearance: 'Adorable 3D animated cartoon rabbit with silky golden-brown fur, long alert ears with soft pink inner lining, athletic build, big animated hazel eyes, and twitching whiskers',
            color: 'Golden honey-brown and white',
            clothing: 'Red sporty runner vest with golden trim and matching headband',
            distinctiveFeatures: 'Long alert ears with pink interior, athletic runner vest, expressive mischievous eyes',
            personality: 'Swift, confident, energetic, and boastful',
            voiceType: 'energetic',
            voiceSuggestion: targetLang === 'hi' ? 'hi-IN-MadhurNeural' : targetLang === 'mr' ? 'mr-IN-ManoharNeural' : 'en-US-ChristopherNeural',
            continuityAnchor: 'Barnaby the Rabbit, athletic 3D Pixar rabbit with long alert ears, red runner vest, red headband, expressive hazel eyes, silky golden fur',
            referencePrompt: `Full-body 3D Pixar character reference sheet of Barnaby the Rabbit, athletic bunny with red runner vest and headband, front view, side view, 3/4 angle, action pose, white background, ${styleSuffix}, 8k`
          },
          {
            name: 'Tobias the Tortoise',
            isMainCharacter: false,
            species: 'tortoise',
            age: 'Wise',
            gender: 'male',
            appearance: 'Lovable 3D animated tortoise with textured emerald-green hexagonal shell with golden highlights, friendly wrinkled neck, kind sparkling brown eyes, and sturdy walking legs',
            color: 'Emerald green shell and olive skin',
            clothing: 'Rustic brown neckerchief and small explorer pouch',
            distinctiveFeatures: 'Detailed textured green shell, kind smiling face, patient sturdy walking feet',
            personality: 'Patient, calm, persistent, and determined',
            voiceType: 'calm',
            voiceSuggestion: targetLang === 'hi' ? 'hi-IN-SwaraNeural' : targetLang === 'mr' ? 'mr-IN-AarohiNeural' : 'en-US-JennyNeural',
            continuityAnchor: 'Tobias the Tortoise, friendly 3D Pixar tortoise with emerald-green patterned shell, warm brown eyes, brown neckerchief, patient gentle smile',
            referencePrompt: `Full-body 3D Pixar character reference sheet of Tobias the Tortoise, friendly tortoise with emerald-green shell and neckerchief, front view, side view, 3/4 angle, action pose, white background, ${styleSuffix}, 8k`
          }
        ]
      };
    }

    // 2. The Clever Crow
    if (inputLower.includes('crow') && (inputLower.includes('thirsty') || inputLower.includes('water') || inputLower.includes('pitcher') || inputLower.includes('pebble'))) {
      const storyTitle = 'The Clever Crow';
      const storyMoral = 'Where there is a will, there is always a way!';
      const englishSentences = [
        'On a scorching sunny day, Corvus the clever crow flew over the dry woodland looking desperately for water.',
        'Corvus spotted a clay pitcher in a village garden, but the water level was far too low for his beak to reach.',
        'Looking around carefully, the intelligent crow noticed smooth little pebbles scattered along the garden path.',
        'One by one, Corvus picked up the heavy pebbles in his beak and dropped them patiently into the pitcher.',
        'With each pebble dropped, the water level rose steadily higher and higher until it reached the top.',
        'Corvus dipped his beak and drank the cool refreshing water happily, proving that clever thinking solves any problem.'
      ];

      return {
        title: `🪶 ${storyTitle}`,
        moral: storyMoral,
        sentences: englishSentences,
        mainCharacterName: 'Corvus the Crow',
        characters: [
          {
            name: 'Corvus the Crow',
            isMainCharacter: true,
            species: 'crow',
            age: 'Young',
            gender: 'male',
            appearance: 'Intelligent 3D cartoon crow with shimmering iridescent obsidian feathers, sleek curved beak, and expressive inquisitive eyes',
            color: 'Glossy obsidian black and sapphire sheen',
            clothing: 'Miniature aviator goggles perched on forehead',
            distinctiveFeatures: 'Iridescent black feathers, shiny curved beak, bright inquisitive eyes',
            personality: 'Resourceful, persistent, observant, and clever',
            voiceType: 'energetic',
            voiceSuggestion: langCode === 'hi' ? 'hi-IN-MadhurNeural' : langCode === 'mr' ? 'mr-IN-ManoharNeural' : 'en-US-ChristopherNeural',
            continuityAnchor: 'Corvus the Crow, intelligent 3D Pixar crow with glossy iridescent obsidian feathers, aviator goggles, bright curious eyes',
            referencePrompt: `Full-body 3D Pixar character reference sheet of Corvus the Crow, glossy black feathers and goggles, front view, side view, 3/4 angle, white background, ${styleSuffix}, 8k`
          }
        ]
      };
    }

    // 3. The Lion and the Mouse
    if (inputLower.includes('lion') && inputLower.includes('mouse')) {
      const storyTitle = 'The Lion and the Tiny Mouse';
      const storyMoral = 'No act of kindness, no matter how small, is ever wasted.';
      const englishSentences = [
        'In the golden savanna, Leo the mighty lion was sleeping peacefully when Pip the tiny mouse scampered across his paw.',
        'Leo woke up with a rumble and caught Pip, but the tiny mouse begged for mercy, promising he would help the lion one day.',
        'Amused by the tiny mouse, Leo laughed heartily and gently let Pip go free into the tall grass.',
        'Days later, Leo was trapped inside a heavy rope net set by hunters and let out a desperate, echoing roar.',
        'Pip heard the familiar roar, scurried quickly to the net, and gnawed through the thick ropes with his sharp teeth.',
        'The mighty lion broke free and thanked his tiny savior, learning that even the smallest friend can be of great help.'
      ];

      return {
        title: `🦁 ${storyTitle}`,
        moral: storyMoral,
        sentences: englishSentences,
        mainCharacterName: 'Pip the Mouse',
        characters: [
          {
            name: 'Pip the Mouse',
            isMainCharacter: true,
            species: 'mouse',
            age: 'Child',
            gender: 'male',
            appearance: 'Tiny adorable 3D animated mouse with velvety soft slate-grey fur, oversized round pink ears, and glossy dark button eyes',
            color: 'Soft slate-grey and pastel pink',
            clothing: 'Tiny green leaf vest with stitched acorn button',
            distinctiveFeatures: 'Big pink ears, long curly tail, leaf vest, twitching whiskers',
            personality: 'Brave, loyal, quick-witted, and compassionate',
            voiceType: 'childlike',
            voiceSuggestion: langCode === 'hi' ? 'hi-IN-SwaraNeural' : langCode === 'mr' ? 'mr-IN-AarohiNeural' : 'en-US-JennyNeural',
            continuityAnchor: 'Pip the Mouse, tiny cute 3D Pixar mouse with soft grey fur, large pink ears, dark button eyes, tiny leaf vest',
            referencePrompt: `Full-body 3D Pixar character reference sheet of Pip the Mouse, tiny mouse with leaf vest, front view, side view, 3/4 angle, white background, ${styleSuffix}, 8k`
          },
          {
            name: 'Leo the Lion',
            isMainCharacter: false,
            species: 'lion',
            age: 'Adult',
            gender: 'male',
            appearance: 'Magnificent 3D cartoon lion with lush golden-amber mane, warm honey-colored fur, powerful cartoon paws, and noble expressive face',
            color: 'Golden amber and honey',
            clothing: 'Braided leather cord around collar',
            distinctiveFeatures: 'Lush golden mane, warm amber eyes, regal stance',
            personality: 'Noble, powerful, proud, but grateful',
            voiceType: 'calm',
            voiceSuggestion: langCode === 'hi' ? 'hi-IN-MadhurNeural' : langCode === 'mr' ? 'mr-IN-ManoharNeural' : 'en-US-ChristopherNeural',
            continuityAnchor: 'Leo the Lion, noble 3D Pixar lion with flowing golden mane, expressive amber eyes, regal posture',
            referencePrompt: `Full-body 3D Pixar character reference sheet of Leo the Lion, noble lion with golden mane, front view, side view, 3/4 angle, white background, ${styleSuffix}, 8k`
          }
        ]
      };
    }

    // 4. Default / Generic Short Idea Expander
    const cleanPrompt = shortInput.replace(/[^\w\s]/g, '').trim();
    const heroName = 'Barnaby the Rabbit';
    return {
      title: `✨ The Adventure of ${cleanPrompt || 'The Brave Friend'}`,
      moral: 'Kindness and courage light the path to wonderful discoveries!',
      sentences: [
        `Once upon a time in a sunny enchanted forest, ${heroName} set out on a grand adventure: ${shortInput}.`,
        `${heroName} stepped onto the winding wildflower trail, carrying a small satchel and a heart full of curiosity.`,
        `Along the path, ${heroName} encountered an unexpected challenge that required courage and patience.`,
        `With bright determination and a warm smile, ${heroName} overcame the obstacle and made a wonderful discovery.`,
        `Under the golden evening sky, ${heroName} celebrated with woodland friends, proving that courage and kindness always win.`
      ],
      mainCharacterName: heroName,
      characters: [
        {
          name: heroName,
          isMainCharacter: true,
          species: 'rabbit',
          age: 'Young',
          gender: 'neutral',
          appearance: 'Cute white rabbit with pink inner ears, sky-blue woolen scarf, and miniature red adventurer backpack',
          color: 'Snow-white and sky-blue',
          clothing: 'Sky-blue woolen scarf and small red backpack',
          distinctiveFeatures: 'Big expressive brown eyes and button pink nose',
          personality: 'Curious, brave, and kind-hearted',
          voiceType: 'childlike',
          voiceSuggestion: langCode === 'hi' ? 'hi-IN-SwaraNeural' : langCode === 'mr' ? 'mr-IN-AarohiNeural' : 'en-US-JennyNeural',
          continuityAnchor: `${heroName}, cute white bunny with pink inner ears, sky-blue scarf, red backpack, sparkling eyes`,
          referencePrompt: `Full-body 3D Pixar character reference sheet of ${heroName}, cute white bunny with blue scarf, front view, side view, 3/4 angle, white background, ${styleSuffix}, 8k`
        }
      ]
    };
  }

  /**
   * Extracts characters with persistent visual features and voice suggestions from script text.
   */
  detectStoryCharacters({ fullText, englishText, characterMap, langObj, styleObj }) {
    const textLower = `${fullText} ${englishText}`.toLowerCase();
    const extracted = [];
    const styleSuffix = styleObj?.promptSuffix || '3d animation, 8k';

    // Animal species profiles with 3D Pixar traits
    const animalProfiles = [
      {
        keys: ['rabbit', 'hare', 'bunny'],
        defaultName: 'Barnaby the Rabbit',
        species: 'rabbit',
        appearance: 'Cute expressive 3D animated cartoon rabbit with silky golden-brown fur, long alert ears with pink inner lining, athletic build, big animated hazel eyes, and twitching whiskers',
        color: 'Golden-brown and pure white',
        clothing: 'Red athletic runner vest and red headband',
        distinctiveFeatures: 'Long alert ears with pink inner lining, red runner vest, expressive eyes',
        personality: 'Swift, energetic, confident, and spirited',
        voiceType: 'energetic',
        voiceSuggestion: langObj.code === 'hi' ? 'hi-IN-MadhurNeural' : langObj.code === 'mr' ? 'mr-IN-ManoharNeural' : 'en-US-ChristopherNeural',
        continuityAnchor: 'Barnaby the Rabbit, athletic 3D Pixar rabbit with long alert ears, red runner vest, red headband, expressive hazel eyes, silky golden fur'
      },
      {
        keys: ['tortoise', 'turtle'],
        defaultName: 'Tobias the Tortoise',
        species: 'tortoise',
        appearance: 'Lovable 3D animated tortoise with textured emerald-green hexagonal shell with golden highlights, friendly wrinkled neck, kind sparkling brown eyes, and sturdy walking legs',
        color: 'Emerald green shell and olive skin',
        clothing: 'Rustic brown neckerchief and small explorer pouch',
        distinctiveFeatures: 'Detailed textured green shell, kind smiling face, patient sturdy walking feet',
        personality: 'Patient, calm, persistent, and determined',
        voiceType: 'calm',
        voiceSuggestion: langObj.code === 'hi' ? 'hi-IN-SwaraNeural' : langObj.code === 'mr' ? 'mr-IN-AarohiNeural' : 'en-US-JennyNeural',
        continuityAnchor: 'Tobias the Tortoise, friendly 3D Pixar tortoise with emerald-green patterned shell, warm brown eyes, brown neckerchief, patient gentle smile'
      },
      {
        keys: ['lion'],
        defaultName: 'Leo the Lion',
        species: 'lion',
        appearance: 'Magnificent 3D cartoon lion with lush golden-amber mane, warm honey-colored fur, powerful cartoon paws, and noble expressive face',
        color: 'Golden amber and honey',
        clothing: 'Braided leather cord around collar',
        distinctiveFeatures: 'Lush golden mane, warm amber eyes, regal stance',
        personality: 'Noble, powerful, proud, but compassionate',
        voiceType: 'calm',
        voiceSuggestion: langObj.code === 'hi' ? 'hi-IN-MadhurNeural' : langObj.code === 'mr' ? 'mr-IN-ManoharNeural' : 'en-US-ChristopherNeural',
        continuityAnchor: 'Leo the Lion, noble 3D Pixar lion with flowing golden mane, expressive amber eyes, regal posture'
      },
      {
        keys: ['mouse'],
        defaultName: 'Pip the Mouse',
        species: 'mouse',
        appearance: 'Tiny adorable 3D animated mouse with velvety soft slate-grey fur, oversized round pink ears, and glossy dark button eyes',
        color: 'Soft slate-grey and pastel pink',
        clothing: 'Tiny green leaf vest with stitched acorn button',
        distinctiveFeatures: 'Big pink ears, long curly tail, leaf vest, twitching whiskers',
        personality: 'Brave, loyal, quick-witted, and compassionate',
        voiceType: 'childlike',
        voiceSuggestion: langObj.code === 'hi' ? 'hi-IN-SwaraNeural' : langObj.code === 'mr' ? 'mr-IN-AarohiNeural' : 'en-US-JennyNeural',
        continuityAnchor: 'Pip the Mouse, tiny cute 3D Pixar mouse with soft grey fur, large pink ears, dark button eyes, tiny leaf vest'
      },
      {
        keys: ['crow', 'raven'],
        defaultName: 'Corvus the Crow',
        species: 'crow',
        appearance: 'Intelligent 3D cartoon crow with shimmering iridescent obsidian feathers, sleek curved beak, and expressive inquisitive eyes',
        color: 'Glossy obsidian black and sapphire sheen',
        clothing: 'Miniature aviator goggles perched on forehead',
        distinctiveFeatures: 'Iridescent black feathers, shiny curved beak, bright inquisitive eyes',
        personality: 'Resourceful, persistent, observant, and clever',
        voiceType: 'energetic',
        voiceSuggestion: langObj.code === 'hi' ? 'hi-IN-MadhurNeural' : langObj.code === 'mr' ? 'mr-IN-ManoharNeural' : 'en-US-ChristopherNeural',
        continuityAnchor: 'Corvus the Crow, intelligent 3D Pixar crow with glossy iridescent obsidian feathers, aviator goggles, bright curious eyes'
      },
      {
        keys: ['squirrel'],
        defaultName: 'Sammy the Squirrel',
        species: 'squirrel',
        appearance: 'Energetic fluffy 3D squirrel with bushy russet tail, bright black eyes, and twitching whiskers',
        color: 'Warm russet and cream',
        clothing: 'Bright yellow knitted vest',
        distinctiveFeatures: 'Big bushy tail, fluffy cheeks, yellow vest',
        personality: 'Lively, playful, and cheerful',
        voiceType: 'childlike',
        voiceSuggestion: langObj.code === 'hi' ? 'hi-IN-SwaraNeural' : langObj.code === 'mr' ? 'mr-IN-AarohiNeural' : 'en-US-JennyNeural',
        continuityAnchor: 'Sammy the Squirrel, cute fluffy 3D Pixar squirrel with bushy tail and yellow knitted vest'
      },
      {
        keys: ['hedgehog'],
        defaultName: 'Pip the Hedgehog',
        species: 'hedgehog',
        appearance: 'Cute little hedgehog with soft brown spines, peach belly, and round shiny nose',
        color: 'Warm brown and peach',
        clothing: 'Teal woolen scarf',
        distinctiveFeatures: 'Soft spikes, button nose, teal scarf',
        personality: 'Gentle, shy, and sweet',
        voiceType: 'childlike',
        voiceSuggestion: langObj.code === 'hi' ? 'hi-IN-SwaraNeural' : langObj.code === 'mr' ? 'mr-IN-AarohiNeural' : 'en-US-JennyNeural',
        continuityAnchor: 'Pip the Hedgehog, cute 3D Pixar hedgehog with soft spines and teal scarf'
      }
    ];

    const addedNames = new Set();

    // 1. Identify which animal profiles appear in the script, ordered by their first introduction in the story
    const matchingProfiles = [];
    for (const prof of animalProfiles) {
      let earliestPos = Infinity;
      for (const k of prof.keys) {
        const idx = textLower.indexOf(k);
        if (idx !== -1 && idx < earliestPos) {
          earliestPos = idx;
        }
      }
      if (earliestPos !== Infinity) {
        matchingProfiles.push({ prof, pos: earliestPos });
      }
    }
    // Sort so the first animal introduced is the primary lead protagonist
    matchingProfiles.sort((a, b) => a.pos - b.pos);

    const commonFilter = new Set([
      'the', 'once', 'upon', 'time', 'there', 'they', 'then', 'when', 'what', 
      'suddenly', 'together', 'after', 'before', 'here', 'look', 'with', 'from',
      'under', 'deep', 'just', 'because', 'remember', 'subscribe', 'watch',
      'scene', 'total', 'video', 'title', 'shorts', 'moral', 'slow', 'steady',
      'wins', 'race', 'fast', 'quick', 'end', 'ends', 'story', 'lesson', 'friend', 'friends',
      'forest', 'path', 'tree', 'finish', 'line', 'one', 'day', 'two', 'three', 'all',
      'now', 'so', 'as', 'in', 'on', 'at', 'to', 'for', 'of', 'by', 'about', 'like',
      'through', 'over', 'into', 'this', 'that', 'these', 'those', 'his', 'her', 'their',
      'beautiful', 'green', 'great', 'little', 'big', 'huge', 'small', 'good', 'bad'
    ]);

    for (const { prof } of matchingProfiles) {
      if (extracted.length >= 3) break;
      const isLead = extracted.length === 0;

      // Check if user script explicitly named this character (e.g., "Coco the brave rabbit", "Ruby the white rabbit", "Pip the curious squirrel")
      let customName = null;
      const speciesPattern = prof.keys.join('|');
      const directRegex = new RegExp(`\\b([A-Z][a-z]{1,15})\\s+(?:the\\s+)?(?:[a-z-]+\\s+){0,3}(?:${speciesPattern})\\b`, 'i');
      const directMatch = fullText.match(directRegex) || englishText.match(directRegex);
      if (directMatch && !commonFilter.has(directMatch[1].toLowerCase())) {
        customName = directMatch[1];
      }

      if (!customName) {
        // Check characterMap candidates that appear in proximity to the animal species in the text
        for (const [lowerName, originalName] of characterMap.entries()) {
          if (addedNames.has(lowerName) || commonFilter.has(lowerName)) continue;
          for (const k of prof.keys) {
            const kPos = textLower.indexOf(k);
            const namePos = textLower.indexOf(lowerName);
            if (kPos !== -1 && namePos !== -1 && Math.abs(kPos - namePos) < 60) {
              customName = originalName;
              break;
            }
          }
          if (customName) break;
        }
      }

      const capSpecies = prof.species.charAt(0).toUpperCase() + prof.species.slice(1);
      const effectiveName = customName 
        ? (customName.toLowerCase().includes(prof.species) ? customName : `${customName} the ${capSpecies}`)
        : prof.defaultName;

      const continuityAnchor = customName
        ? `${effectiveName}, cute 3D Pixar ${prof.species} with expressive eyes, distinctive appearance, ${prof.clothing}`
        : prof.continuityAnchor;

      extracted.push({
        name: effectiveName,
        isMainCharacter: isLead,
        species: prof.species,
        age: 'Young',
        gender: 'neutral',
        appearance: prof.appearance,
        color: prof.color,
        clothing: prof.clothing,
        distinctiveFeatures: prof.distinctiveFeatures,
        personality: prof.personality,
        voiceType: prof.voiceType,
        voiceSuggestion: prof.voiceSuggestion,
        continuityAnchor: continuityAnchor,
        referencePrompt: `Full-body 3D Pixar character reference sheet of ${continuityAnchor}, front view, side view, 3/4 angle, white background, ${styleSuffix}, 8k`
      });
      addedNames.add(effectiveName.toLowerCase());
      if (customName) addedNames.add(customName.toLowerCase());
      prof.keys.forEach(k => addedNames.add(k));
    }

    // 2. Process dialogue speakers or named proper nouns from characterMap if not already covered
    for (const [lowerName, charName] of characterMap.entries()) {
      if (extracted.length >= 3) break;
      if (addedNames.has(lowerName) || Array.from(addedNames).some(n => lowerName.includes(n) || n.includes(lowerName))) {
        continue;
      }

      let matchedProfile = null;
      for (const prof of animalProfiles) {
        if (prof.keys.some(k => textLower.includes(k) && (lowerName.includes(k) || charName.toLowerCase().includes(k)))) {
          matchedProfile = prof;
          break;
        }
      }

      const isLead = extracted.length === 0;
      const detectedSpecies = matchedProfile ? matchedProfile.species : 'animated cartoon character';
      const anchor = matchedProfile 
        ? `${charName} (${matchedProfile.continuityAnchor})`
        : `${charName} the ${detectedSpecies}, cute expressive 3D Pixar cartoon style, sparkling eyes, distinctive friendly appearance`;

      extracted.push({
        name: charName,
        isMainCharacter: isLead,
        species: detectedSpecies,
        age: 'Young',
        gender: 'neutral',
        appearance: matchedProfile ? matchedProfile.appearance : `Adorable 3D animated ${detectedSpecies} with big expressive eyes and charming features`,
        color: matchedProfile ? matchedProfile.color : (isLead ? 'Pure bright white with soft pink accents' : 'Warm chestnut and golden tones'),
        clothing: matchedProfile ? matchedProfile.clothing : (isLead ? 'Sky-blue scarf and miniature red adventurer backpack' : 'Bright yellow vest with tiny buttons'),
        distinctiveFeatures: matchedProfile ? matchedProfile.distinctiveFeatures : `Signature ${detectedSpecies} proportions, friendly smile and expressive eyes`,
        personality: matchedProfile ? matchedProfile.personality : 'Kind, generous, optimistic, and caring',
        voiceType: matchedProfile ? matchedProfile.voiceType : (isLead ? 'childlike' : 'energetic'),
        voiceSuggestion: matchedProfile ? matchedProfile.voiceSuggestion : (langObj.code === 'hi' ? 'hi-IN-SwaraNeural' : langObj.code === 'mr' ? 'mr-IN-AarohiNeural' : 'en-US-JennyNeural'),
        continuityAnchor: anchor,
        referencePrompt: `Full-body 3D Pixar character reference sheet of ${anchor}, front view, side view, 3/4 angle, white background, ${styleSuffix}, 8k`
      });
      addedNames.add(charName.toLowerCase());
    }

    // Default fallback if no characters found
    if (extracted.length === 0) {
      extracted.push({
        name: 'Ruby the Rabbit',
        isMainCharacter: true,
        species: 'rabbit',
        age: 'Young',
        gender: 'female',
        appearance: 'Cute white rabbit with pink inner ears, blue scarf, and red backpack holding a shiny red apple',
        color: 'Snow-white and sky-blue',
        clothing: 'Sky-blue woolen scarf and small red backpack',
        distinctiveFeatures: 'Big expressive brown eyes and button pink nose',
        personality: 'Generous, sweet, and caring',
        voiceType: 'childlike',
        voiceSuggestion: langObj.code === 'hi' ? 'hi-IN-SwaraNeural' : langObj.code === 'mr' ? 'mr-IN-AarohiNeural' : 'en-US-JennyNeural',
        continuityAnchor: 'Ruby the Rabbit, cute white bunny with pink inner ears, sky-blue scarf, red backpack, holding a shiny red apple',
        referencePrompt: `Character reference sheet of Ruby the Rabbit, cute white bunny with blue scarf and red backpack, 3D Pixar style, 8k`
      });
    }

    return extracted;
  }

  /**
   * Intelligent Local Script Parser:
   * Expands short story ideas or parses full scripts dynamically, guaranteeing
   * 100% preservation of user narratives, character consistency, and natural durations.
   */
  async parseScriptLocally(rawText, styleObj, langObj, aspectRatio = '9:16') {
    // 1. Clean and split script into lines & sentences (supporting Latin .!? and Devanagari । ॥)
    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const fullText = lines.join(' ');
    const rawSentences = fullText.match(/[^.!?।॥\n]+[.!?।॥\n]+|\S[^.!?।॥\n]*/gu) || [fullText];

    // 2. Extract dialogue lines and character candidates
    const dialogueEntries = [];
    const characterMap = new Map();
    const dialogueColonRegex = /^([\p{L}\p{M}\w\s]{1,25}):\s*["'“]?([^"'“”]+)["'”]?$/u;

    lines.forEach(line => {
      const matchColon = line.match(dialogueColonRegex);
      if (matchColon) {
        const charName = matchColon[1].trim();
        const speech = matchColon[2].trim();
        dialogueEntries.push({ speaker: charName, text: speech });
        if (!characterMap.has(charName.toLowerCase())) {
          characterMap.set(charName.toLowerCase(), charName);
        }
      }
    });

    // Check if script is non-English (Hindi/Marathi) and translate to English for entity detection & visual prompts
    let englishText = fullText;
    if (/[\u0900-\u097F]/.test(fullText)) {
      try {
        englishText = await this.translateText(fullText, 'en');
      } catch (_) {}
    }

    // Extract named entities from proper nouns in both fullText and englishText
    const properNounRegex = /\b([A-Z][a-z]{2,15})\b/g;
    let match;
    const commonWords = new Set([
      'The', 'Once', 'Upon', 'Time', 'There', 'They', 'Then', 'When', 'What', 
      'Suddenly', 'Together', 'After', 'Before', 'Here', 'Look', 'With', 'From',
      'Under', 'Deep', 'Just', 'Because', 'Remember', 'Subscribe', 'Watch',
      'Scene', 'Total', 'Video', 'Title', 'Shorts', 'Moral', 'Slow', 'Steady',
      'Wins', 'Race', 'Fast', 'Quick', 'End', 'Ends', 'Story', 'Lesson', 'Friend', 'Friends',
      'Forest', 'Path', 'Tree', 'Finish', 'Line', 'One', 'Day', 'Two', 'Three', 'All',
      'Now', 'So', 'As', 'In', 'On', 'At', 'To', 'For', 'Of', 'By', 'About', 'Like',
      'Through', 'Over', 'Into', 'This', 'That', 'These', 'Those', 'His', 'Her', 'Their',
      'Beautiful', 'Green', 'Great', 'Little', 'Big', 'Huge', 'Small', 'Good', 'Bad'
    ]);

    const combinedTexts = [fullText, englishText];
    for (const txt of combinedTexts) {
      while ((match = properNounRegex.exec(txt)) !== null) {
        const candidate = match[1];
        if (!commonWords.has(candidate) && !characterMap.has(candidate.toLowerCase())) {
          characterMap.set(candidate.toLowerCase(), candidate);
        }
      }
    }

    // 3. Check if user provided only a short title or story idea
    const trimmedFull = fullText.trim();
    const wordCount = trimmedFull.split(/\s+/).filter(Boolean).length;
    const isSingleTitle = rawSentences.length === 1 && (
      wordCount <= 14 ||
      !/[.!?]$/.test(trimmedFull) ||
      /^(the\s+[a-z\s]+|story\s+(of|about)|a\s+story\s+about|moral\s+story)/i.test(trimmedFull)
    );
    const isPromptIdea = (
      rawSentences.length <= 2 &&
      /^(story about|write a story|generate a story|create a story|tell a story|idea:|concept:)/i.test(trimmedFull)
    );
    const isShortIdea = (isSingleTitle || isPromptIdea) && dialogueEntries.length === 0;

    let effectiveSentences = rawSentences;
    let extractedCharacters = [];
    let storyTitle = '';
    let storyMoral = '';

    if (isShortIdea) {
      console.log(`[ScriptAnalysisService] Short story idea/title detected ("${fullText.slice(0, 45)}..."). Developing complete moral story narrative...`);
      const expanded = await this.expandShortStoryIdea(fullText, langObj.code, styleObj);
      effectiveSentences = expanded.sentences;
      extractedCharacters = expanded.characters;
      storyTitle = expanded.title;
      storyMoral = expanded.moral;
    } else {
      // Complete user script: preserve 100% of user sentences and detect characters
      extractedCharacters = this.detectStoryCharacters({
        fullText,
        englishText,
        characterMap,
        langObj,
        styleObj
      });
    }

    const mainChar = extractedCharacters[0];

    // 4. Plan scenes automatically based on sentences and dialogue
    const planned = await this.planScenes({
      scriptText: fullText,
      sentences: effectiveSentences,
      dialogueEntries,
      characters: extractedCharacters,
      styleObj,
      langObj,
      aspectRatio
    });

    if (!storyTitle) {
      const firstCleanSentence = rawSentences[0] ? rawSentences[0].slice(0, 45).replace(/[^\p{L}\p{M}\p{N}\s]/gu, '').trim() : '';
      let titleCandidate = firstCleanSentence && firstCleanSentence.length > 2
        ? firstCleanSentence
        : (langObj.code === 'hi' ? 'खरगोश जिसने अपना सेब बाँटा' : langObj.code === 'mr' ? 'ससा ज्याने सफरचंद वाटले' : 'The Rabbit Who Shared His Apple');

      if (langObj.code === 'hi' && !/[\u0900-\u097F]/.test(titleCandidate)) {
        titleCandidate = await this.translateText(titleCandidate, 'hi');
      } else if (langObj.code === 'mr' && !/[\u0900-\u097F]/.test(titleCandidate)) {
        titleCandidate = await this.translateText(titleCandidate, 'mr');
      }
      storyTitle = `✨ ${titleCandidate} 🍎`;
    }

    if (!storyMoral) {
      const moralMatch = fullText.match(/(?:moral|lesson|learn|moral of the story|moral:)\s*(?:is|:|-)?\s*["'“]?([^.\n!]+[.!]?)/i);
      if (moralMatch && moralMatch[1] && moralMatch[1].trim().length > 3) {
        storyMoral = moralMatch[1].trim();
      }
    }

    if (!storyMoral) {
      storyMoral = langObj.code === 'hi' 
        ? 'बाँटने से हमेशा खुशी बढ़ती है!' 
        : langObj.code === 'mr' 
        ? 'वाटून घेतल्याने आनंद द्विगुणित होतो!' 
        : 'Sharing makes happiness grow!';
    }

    const youtubeMetadata = this.generateYouTubeMetadata({
      title: storyTitle,
      moral: storyMoral,
      scenes: planned.scenes,
      characters: extractedCharacters,
      language: langObj.code,
      mainCharacterName: mainChar ? mainChar.name : ''
    });

    return {
      title: storyTitle,
      logline: fullText.slice(0, 140),
      musicMood: styleObj.id === 'motivational' ? 'cinematic_epic' : styleObj.id === 'cartoon' ? 'playful_cartoon' : 'calm_acoustic',
      moral: storyMoral,
      language: langObj.code,
      mainCharacter: mainChar.name,
      mainCharacterName: mainChar.name,
      characters: extractedCharacters,
      scenes: planned.scenes,
      youtubeMetadata,
      estimatedTotalDuration: planned.estimatedTotalDuration,
      estimatedDuration: planned.estimatedTotalDuration,
      duration: planned.estimatedTotalDuration
    };
  }
}

export const scriptAnalysisService = new ScriptAnalysisService();
export const analyzeScript = (args) => scriptAnalysisService.analyzeScript(args);
export const planScenes = (args) => scriptAnalysisService.planScenes(args);
export const estimateSceneDuration = (scene) => scriptAnalysisService.estimateSceneDuration(scene);
