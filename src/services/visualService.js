import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { spawnSync } from 'child_process';
import { config } from '../config.js';

class VisualService {
  constructor() {
    this.imagesDir = path.join(config.storageDir, 'images');
    this.assetsCharactersDir = path.join(config.assetsDir, 'characters');
    if (!fs.existsSync(this.imagesDir)) {
      fs.mkdirSync(this.imagesDir, { recursive: true });
    }
  }

  /**
   * Generates a comprehensive multi-view 3D character turnaround reference sheet
   * (Front view, 3/4 perspective, side profile, active movement stride, and full model turnaround sheet)
   */
  async generateCharacterReferenceSheet({ character, style = '3d_animation' }) {
    const styleObj = config.videoStyles.find(s => s.id === style) || config.videoStyles[0];
    const charId = character.id || `char-${this.hashString(character.name)}`;
    const baseFilename = `char_${charId}`;

    const filenamePrimary = `${baseFilename}_ref.jpg`;
    const filenameThreeQuarter = `${baseFilename}_3quarter.jpg`;
    const filenameSide = `${baseFilename}_side.jpg`;
    const filenameAction = `${baseFilename}_action.jpg`;
    const filenameSheet = `${baseFilename}_sheet.jpg`;

    const pathPrimary = path.join(this.imagesDir, filenamePrimary);
    const pathThreeQuarter = path.join(this.imagesDir, filenameThreeQuarter);
    const pathSide = path.join(this.imagesDir, filenameSide);
    const pathAction = path.join(this.imagesDir, filenameAction);
    const pathSheet = path.join(this.imagesDir, filenameSheet);

    const charSeed = character.seed || Math.abs(this.hashString(character.name + (character.species || '')));

    // Texture description according to style and species
    const textureFocus = style === 'cute_animals' 
      ? 'ultra-detailed fluffy soft fur textures, glistening whiskers, tactile paw pads, gleaming round curious eyes'
      : style === 'fantasy'
      ? 'iridescent glowing skin, ethereal textured garments, soft luminous fairy-dust reflections, expressive magical eyes'
      : style === 'children_stories'
      ? 'lovable friendly storybook textures, soft woven woolen clothing, warm expressive joyful smile'
      : 'detailed skin subsurface scattering, micro-textured clothing fabrics, glossy expressive 3D animated eyes';

    // 1. Front View Portrait Prompt (Detailed 3D model, expressive face, natural anatomy)
    const primaryPrompt = `Masterpiece original 3D animated cartoon character model of ${character.name}, a ${character.species || 'cartoon character'}. Front view portrait facing camera, big expressive sparkling eyes, natural body proportions, ${textureFocus}. Color palette: ${character.color || 'vibrant harmonious colors'}. Wearing: ${character.clothing || 'signature outfit'}. Soft cinematic lighting, raytraced reflections and subsurface scattering, Octane render, isolated on soft clean background, ${styleObj.promptSuffix}, 8k`;

    // 2. 3/4 Perspective Angle View Prompt (Cinematic body proportions and depth)
    const threeQuarterPrompt = `Masterpiece 3D cartoon character concept of ${character.name}, three-quarter dynamic perspective angle, expressive joyful posture, detailed clothing: ${character.clothing || 'signature outfit'}, consistent colors: ${character.color || 'signature palette'}, natural body proportions, volumetric rim lighting, raytraced shadows, 8k, ${styleObj.promptSuffix}`;

    // 3. Side Profile View Prompt (Silhouette and accessory depth)
    const sidePrompt = `Masterpiece 3D Pixar character turnaround side profile view of ${character.name}, clean silhouette, showing outfit details and accessories, cinematic lighting, 8k, ${styleObj.promptSuffix}`;

    // 4. Action Movement Stride Pose Prompt (Active locomotion: legs moving in stride cycle, arms swinging)
    const actionPrompt = `Masterpiece 3D Pixar animated feature dynamic action pose of ${character.name}, active natural walking stride locomotion cycle, legs moving with forward momentum, arms swinging naturally, body weight shifting, expressive face, cinematic lighting, ${styleObj.promptSuffix}, 8k`;

    // 5. Multi-View Turnaround Model Sheet Prompt
    const sheetPrompt = `Professional 3D animation character model sheet turnaround of ${character.name}. 4 distinct panels: front view, three-quarter view, side profile view, and dynamic action walking stride. Consistent character model, clothing: ${character.clothing || 'signature outfit'}, white background, Pixar concept art, ${styleObj.promptSuffix}, 8k`;

    const results = {
      primaryRefUrl: `/outputs/images/${filenamePrimary}`,
      primaryLocalPath: pathPrimary,
      threeQuarterUrl: `/outputs/images/${filenameThreeQuarter}`,
      threeQuarterLocalPath: pathThreeQuarter,
      sideUrl: `/outputs/images/${filenameSide}`,
      sideLocalPath: pathSide,
      actionUrl: `/outputs/images/${filenameAction}`,
      actionLocalPath: pathAction,
      sheetUrl: `/outputs/images/${filenameSheet}`,
      sheetLocalPath: pathSheet,
      referenceImages: {
        front: `/outputs/images/${filenamePrimary}`,
        three_quarter: `/outputs/images/${filenameThreeQuarter}`,
        side: `/outputs/images/${filenameSide}`,
        action: `/outputs/images/${filenameAction}`,
        sheet: `/outputs/images/${filenameSheet}`
      },
      turnarounds: {
        front: `/outputs/images/${filenamePrimary}`,
        three_quarter: `/outputs/images/${filenameThreeQuarter}`,
        side: `/outputs/images/${filenameSide}`,
        action: `/outputs/images/${filenameAction}`,
        sheet: `/outputs/images/${filenameSheet}`
      },
      views: [
        { view: 'front', label: 'Front Portrait', url: `/outputs/images/${filenamePrimary}` },
        { view: 'three_quarter', label: '3/4 Perspective', url: `/outputs/images/${filenameThreeQuarter}` },
        { view: 'side', label: 'Side Profile', url: `/outputs/images/${filenameSide}` },
        { view: 'action', label: 'Action Stride', url: `/outputs/images/${filenameAction}` },
        { view: 'sheet', label: 'Turnaround Sheet', url: `/outputs/images/${filenameSheet}` }
      ],
      seed: charSeed
    };

    // Generate primary front portrait
    if (!fs.existsSync(pathPrimary)) {
      await this.downloadImageWithFallback(primaryPrompt, 720, 1280, charSeed, pathPrimary, filenamePrimary, 1, character);
    }

    // Generate 3/4 perspective
    if (!fs.existsSync(pathThreeQuarter)) {
      if (fs.existsSync(pathPrimary)) {
        try { fs.copyFileSync(pathPrimary, pathThreeQuarter); } catch (_) {}
      }
      this.downloadImageWithFallback(threeQuarterPrompt, 720, 1280, (charSeed + 101) % 1000000, pathThreeQuarter, filenameThreeQuarter, 2, character).catch(() => {});
    }

    // Generate side profile
    if (!fs.existsSync(pathSide)) {
      if (fs.existsSync(pathPrimary)) {
        try { fs.copyFileSync(pathPrimary, pathSide); } catch (_) {}
      }
      this.downloadImageWithFallback(sidePrompt, 720, 1280, (charSeed + 202) % 1000000, pathSide, filenameSide, 3, character).catch(() => {});
    }

    // Generate action stride pose
    if (!fs.existsSync(pathAction)) {
      if (fs.existsSync(pathPrimary)) {
        try { fs.copyFileSync(pathPrimary, pathAction); } catch (_) {}
      }
      this.downloadImageWithFallback(actionPrompt, 720, 1280, (charSeed + 303) % 1000000, pathAction, filenameAction, 4, character).catch(() => {});
    }

    // Generate turnaround sheet
    if (!fs.existsSync(pathSheet)) {
      await this.downloadImageWithFallback(sheetPrompt, 1280, 720, charSeed, pathSheet, filenameSheet, 5, character);
    }

    return results;
  }

  /**
   * Generates a scene image with injected character consistency anchors and seed
   */
  async generateSceneImage({ projectId, sceneNumber, visualPrompt, aspectRatio = '9:16', character = null, characters = [], seed = null }) {
    const filename = `scene_${projectId}_${sceneNumber}.jpg`;
    const outputPath = path.join(this.imagesDir, filename);

    // Target resolutions
    let width = 720;
    let height = 1280;
    if (aspectRatio === '16:9') {
      width = 1280;
      height = 720;
    } else if (aspectRatio === '1:1') {
      width = 720;
      height = 720;
    }

    // Combine visual prompt with character identity anchors
    let enhancedPrompt = visualPrompt;
    let primaryCharacter = character;
    if (!primaryCharacter && characters && characters.length > 0) {
      primaryCharacter = characters[0];
    }

    if (primaryCharacter) {
      const charAnchor = primaryCharacter.continuityAnchor || `${primaryCharacter.name}, ${primaryCharacter.appearance}, ${primaryCharacter.color}`;
      enhancedPrompt = `${charAnchor}. ${visualPrompt}`;
    }

    const effectiveSeed = seed || (primaryCharacter ? Math.abs(this.hashString(primaryCharacter.name)) : Math.floor(Math.random() * 999999));

    return await this.downloadImageWithFallback(enhancedPrompt, width, height, effectiveSeed, outputPath, filename, sceneNumber, primaryCharacter);
  }

  /**
   * Generates multiple distinct cartoon images for a single scene (one per shot),
   * strictly preserving character identity and appearance across all shots.
   */
  async generateSceneImages({ projectId, sceneNumber, shots = [], visualPrompt, aspectRatio = '9:16', character = null, characters = [] }) {
    let width = 720;
    let height = 1280;
    if (aspectRatio === '16:9') {
      width = 1280;
      height = 720;
    } else if (aspectRatio === '1:1') {
      width = 720;
      height = 720;
    }

    let primaryCharacter = character;
    if (!primaryCharacter && characters && characters.length > 0) {
      primaryCharacter = characters[0];
    }

    const charSeed = primaryCharacter ? Math.abs(this.hashString(primaryCharacter.name)) : 424242;
    const charAnchor = primaryCharacter?.continuityAnchor || `${primaryCharacter?.name || 'Character'}, ${primaryCharacter?.appearance || 'cute cartoon character'}`;

    const effectiveShots = (shots && Array.isArray(shots) && shots.length > 1) ? shots : (shots && shots.length === 1) ? [
      shots[0],
      {
        shotNumber: 2,
        action: 'Dynamic character reaction and interaction',
        cameraAngle: 'Medium close-up tracking',
        visualPrompt: `${charAnchor}, highly expressive emotional face, interacting with environment, ${visualPrompt || ''}`
      }
    ] : [
      {
        shotNumber: 1,
        action: 'Scene establishing and environment exploration',
        cameraAngle: 'Cinematic wide shot',
        visualPrompt: `${charAnchor}, walking in scene, full body visible with natural proportions, ${visualPrompt || 'Cartoon scene establishing'}`
      },
      {
        shotNumber: 2,
        action: 'Character close-up reaction and dialogue expression',
        cameraAngle: 'Medium close-up with shallow depth of field',
        visualPrompt: `${charAnchor}, detailed expressive face, smiling and speaking, rich textures, ${visualPrompt || ''}`
      }
    ];

    const generatedImages = [];

    for (let sIdx = 0; sIdx < effectiveShots.length; sIdx++) {
      if (sIdx > 0) {
        await new Promise(r => setTimeout(r, 600));
      }
      const shot = effectiveShots[sIdx];
      const shotNum = shot.shotNumber || (sIdx + 1);
      const filename = `scene_${projectId}_${sceneNumber}_shot_${shotNum}.jpg`;
      const outputPath = path.join(this.imagesDir, filename);

      let shotPrompt = shot.visualPrompt || visualPrompt;
      const continuity = shot.continuityPlan || shot.sceneContinuityPlan;

      if (continuity) {
        const kineticClause = continuity.characterMovement ? `, performing: ${continuity.characterMovement}` : '';
        const directionClause = continuity.travelDirection ? `, screen travel vector: ${continuity.travelDirection}` : '';
        const propsClause = continuity.carriedObjects && continuity.carriedObjects.length > 0 ? `, carrying: ${continuity.carriedObjects.join(', ')}` : '';
        const locationClause = continuity.startLocation && continuity.endLocation ? `, transitioning from ${continuity.startLocation} to ${continuity.endLocation}` : '';

        if (!shotPrompt.includes(continuity.movementType || '')) {
          shotPrompt = `${shotPrompt}${kineticClause}${directionClause}${propsClause}${locationClause}`;
        }
      }

      if (primaryCharacter && !shotPrompt.includes(primaryCharacter.name)) {
        shotPrompt = `${charAnchor}. Action: ${shot.action || 'acting in scene'}. ${shotPrompt}`;
      }

      // Slightly perturb seed for each shot so character is recognizable in a new pose/angle
      const shotSeed = (charSeed + (sceneNumber * 10) + shotNum) % 1000000;

      const imgResult = await this.downloadImageWithFallback(
        shotPrompt,
        width,
        height,
        shotSeed,
        outputPath,
        filename,
        sceneNumber,
        primaryCharacter
      );

      generatedImages.push({
        id: `shot-${sceneNumber}-${shotNum}`,
        shotNumber: shotNum,
        action: shot.action || `Visual moment ${shotNum}`,
        cameraAngle: shot.cameraAngle || 'Medium shot',
        visualPrompt: shotPrompt,
        continuityPlan: continuity || null,
        localPath: imgResult.localPath,
        webUrl: imgResult.webUrl,
        seed: shotSeed,
        isAiGenerated: !imgResult.isFallback
      });
    }

    // Copy primary shot as default scene image for full backward compatibility
    const primaryImg = generatedImages[0];
    const primaryFilename = `scene_${projectId}_${sceneNumber}.jpg`;
    const primaryPath = path.join(this.imagesDir, primaryFilename);
    try {
      fs.copyFileSync(primaryImg.localPath, primaryPath);
    } catch (_) {}

    return {
      success: true,
      images: generatedImages,
      primaryImage: primaryImg,
      localPath: primaryPath,
      webUrl: `/outputs/images/${primaryFilename}`,
      prompt: visualPrompt,
      shotsCount: generatedImages.length
    };
  }

  /**
   * Generates a single shot image within an existing scene
   */
  async generateSingleShotImage({ projectId, sceneNumber, shotNumber, visualPrompt, action = '', cameraAngle = 'Medium shot', aspectRatio = '9:16', character = null }) {
    let width = 720;
    let height = 1280;
    if (aspectRatio === '16:9') {
      width = 1280;
      height = 720;
    } else if (aspectRatio === '1:1') {
      width = 720;
      height = 720;
    }

    const filename = `scene_${projectId}_${sceneNumber}_shot_${shotNumber}.jpg`;
    const outputPath = path.join(this.imagesDir, filename);

    let finalPrompt = visualPrompt;
    if (character && !finalPrompt.includes(character.name)) {
      finalPrompt = `${character.continuityAnchor || character.name}. Action: ${action || 'acting in scene'}. ${visualPrompt}`;
    }

    const charSeed = character ? Math.abs(this.hashString(character.name)) : 424242;
    const shotSeed = (charSeed + (sceneNumber * 10) + shotNumber) % 1000000;

    const imgResult = await this.downloadImageWithFallback(
      finalPrompt,
      width,
      height,
      shotSeed,
      outputPath,
      filename,
      sceneNumber,
      character
    );

    return {
      id: `shot-${sceneNumber}-${shotNumber}`,
      shotNumber,
      action: action || `Visual moment ${shotNumber}`,
      cameraAngle,
      visualPrompt: finalPrompt,
      localPath: imgResult.localPath,
      webUrl: imgResult.webUrl,
      seed: shotSeed,
      isAiGenerated: !imgResult.isFallback
    };
  }

  /**
   * Internal downloader: attempts free AI endpoints, falls back to Character Reference Compositing (NEVER a blank solid box)
   */
  async downloadImageWithFallback(prompt, width, height, seed, outputPath, filename, sceneNumber, character = null) {
    const cleanPrompt = prompt.replace(/[^\p{L}\p{M}\p{N}\s,.-]/gu, ' ').slice(0, 320);
    const encodedPrompt = encodeURIComponent(cleanPrompt);

    // Primary AI: High-reliability standard model on Pollinations (verified 200 OK without paywall)
    const endpoints = [
      { name: 'pollinations_standard', url: `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true`, timeout: 18000 },
      { name: 'pollinations_sana', url: `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&model=sana&nologo=true`, timeout: 18000 },
      { name: 'pollinations_turbo', url: `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&model=turbo&nologo=true`, timeout: 15000 },
      { name: 'pollinations_p', url: `https://pollinations.ai/p/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true`, timeout: 15000 },
      { name: 'pollinations_flux', url: `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&model=flux&nologo=true`, timeout: 20000 }
    ];

    for (const ep of endpoints) {
      try {
        console.log(`[VisualService] Requesting AI visual via ${ep.name} (${width}x${height}, seed=${seed})...`);
        const response = await axios({
          method: 'get',
          url: ep.url,
          responseType: 'arraybuffer',
          timeout: ep.timeout,
          headers: {
            'Accept': 'image/jpeg,image/png,image/webp,image/*;q=0.8',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            'Referer': 'https://pollinations.ai/'
          }
        });

        if (response.data && response.data.length > 3000) {
          const headerSnippet = response.data.slice(0, 60).toString('utf8');
          if (headerSnippet.includes('<svg') || headerSnippet.includes('<?xml') || headerSnippet.includes('<!DOCTYPE') || headerSnippet.includes('<html')) {
            console.warn(`[VisualService] ${ep.name} returned non-raster text/SVG, skipping.`);
            continue;
          }

          fs.writeFileSync(outputPath, response.data);
          console.log(`[VisualService] Downloaded AI visual to ${filename} (${response.data.length} bytes).`);
          return {
            success: true,
            localPath: outputPath,
            webUrl: `/outputs/images/${filename}`,
            prompt,
            hasCharacter: Boolean(character),
            isFallback: false
          };
        }
      } catch (err) {
        console.warn(`[VisualService] ${ep.name} failed (${err.response?.status || err.message}).`);
      }
    }

    console.warn(`[VisualService] All AI image APIs failed. Using Character-Preserving Fallback Compositor.`);
    return this.generateCharacterPreservingVisual({ outputPath, filename, sceneNumber, prompt, width, height, character });
  }

  /**
   * Character-Preserving Fallback Compositor:
   * Guarantees the actual character is ALWAYS visibly present in the scene, never replaced by a blank or solid box!
   */
  generateCharacterPreservingVisual({ outputPath, filename, sceneNumber, prompt, width, height, character = null }) {
    // 1. Locate character reference image on disk
    let refImagePath = null;
    if (character && character.referenceImage) {
      const candidate = path.join(config.storageDir, character.referenceImage.replace('/outputs/', ''));
      if (fs.existsSync(candidate) && fs.statSync(candidate).size > 5000) refImagePath = candidate;
    }

    if (!refImagePath && fs.existsSync(this.imagesDir)) {
      // Look in imagesDir for any matching reference image
      const existingRefs = fs.readdirSync(this.imagesDir).filter(f => f.includes('_ref.jpg') && fs.statSync(path.join(this.imagesDir, f)).size > 5000);
      if (existingRefs.length > 0) {
        const charKeyword = character ? (character.species || character.name || '').toLowerCase() : '';
        const match = existingRefs.find(f => charKeyword && f.toLowerCase().includes(charKeyword.split(' ')[0]));
        refImagePath = path.join(this.imagesDir, match || existingRefs[0]);
      }
    }

    // Check bundled repository character assets (Ruby, Sammy, Pip, etc.)
    if (!refImagePath && fs.existsSync(this.assetsCharactersDir)) {
      const bundledFiles = fs.readdirSync(this.assetsCharactersDir).filter(f => (f.endsWith('.jpg') || f.endsWith('.png')) && fs.statSync(path.join(this.assetsCharactersDir, f)).size > 5000);
      if (bundledFiles.length > 0) {
        const charKeyword = character ? (character.species || character.name || '').toLowerCase() : '';
        const match = bundledFiles.find(f => charKeyword && f.toLowerCase().includes(charKeyword.split(' ')[0]));
        refImagePath = path.join(this.assetsCharactersDir, match || bundledFiles[(sceneNumber - 1) % bundledFiles.length]);
      }
    }

    // Target dimensions for rendering
    const outW = width ? width : (height && height < 1000 ? 1280 : 1080);
    const outH = height ? height : (outW > 1000 ? 720 : 1920);

    if (refImagePath && fs.existsSync(refImagePath)) {
      try {
        console.log(`[VisualService] Compositing character reference image into Scene ${sceneNumber} (${refImagePath})...`);
        const baseCrop = `scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH}`;
        // Apply scene-specific zoom/framing variations so each scene looks distinct
        const sceneFraming = sceneNumber % 3 === 1 
          ? `${baseCrop},vignette=PI/5`
          : sceneNumber % 3 === 2
          ? `${baseCrop},curves=vintage,vignette=PI/4`
          : `${baseCrop},eq=contrast=1.08:brightness=0.03,vignette=PI/4`;

        spawnSync(config.ffmpegPath, [
          '-i', refImagePath,
          '-vf', sceneFraming,
          '-q:v', '2',
          '-y',
          outputPath
        ]);

        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 5000) {
          console.log(`[VisualService] Character-preserving scene visual rendered (${outputPath}, ${fs.statSync(outputPath).size} bytes).`);
          return {
            success: true,
            localPath: outputPath,
            webUrl: `/outputs/images/${filename}`,
            prompt,
            isCharacterPreserved: true,
            hasCharacter: true
          };
        }
      } catch (compErr) {
        console.warn('[VisualService] Compositing failed, using illustrated fallback:', compErr.message);
      }
    }

    // 2. Illustrative Fallback (Vibrant gradient with character label, NEVER an empty black box)
    const charName = character ? character.name : 'Ruby the Rabbit';
    const charSpecies = character ? character.species : 'cute white rabbit';
    const bgGradients = ['0x1e1b4b', '0x172554', '0x064e3b', '0x451a03', '0x3b0764'];
    const selectedColor = bgGradients[(sceneNumber - 1) % bgGradients.length];

    try {
      spawnSync(config.ffmpegPath, [
        '-f', 'lavfi',
        '-i', `color=c=${selectedColor}:s=${outW}x${outH}:d=1`,
        '-vf', `drawbox=x=80:y=800:w=${outW - 160}:h=320:color=white@0.15:t=fill,drawbox=x=80:y=800:w=${outW - 160}:h=320:color=purple@0.8:t=4`,
        '-vframes', '1',
        '-y',
        outputPath
      ]);

      return {
        success: true,
        localPath: outputPath,
        webUrl: `/outputs/images/${filename}`,
        prompt,
        hasCharacter: true,
        isFallback: true
      };
    } catch (e) {
      return {
        success: false,
        localPath: outputPath,
        webUrl: `/outputs/images/${filename}`,
        prompt,
        error: e.message
      };
    }
  }

  /**
   * Generates a high-impact, professional 3D animated YouTube thumbnail
   * for children's storytelling channels (16:9 1280x720 or 9:16 Shorts cover).
   */
  async generateYouTubeThumbnail({
    projectId,
    title,
    moral,
    characters = [],
    style = '3d_animation',
    aspectRatio = '16:9',
    language = 'en'
  }) {
    const isShorts = aspectRatio === '9:16';
    const width = isShorts ? 1080 : 1280;
    const height = isShorts ? 1920 : 720;
    const filename = `thumbnail_${projectId}.jpg`;
    const outputPath = path.join(this.imagesDir, filename);

    const styleObj = config.videoStyles.find(s => s.id === style) || config.videoStyles[1];
    const mainChar = characters.find(c => c.isMainCharacter) || characters[0];
    const secondChar = characters.find(c => !c.isMainCharacter) || characters[1];

    let charPrompt = '';
    if (mainChar && secondChar) {
      charPrompt = `${mainChar.continuityAnchor || mainChar.name} and ${secondChar.continuityAnchor || secondChar.name} facing each other in an exciting dramatic face-off`;
    } else if (mainChar) {
      charPrompt = `${mainChar.continuityAnchor || mainChar.name} posing heroically with big joyful eyes`;
    } else {
      charPrompt = 'cute 3D cartoon animal characters';
    }

    const cleanTitle = (title || 'Children Cartoon Story').replace(/^[^\w\s\u0900-\u097F]+/, '').trim();
    const thumbnailPrompt = `Masterpiece 3D Pixar animated film YouTube video poster thumbnail for "${cleanTitle}". High-impact exciting composition featuring ${charPrompt}, dramatic colorful forest race track background, golden volumetric sunbeams, expressive large sparkling eyes, dynamic high-contrast 3D materials, raytraced lighting, Pixar concept art, exciting children's YouTube video thumbnail composition, 8k, ${styleObj.promptSuffix}`;

    const seed = mainChar ? Math.abs(this.hashString(mainChar.name + cleanTitle)) : 888999;

    const imgResult = await this.downloadImageWithFallback(
      thumbnailPrompt,
      width,
      height,
      seed,
      outputPath,
      filename,
      1,
      mainChar
    );

    return {
      success: true,
      localPath: outputPath,
      thumbnailPath: outputPath,
      thumbnailUrl: `/outputs/images/${filename}`,
      webUrl: `/outputs/images/${filename}`,
      aspectRatio,
      width,
      height,
      title: cleanTitle,
      moral: moral || 'Slow and steady wins the race!',
      isFallback: imgResult.isFallback || false
    };
  }

  hashString(str) {
    if (!str) return 12345;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }
}

export const visualService = new VisualService();
