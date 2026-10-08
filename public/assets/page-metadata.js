/* Shared by the static build, local server, and client navigation. */
(function (root) {
  'use strict';
  var origin = 'https://www.dethe.in';
  var pages = {
    '/': {
      file: 'index.html', label: 'Text to Speech',
      title: 'Hindi Text to Speech & 11 Indian Languages | DetheAI',
      heading: 'Turn your words into an Indian AI voice',
      description: 'Create Hindi, Marathi, Tamil and other Indian language voiceovers with DetheAI. Explore 37 studio voices, write a script and download your audio.',
      intro: 'Type or paste your script, choose a language and voice, then generate speech for your story, reel or video. Sign in to start with the Free plan; generation limits depend on your plan.'
    },
    '/voices': {
      file: 'voices.html', label: 'Voice Library',
      title: '37 Indian AI Voices — Voice Library | DetheAI',
      heading: 'Find a voice for your next story',
      description: 'Explore 37 Indian studio voices across 11 languages. Listen to voice previews and choose a speaker for your Hindi, Marathi, Tamil or English voiceover.',
      intro: 'Browse the voice library by language, gender or style. Listen to a preview before choosing your speaker. Free and paid plans offer different voice selections.'
    },
    '/ai-script': {
      file: 'ai-script.html', label: 'AI Script Writer',
      title: 'AI Script Writer for Reels & YouTube | DetheAI',
      heading: 'Write a script for your next voiceover',
      description: 'Draft scripts for reels, YouTube videos and stories with DetheAI. Choose a language, tone and length, then move your script into the voice studio.',
      intro: 'Describe your topic, choose a language and tone, and review your draft. Edit the text before applying it to the voice studio. AI service availability can affect the generated result.'
    },
    '/video-to-text': {
      file: 'video-to-text.html', label: 'Video to Text',
      title: 'Video to Text in Hindi & Indian Languages | DetheAI',
      heading: 'Convert your video or audio file to text',
      description: 'Upload an audio or video file to transcribe Hindi and other Indian languages with DetheAI. Review the transcript and export text or SRT subtitles.',
      intro: 'Upload a supported file and select the spoken language. Review the transcript before exporting TXT or SRT. File upload is supported; transcription from pasted links is currently unavailable. Upload files of up to 85 MB and 10 minutes; longer files must be shortened first.'
    }
  };
  function normalize(path) { return path.replace(/\/+$/, '') || '/'; }
  function schema(path) {
    var page = pages[path];
    return {
      '@context': 'https://schema.org', '@type': 'WebPage',
      name: page.title, description: page.description, url: origin + path,
      isPartOf: { '@type': 'WebSite', name: 'DetheAI', url: origin + '/' }
    };
  }
  function update(path) {
    path = normalize(path);
    var page = pages[path];
    if (!page) return;
    document.title = page.title;
    [
      ['meta[name="description"]', page.description],
      ['meta[property="og:title"]', page.title],
      ['meta[property="og:description"]', page.description],
      ['meta[property="og:url"]', origin + path],
      ['meta[name="twitter:title"]', page.title],
      ['meta[name="twitter:description"]', page.description]
    ].forEach(function (item) {
      var element = document.querySelector(item[0]);
      if (element) element.setAttribute('content', item[1]);
    });
    var canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute('href', origin + path);
    var structured = document.getElementById('page-schema');
    if (structured) structured.textContent = JSON.stringify(schema(path));
  }
  if (typeof module === 'object' && module.exports) {
    module.exports = { origin: origin, pages: pages, normalize: normalize, schema: schema };
  } else {
    root.detheUpdateMetadata = update;
    update(root.location.pathname);
  }
})(typeof window === 'undefined' ? globalThis : window);
