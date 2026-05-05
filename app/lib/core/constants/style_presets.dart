import '../../models/template.dart';

/// 20 AI image style presets — ported from 17-create-content.js STYLE_PRESETS
const Map<String, String> stylePresets = {
  'watercolor':
      'Watercolor painting style with soft, flowing colors and visible brush strokes on textured paper.',
  'cinematic':
      'Cinematic photography with dramatic lighting, shallow depth of field, and film grain. Professional color grading.',
  'anime':
      'Japanese anime art style with clean lines, vibrant colors, and expressive character design.',
  'oil-painting':
      'Classical oil painting style with rich textures, visible brush strokes, and dramatic chiaroscuro lighting.',
  'digital-art':
      'Clean digital art illustration with smooth gradients, vibrant colors, and precise details.',
  'minimalist':
      'Minimalist illustration with simple shapes, limited color palette, and clean negative space.',
  'photorealistic':
      'Ultra-photorealistic image with perfect lighting, sharp details, and natural colors.',
  'comic':
      'Comic book art style with bold outlines, halftone dots, dynamic composition, and vivid colors.',
  'pixel-art':
      'Pixel art style with chunky pixels, limited palette, retro 8-bit/16-bit video game aesthetic.',
  '3d-render':
      'Clean 3D rendered illustration with smooth surfaces, soft global illumination, and studio lighting.',
  'sketch':
      'Hand-drawn pencil sketch style with visible strokes, cross-hatching, and paper texture.',
  'vintage':
      'Vintage retro photography with faded colors, film grain, light leaks, and warm sepia undertones.',
  'flat-design':
      'Flat design illustration with bold solid colors, geometric shapes, no shadows or gradients.',
  'gothic':
      'Dark gothic art with intricate details, deep shadows, ornate architecture, and moody atmosphere.',
  'pastel':
      'Soft pastel art with gentle muted colors, dreamy atmosphere, and delicate light diffusion.',
  'ukiyo-e':
      'Japanese ukiyo-e woodblock print style with flowing lines, flat color areas, and nature motifs.',
  'stained-glass':
      'Stained glass art style with bold black outlines, jewel-toned translucent colors, and mosaic composition.',
  'pop-art':
      'Pop art style with bold primary colors, Ben-Day dots, thick outlines, and high contrast graphic design.',
  'noir':
      'Film noir style with high contrast black and white, dramatic shadows, venetian blind lighting, and moody atmosphere.',
  'surrealism':
      'Surrealist art with dreamlike impossible scenes, melting forms, unexpected juxtapositions, and vivid imagination.',
};

/// Template categories — ported from 17-create-content.js TEMPLATE_CATEGORIES
const Map<String, String> templateCategories = {
  'all': 'All',
  'story': 'Story',
  'education': 'Education',
  'social': 'Social Media',
  'marketing': 'Marketing',
  'podcast': 'Podcast',
  'kids': 'Kids',
  'spiritual': 'Spiritual',
  'music': 'Music',
};

/// 50+ templates — ported from 17-create-content.js TEMPLATES
final List<StoriTemplate> templates = [
  // Blank
  const StoriTemplate(id: 'blank', name: 'Blank', category: 'all', size: '1280x720', style: null, description: 'Fully customisable', gradient: 'linear-gradient(135deg, #2a2a3e, #1a1a2e)', icon: ''),

  // Story
  const StoriTemplate(id: 'bedtime-story', name: 'Bedtime Story', category: 'story', size: '1280x720', style: 'watercolor', description: "Soft watercolor scenes for children's bedtime tales", gradient: 'linear-gradient(135deg, #667eea, #764ba2)', icon: ''),
  const StoriTemplate(id: 'fairy-tale', name: 'Fairy Tale', category: 'story', size: '1280x720', style: 'oil-painting', description: 'Rich oil painting style for classic fairy tales', gradient: 'linear-gradient(135deg, #f093fb, #f5576c)', icon: ''),
  const StoriTemplate(id: 'mythology', name: 'Mythology', category: 'story', size: '1280x720', style: 'ukiyo-e', description: 'Epic woodblock-print style for mythological narratives', gradient: 'linear-gradient(135deg, #4facfe, #00f2fe)', icon: ''),
  const StoriTemplate(id: 'horror', name: 'Horror', category: 'story', size: '1280x720', style: 'gothic', description: 'Dark gothic visuals for horror and thriller stories', gradient: 'linear-gradient(135deg, #0c0c0c, #434343)', icon: ''),
  const StoriTemplate(id: 'sci-fi', name: 'Sci-Fi', category: 'story', size: '1280x720', style: '3d-render', description: 'Futuristic 3D rendered scenes for science fiction', gradient: 'linear-gradient(135deg, #0f2027, #2c5364)', icon: ''),
  const StoriTemplate(id: 'romance', name: 'Romance', category: 'story', size: '1280x720', style: 'pastel', description: 'Soft pastel art for love stories', gradient: 'linear-gradient(135deg, #ee9ca7, #ffdde1)', icon: ''),
  const StoriTemplate(id: 'adventure', name: 'Adventure', category: 'story', size: '1280x720', style: 'comic', description: 'Bold comic book style for action-packed adventures', gradient: 'linear-gradient(135deg, #f7971e, #ffd200)', icon: ''),
  const StoriTemplate(id: 'moral-story', name: 'Moral Story', category: 'story', size: '1280x720', style: 'watercolor', description: 'Gentle watercolor illustrations for moral lessons', gradient: 'linear-gradient(135deg, #a8edea, #fed6e3)', icon: ''),

  // Education
  const StoriTemplate(id: 'explainer', name: 'Explainer', category: 'education', size: '1280x720', style: 'sketch', description: 'Hand-drawn sketch style for explainer videos', gradient: 'linear-gradient(135deg, #5ee7df, #b490ca)', icon: ''),
  const StoriTemplate(id: 'science', name: 'Science', category: 'education', size: '1280x720', style: 'minimalist', description: 'Minimalist diagrams and visuals for science topics', gradient: 'linear-gradient(135deg, #13547a, #80d0c7)', icon: ''),
  const StoriTemplate(id: 'history', name: 'History', category: 'education', size: '1280x720', style: 'vintage', description: 'Vintage retro photography for historical narratives', gradient: 'linear-gradient(135deg, #c79081, #dfa579)', icon: ''),
  const StoriTemplate(id: 'geography', name: 'Geography', category: 'education', size: '1280x720', style: 'photorealistic', description: 'Photorealistic landscapes and maps for geography', gradient: 'linear-gradient(135deg, #11998e, #38ef7d)', icon: ''),
  const StoriTemplate(id: 'math-logic', name: 'Math & Logic', category: 'education', size: '1280x720', style: 'flat-design', description: 'Clean flat design visuals for math and logic concepts', gradient: 'linear-gradient(135deg, #667eea, #764ba2)', icon: ''),
  const StoriTemplate(id: 'language', name: 'Language Learning', category: 'education', size: '1280x720', style: 'comic', description: 'Fun comic style for language learning content', gradient: 'linear-gradient(135deg, #ffecd2, #fcb69f)', icon: ''),

  // Social Media
  const StoriTemplate(id: 'instagram-reel', name: 'Instagram Reel', category: 'social', size: '1080x1920', style: 'cinematic', description: 'Vertical cinematic visuals for Instagram Reels', gradient: 'linear-gradient(135deg, #f9ce34, #ee2a7b)', icon: ''),
  const StoriTemplate(id: 'tiktok-short', name: 'TikTok / Short', category: 'social', size: '1080x1920', style: 'photorealistic', description: 'Vertical photorealistic content for TikTok & Shorts', gradient: 'linear-gradient(135deg, #00f2ea, #ff0050)', icon: ''),
  const StoriTemplate(id: 'youtube-video', name: 'YouTube Video', category: 'social', size: '1280x720', style: 'cinematic', description: 'Widescreen cinematic style for YouTube videos', gradient: 'linear-gradient(135deg, #ff0000, #cc0000)', icon: ''),
  const StoriTemplate(id: 'instagram-post', name: 'Instagram Post', category: 'social', size: '1080x1080', style: 'photorealistic', description: 'Square format for Instagram feed posts', gradient: 'linear-gradient(135deg, #833ab4, #fd1d1d)', icon: ''),
  const StoriTemplate(id: 'facebook-post', name: 'Facebook Post', category: 'social', size: '1200x628', style: 'digital-art', description: 'Landscape digital art for Facebook posts', gradient: 'linear-gradient(135deg, #1877f2, #42b72a)', icon: ''),
  const StoriTemplate(id: 'twitter-banner', name: 'Twitter/X Banner', category: 'social', size: '1500x500', style: 'minimalist', description: 'Wide banner format for Twitter/X headers', gradient: 'linear-gradient(135deg, #1da1f2, #14171a)', icon: ''),

  // Marketing
  const StoriTemplate(id: 'product-demo', name: 'Product Demo', category: 'marketing', size: '1280x720', style: '3d-render', description: '3D rendered product showcase and demo videos', gradient: 'linear-gradient(135deg, #f12711, #f5af19)', icon: ''),
  const StoriTemplate(id: 'brand-story', name: 'Brand Story', category: 'marketing', size: '1280x720', style: 'flat-design', description: 'Clean flat design visuals for brand narratives', gradient: 'linear-gradient(135deg, #2c3e50, #3498db)', icon: ''),
  const StoriTemplate(id: 'testimonial', name: 'Testimonial', category: 'marketing', size: '1280x720', style: 'photorealistic', description: 'Professional photorealistic backgrounds for testimonials', gradient: 'linear-gradient(135deg, #bdc3c7, #2c3e50)', icon: ''),
  const StoriTemplate(id: 'event-promo', name: 'Event Promo', category: 'marketing', size: '1080x1920', style: 'pop-art', description: 'Bold pop art promos for events and launches', gradient: 'linear-gradient(135deg, #eb3349, #f45c43)', icon: ''),
  const StoriTemplate(id: 'real-estate', name: 'Real Estate', category: 'marketing', size: '1280x720', style: 'photorealistic', description: 'Photorealistic property showcase visuals', gradient: 'linear-gradient(135deg, #56ab2f, #a8e063)', icon: ''),
  const StoriTemplate(id: 'food-restaurant', name: 'Food & Restaurant', category: 'marketing', size: '1080x1080', style: 'photorealistic', description: 'Mouthwatering photorealistic food visuals', gradient: 'linear-gradient(135deg, #f2994a, #f2c94c)', icon: ''),

  // Podcast
  const StoriTemplate(id: 'podcast-interview', name: 'Interview', category: 'podcast', size: '1280x720', style: 'minimalist', description: 'Clean minimalist backgrounds for interview podcasts with PiP', gradient: 'linear-gradient(135deg, #4b6cb7, #182848)', icon: ''),
  const StoriTemplate(id: 'podcast-solo', name: 'Solo Show', category: 'podcast', size: '1280x720', style: 'digital-art', description: 'Digital art scenes for solo podcast episodes', gradient: 'linear-gradient(135deg, #6a3093, #a044ff)', icon: ''),
  const StoriTemplate(id: 'podcast-truecrime', name: 'True Crime', category: 'podcast', size: '1280x720', style: 'noir', description: 'Film noir visuals for true crime podcasts', gradient: 'linear-gradient(135deg, #1a1a2e, #e94560)', icon: ''),
  const StoriTemplate(id: 'podcast-comedy', name: 'Comedy', category: 'podcast', size: '1280x720', style: 'pop-art', description: 'Bold pop art style for comedy podcasts', gradient: 'linear-gradient(135deg, #f7971e, #ffd200)', icon: ''),
  const StoriTemplate(id: 'podcast-news', name: 'News Recap', category: 'podcast', size: '1280x720', style: 'photorealistic', description: 'Professional photorealistic backdrops for news', gradient: 'linear-gradient(135deg, #0f2027, #2c5364)', icon: ''),

  // Kids
  const StoriTemplate(id: 'nursery-rhyme', name: 'Nursery Rhyme', category: 'kids', size: '1280x720', style: 'watercolor', description: 'Playful watercolor scenes for nursery rhymes', gradient: 'linear-gradient(135deg, #ff9a9e, #fad0c4)', icon: ''),
  const StoriTemplate(id: 'animal-facts', name: 'Animal Facts', category: 'kids', size: '1280x720', style: 'comic', description: 'Colorful comic illustrations of animals', gradient: 'linear-gradient(135deg, #a1c4fd, #c2e9fb)', icon: ''),
  const StoriTemplate(id: 'abc-numbers', name: 'ABC & Numbers', category: 'kids', size: '1080x1080', style: 'pixel-art', description: 'Fun pixel art visuals for alphabet and counting', gradient: 'linear-gradient(135deg, #fbc2eb, #a6c1ee)', icon: ''),
  const StoriTemplate(id: 'cartoon-story', name: 'Cartoon Story', category: 'kids', size: '1280x720', style: 'anime', description: "Anime-style cartoon visuals for kids' stories", gradient: 'linear-gradient(135deg, #43e97b, #38f9d7)', icon: ''),

  // Spiritual
  const StoriTemplate(id: 'meditation', name: 'Meditation', category: 'spiritual', size: '1280x720', style: 'pastel', description: 'Serene pastel scenes for meditation and calm', gradient: 'linear-gradient(135deg, #89f7fe, #66a6ff)', icon: ''),
  const StoriTemplate(id: 'prayer', name: 'Prayer & Devotional', category: 'spiritual', size: '1280x720', style: 'oil-painting', description: 'Classical oil painting for devotional content', gradient: 'linear-gradient(135deg, #f6d365, #fda085)', icon: ''),
  const StoriTemplate(id: 'scripture', name: 'Scripture', category: 'spiritual', size: '1280x720', style: 'stained-glass', description: 'Stained glass art for scripture readings', gradient: 'linear-gradient(135deg, #a18cd1, #fbc2eb)', icon: ''),
  const StoriTemplate(id: 'mythology-retelling', name: 'Mythology Retelling', category: 'spiritual', size: '1280x720', style: 'ukiyo-e', description: 'Woodblock-print style for mythological retellings', gradient: 'linear-gradient(135deg, #ff9966, #ff5e62)', icon: ''),

  // Music
  const StoriTemplate(id: 'lyric-video', name: 'Lyric Video', category: 'music', size: '1080x1920', style: 'minimalist', description: 'Minimalist vertical backgrounds for lyric videos', gradient: 'linear-gradient(135deg, #e1eec3, #f05053)', icon: ''),
  const StoriTemplate(id: 'album-visualizer', name: 'Album Visualizer', category: 'music', size: '1280x720', style: 'surrealism', description: 'Surrealist abstract art for music visualization', gradient: 'linear-gradient(135deg, #7f00ff, #e100ff)', icon: ''),
  const StoriTemplate(id: 'music-story', name: 'Music Story', category: 'music', size: '1280x720', style: 'anime', description: 'Anime-style narrative visuals for music stories', gradient: 'linear-gradient(135deg, #fc5c7d, #6a82fb)', icon: ''),
];
