import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { db } from '../database/db.js';
import { config } from '../config.js';

class VideoProviderService {
  constructor() {
    this.videosDir = path.join(config.storageDir, 'videos');
    if (!fs.existsSync(this.videosDir)) {
      fs.mkdirSync(this.videosDir, { recursive: true });
    }
  }

  /**
   * Returns list of configured video providers and their operational status
   */
  getProviders() {
    const settings = db.getSettings();
    return [
      {
        id: 'local_motion_engine',
        name: 'Local Kinematic 3D Character Motion Engine',
        description: 'Direction-aware journey translation, footfall oscillation, weight shift physics & intelligent camera tracking.',
        tier: 'free',
        costEstimate: '$0.00 (Free / Offline)',
        isDefault: true,
        isConfigured: true,
        supportedFeatures: [
          'kinematic_locomotion',
          'step_cycle_oscillation',
          'journey_direction_translation',
          'character_consistency',
          'cinematic_camera_tracking',
          'zero_api_cost',
          'offline_mode'
        ],
        status: 'online',
        notice: 'Fully operational on local server with no external API credentials required. Renders high-frame-rate kinematic character movement.'
      },
      {
        id: 'pollinations_motion',
        name: 'Pollinations AI Video (Neural Diffusion Video)',
        description: 'Generates original AI video animation clips conditioned on character visual anchors and action prompts.',
        tier: 'free',
        costEstimate: '$0.00 (Public AI Tier)',
        isDefault: false,
        isConfigured: true,
        supportedFeatures: ['ai_diffusion_video', 'text_to_video', 'image_to_video', 'dynamic_motion'],
        status: 'online',
        notice: 'Free neural video diffusion model with seamless fallback to Local Kinematic Engine.'
      },
      {
        id: 'google_veo',
        name: 'Google Veo (Vertex AI Video Generation)',
        description: 'Google DeepMind state-of-the-art 1080p cinematic video generation with advanced character conditioning.',
        tier: 'premium',
        costEstimate: '~$0.20 - $0.35 / scene',
        isDefault: false,
        isConfigured: Boolean(process.env.VEO_API_KEY || settings.veoApiKey),
        supportedFeatures: ['3d_character_animation', 'reference_conditioning', 'cinematic_motion', '60fps', 'native_1080p'],
        status: (process.env.VEO_API_KEY || settings.veoApiKey) ? 'configured' : 'missing_credentials',
        notice: 'Requires Google Cloud Project with Vertex AI Video (Veo) enabled and VEO_API_KEY set.'
      },
      {
        id: 'runway_gen3',
        name: 'Runway Gen-3 Alpha',
        description: 'Industry-standard high-fidelity AI video generation from character reference images and cinematic prompts.',
        tier: 'premium',
        costEstimate: '~$0.25 / scene (5s)',
        isDefault: false,
        isConfigured: Boolean(process.env.RUNWAY_API_KEY || settings.runwayApiKey),
        supportedFeatures: ['image_to_video', 'text_to_video', 'high_fidelity'],
        status: (process.env.RUNWAY_API_KEY || settings.runwayApiKey) ? 'configured' : 'missing_credentials',
        notice: 'Requires RunwayML API key with Gen-3 access.'
      },
      {
        id: 'kling_ai',
        name: 'Kling AI Video (v1.5 / v2)',
        description: 'High-motion AI video model featuring expressive body locomotion, dynamic camera pan/zooms, and prompt fidelity.',
        tier: 'premium',
        costEstimate: '~$0.15 - $0.20 / scene',
        isDefault: false,
        isConfigured: Boolean(process.env.KLING_API_KEY || settings.klingApiKey),
        supportedFeatures: ['high_motion_locomotion', 'text_to_video', 'image_to_video', 'cinematic_physics'],
        status: (process.env.KLING_API_KEY || settings.klingApiKey) ? 'configured' : 'missing_credentials',
        notice: 'Requires Kling AI API Key (KLING_API_KEY in server Settings).'
      },
      {
        id: 'luma_dream_machine',
        name: 'Luma Dream Machine (Ray)',
        description: 'Realistic cartoon physics and cinematic camera navigation.',
        tier: 'premium',
        costEstimate: '~$0.20 / scene',
        isDefault: false,
        isConfigured: Boolean(process.env.LUMA_API_KEY || settings.lumaApiKey),
        supportedFeatures: ['image_to_video', 'consistent_physics'],
        status: (process.env.LUMA_API_KEY || settings.lumaApiKey) ? 'configured' : 'missing_credentials',
        notice: 'Requires Luma AI Dream Machine API key.'
      },
      {
        id: 'openart_workflow',
        name: 'OpenArt Studio (MCP & Storyboard Workflow)',
        description: 'Generates structured storyboard kits for OpenArt and imports generated animated clips directly into your video timeline.',
        tier: 'hybrid',
        costEstimate: 'Uses your OpenArt account credits',
        isDefault: false,
        isConfigured: true,
        supportedFeatures: ['openart_mcp_support', 'prompt_kit_export', 'direct_clip_import', 'character_turnaround_sync'],
        status: 'online',
        notice: 'OpenArt uses OAuth/CLI and hosted MCP (https://mcp.openart.ai/mcp). Export prompts directly to OpenArt and import clips with 1 click.'
      },
      {
        id: 'ai_canvas',
        name: 'AI Canvas (Node-Based Workflow)',
        description: 'Visual node-based canvas integration for prompt graph export and direct MP4 scene clip ingestion.',
        tier: 'hybrid',
        costEstimate: 'Canvas provider usage',
        isDefault: false,
        isConfigured: true,
        supportedFeatures: ['canvas_node_export', 'direct_clip_import', 'scene_by_scene_sync'],
        status: 'online',
        notice: 'Export scene graphs to AI Canvas and import generated clips back into your YouTube Shorts assembly.'
      }
    ];
  }

  /**
   * Generates or prepares a video clip for a scene using the requested video provider
   */
  async generateSceneVideo({
    providerId = 'local_motion_engine',
    projectId,
    sceneNumber,
    visualPrompt,
    referenceImageUrl,
    referenceLocalPath = null,
    continuityPlan = null,
    duration = 4.0,
    aspectRatio = '9:16'
  }) {
    const filename = `scene_${projectId}_${sceneNumber}.mp4`;
    const outputPath = path.join(this.videosDir, filename);

    if (providerId === 'pollinations_motion') {
      try {
        const motionResult = await this.generatePollinationsVideo({
          visualPrompt,
          referenceImageUrl,
          outputPath,
          filename,
          duration,
          aspectRatio,
          continuityPlan
        });
        if (motionResult && motionResult.success) {
          return motionResult;
        }
      } catch (err) {
        console.warn(`[VideoProviderService] Pollinations Video failed (${err.message}). Falling back to Local Kinematic Engine.`);
      }
    }

    if (providerId === 'google_veo') {
      const apiKey = process.env.VEO_API_KEY || db.getSettings().veoApiKey;
      if (!apiKey) {
        throw new Error('Google Veo API key is missing. Configure VEO_API_KEY in Admin Settings or use the Local Kinematic Motion Engine.');
      }
      return this.submitGoogleVeoJob({ apiKey, visualPrompt, referenceImageUrl, duration, aspectRatio, outputPath, filename });
    }

    if (providerId === 'runway_gen3') {
      const apiKey = process.env.RUNWAY_API_KEY || db.getSettings().runwayApiKey;
      if (!apiKey) {
        throw new Error('Runway API key is missing. Configure RUNWAY_API_KEY in Admin Settings or use the Local Kinematic Motion Engine.');
      }
      return this.submitRunwayJob({ apiKey, visualPrompt, referenceImageUrl, duration, aspectRatio, outputPath, filename });
    }

    if (providerId === 'kling_ai') {
      const apiKey = process.env.KLING_API_KEY || db.getSettings().klingApiKey;
      if (!apiKey) {
        throw new Error('Kling AI API key is missing. Configure KLING_API_KEY in Admin Settings or use the Local Kinematic Motion Engine.');
      }
      return this.submitKlingJob({ apiKey, visualPrompt, referenceImageUrl, duration, aspectRatio, outputPath, filename });
    }

    if (providerId === 'openart_workflow') {
      return {
        provider: 'openart_workflow',
        success: true,
        readyForAssembly: true,
        duration,
        aspectRatio,
        prompt: visualPrompt,
        referenceImage: referenceImageUrl,
        continuityPlan,
        notice: 'OpenArt Studio Storyboard Workflow: Use "Export to OpenArt" to export character turnaround & scene prompts, or "Import Clip" to attach your generated video.'
      };
    }

    if (providerId === 'ai_canvas') {
      return {
        provider: 'ai_canvas',
        success: true,
        readyForAssembly: true,
        duration,
        aspectRatio,
        prompt: visualPrompt,
        referenceImage: referenceImageUrl,
        continuityPlan,
        notice: 'AI Canvas Workflow: Export scene prompt graph to AI Canvas and import generated clips.'
      };
    }

    // Default: Local Kinematic 3D Character Motion Engine
    return {
      provider: 'local_motion_engine',
      success: true,
      readyForAssembly: true,
      duration,
      aspectRatio,
      prompt: visualPrompt,
      referenceImage: referenceImageUrl,
      continuityPlan,
      notice: 'Kinematic locomotion, step oscillation & directional camera will be synthesized during assembly.'
    };
  }

  /**
   * Attempts to generate a neural video diffusion clip via public AI endpoints
   */
  async generatePollinationsVideo({ visualPrompt, outputPath, filename, duration, aspectRatio, continuityPlan }) {
    const motionPrompt = continuityPlan
      ? `${visualPrompt}, ${continuityPlan.movementType}, ${continuityPlan.characterMovement}, screen direction: ${continuityPlan.travelDirection}`
      : visualPrompt;

    const cleanPrompt = encodeURIComponent(motionPrompt.replace(/[^\p{L}\p{M}\p{N}\s,.-]/gu, ' ').slice(0, 240));
    const endpoints = [
      `https://gen.pollinations.ai/video/${cleanPrompt}?duration=${Math.min(6, Math.max(2, Math.round(duration)))}`,
      `https://image.pollinations.ai/prompt/${cleanPrompt}?video=true`
    ];

    for (const url of endpoints) {
      try {
        console.log(`[VideoProviderService] Requesting AI video clip from ${url.slice(0, 60)}...`);
        const res = await axios({
          method: 'get',
          url,
          responseType: 'arraybuffer',
          timeout: 25000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36',
            'Accept': 'video/mp4,video/*;q=0.9'
          }
        });

        if (res.data && res.data.length > 20000) {
          const header = res.data.slice(0, 20).toString('utf8');
          // Verify MP4 signature (ftyp)
          if (header.includes('ftyp') || header.includes('moov') || res.headers['content-type']?.includes('video')) {
            fs.writeFileSync(outputPath, res.data);
            console.log(`[VideoProviderService] Downloaded AI video clip: ${outputPath} (${res.data.length} bytes)`);
            return {
              provider: 'pollinations_motion',
              success: true,
              localPath: outputPath,
              webUrl: `/outputs/videos/${filename}`,
              isAiGenerated: true
            };
          }
        }
      } catch (e) {
        console.warn(`[VideoProviderService] Endpoint ${url.slice(0, 45)} unavailable (${e.message})`);
      }
    }

    return { success: false };
  }

  async submitGoogleVeoJob({ apiKey, visualPrompt, referenceImageUrl, duration, aspectRatio, outputPath, filename }) {
    console.log(`[VideoProviderService] Submitting Google Veo job for prompt: "${visualPrompt.slice(0, 80)}..."`);
    try {
      const res = await axios.post(
        'https://us-central1-aiplatform.googleapis.com/v1/projects/predict',
        {
          prompt: visualPrompt,
          aspectRatio,
          durationSeconds: duration,
          referenceImage: referenceImageUrl
        },
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 10000
        }
      );
      return {
        provider: 'google_veo',
        jobId: res.data.name || `veo-${Date.now()}`,
        status: 'processing',
        webUrl: `/outputs/videos/${filename}`
      };
    } catch (err) {
      throw new Error(`Google Veo request failed: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  async submitRunwayJob({ apiKey, visualPrompt, referenceImageUrl, duration, aspectRatio, outputPath, filename }) {
    console.log(`[VideoProviderService] Submitting Runway Gen-3 job for prompt: "${visualPrompt.slice(0, 80)}..."`);
    try {
      const res = await axios.post(
        'https://api.runwayml.com/v1/image_to_video',
        {
          promptText: visualPrompt,
          promptImage: referenceImageUrl,
          model: 'gen3a_turbo',
          duration: Math.min(10, Math.max(5, Math.round(duration)))
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'X-Runway-Version': '2024-09-13'
          },
          timeout: 10000
        }
      );
      return {
        provider: 'runway_gen3',
        jobId: res.data.id || `runway-${Date.now()}`,
        status: 'processing',
        webUrl: `/outputs/videos/${filename}`
      };
    } catch (err) {
      throw new Error(`Runway API request failed: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  async submitKlingJob({ apiKey, visualPrompt, referenceImageUrl, duration, aspectRatio, outputPath, filename }) {
    console.log(`[VideoProviderService] Submitting Kling AI Video job for prompt: "${visualPrompt.slice(0, 80)}..."`);
    try {
      const res = await axios.post(
        'https://api.klingai.com/v1/videos/image2video',
        {
          prompt: visualPrompt,
          image: referenceImageUrl,
          duration: Math.min(10, Math.max(5, Math.round(duration))),
          aspect_ratio: aspectRatio === '9:16' ? '9:16' : '16:9',
          mode: 'std'
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );
      return {
        provider: 'kling_ai',
        jobId: res.data.data?.task_id || `kling-${Date.now()}`,
        status: 'processing',
        webUrl: `/outputs/videos/${filename}`
      };
    } catch (err) {
      throw new Error(`Kling AI request failed: ${err.response?.data?.message || err.message}`);
    }
  }

  /**
   * Generates a structured OpenArt / AI Canvas production export package.
   * Includes 3D character turnaround prompts, scene-by-scene camera movements,
   * actions, and image-to-video / text-to-video prompt recipes.
   */
  generateStoryboardExportKit(project) {
    if (!project) return null;

    const characters = project.characters || [];
    const scenes = project.scenes || [];
    const title = project.title || 'AI Cartoon Video Production';
    const aspectRatio = project.aspectRatio || '9:16';
    const moral = project.moral || '';

    // Markdown Storyboard Kit
    const markdownLines = [
      `# 🎬 Production Storyboard & AI Video Prompt Kit: ${title}`,
      ``,
      `> **Aspect Ratio:** ${aspectRatio} (YouTube Shorts 1080x1920)`,
      `> **Total Scenes:** ${scenes.length}`,
      `> **Estimated Duration:** ~${project.estimatedDuration || project.duration || 0}s`,
      `> **Moral Lesson:** ${moral}`,
      ``,
      `---`,
      ``,
      `## 🐾 1. Character Designs & Turnaround Prompts`,
      ``
    ];

    characters.forEach((char, idx) => {
      markdownLines.push(`### Character ${idx + 1}: ${char.name} (${char.species || 'Character'})`);
      markdownLines.push(`- **Visual Appearance:** ${char.appearance || '3D Pixar animated character'}`);
      markdownLines.push(`- **Color Palette:** ${char.color || 'Vibrant'}`);
      markdownLines.push(`- **Signature Clothing:** ${char.clothing || 'Standard outfit'}`);
      markdownLines.push(`- **Continuity Anchor:** \`${char.continuityAnchor || char.name}\``);
      markdownLines.push(`- **OpenArt Turnaround Prompt:**`);
      markdownLines.push(`  \`\`\``);
      markdownLines.push(`  ${char.referencePrompt || `3D Pixar character reference turnaround of ${char.name}, front, side, 3/4 angle, white background, 8k`}`);
      markdownLines.push(`  \`\`\``);
      if (char.referenceImage) {
        markdownLines.push(`- **Reference Image URL:** ${char.referenceImage}`);
      }
      markdownLines.push(``);
    });

    markdownLines.push(`---`, ``, `## 🎥 2. Scene-by-Scene Video Generation Prompts`, ``);

    scenes.forEach((sc, idx) => {
      const sceneNum = sc.sceneNumber || (idx + 1);
      markdownLines.push(`### Scene ${sceneNum} (Duration: ~${sc.estimatedDuration || sc.duration || 4.0}s)`);
      markdownLines.push(`- **Characters Present:** ${(sc.charactersPresent || []).join(', ') || 'Lead character'}`);
      markdownLines.push(`- **Environment / Location:** ${sc.environment || sc.location || 'Forest setting'}`);
      markdownLines.push(`- **Action & Movement:** ${sc.characterAction || sc.characterActions || 'Active in scene'}`);
      markdownLines.push(`- **Camera Framing & Angle:** ${sc.cameraFraming || 'Medium shot'}, ${sc.cameraMovement || 'Smooth cinematic tracking'}`);
      markdownLines.push(`- **Spoken Dialogue / Narration:** "${sc.voiceoverText || sc.scriptSegment || ''}"`);
      markdownLines.push(`- **Sound Effects:** ${sc.soundEffect || 'Subtle ambience'}`);
      markdownLines.push(`- **OpenArt / Kling Video Generation Prompt:**`);
      markdownLines.push(`  \`\`\``);
      markdownLines.push(`  ${sc.visualPrompt || ''}`);
      markdownLines.push(`  \`\`\``);
      markdownLines.push(``);
    });

    return {
      title,
      aspectRatio,
      totalScenes: scenes.length,
      estimatedDuration: project.estimatedDuration || project.duration,
      moral,
      markdown: markdownLines.join('\n'),
      characters: characters.map(c => ({
        name: c.name,
        species: c.species,
        appearance: c.appearance,
        continuityAnchor: c.continuityAnchor,
        turnaroundPrompt: c.referencePrompt,
        referenceImageUrl: c.referenceImage
      })),
      scenes: scenes.map(s => ({
        sceneNumber: s.sceneNumber,
        duration: s.estimatedDuration || s.duration,
        charactersPresent: s.charactersPresent,
        environment: s.environment,
        action: s.characterAction,
        cameraFraming: s.cameraFraming,
        cameraMovement: s.cameraMovement,
        visualPrompt: s.visualPrompt,
        voiceoverText: s.voiceoverText,
        soundEffect: s.soundEffect
      })),
      openArtMcpUrl: 'https://mcp.openart.ai/mcp',
      notice: 'Import generated MP4 clips using the "Import Scene Clip" feature in each scene card.'
    };
  }
}

export const videoProviderService = new VideoProviderService();
export const generateSceneVideo = (args) => videoProviderService.generateSceneVideo(args);

