const engine = require('../../shared/synthesis');
const accounts = require('../../shared/accounts');
const { handle, json, body, fail } = require('../../shared/http');
const samples = {
  'hi-IN': 'नमस्ते! देठे एआई में आपका स्वागत है।', 'en-IN': 'Hello! Welcome to DetheAI.',
  'mr-IN': 'नमस्कार! देठे एआय मध्ये आपले स्वागत आहे.', 'ta-IN': 'வணக்கம்! உங்களை வரவேற்கிறோம்.',
  'te-IN': 'నమస్కారం! మీకు స్వాగతం.', 'bn-IN': 'নমস্কার! আপনাকে স্বাগতম।',
  'gu-IN': 'નમસ્તે! તમારું સ્વાગત છે.', 'kn-IN': 'ನಮಸ್ಕಾರ! ನಿಮಗೆ ಸ್ವಾಗತ.',
  'ml-IN': 'നമസ്കാരം! സ്വാഗതം.', 'pa-IN': 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਤੁਹਾਡਾ ਸੁਆਗਤ ਹੈ।', 'od-IN': 'ନମସ୍କାର! ଆପଣଙ୍କୁ ସ୍ୱାଗତ।'
};
const previews = new Map();
module.exports = handle('POST', async (req, res) => {
  const input = body(req);
  const voice = String(input.voice || 'priya'), languageCode = String(input.languageCode || input.locale || 'hi-IN');
  if (!engine.SPEAKERS.has(voice) || !engine.LANGUAGES.has(languageCode)) throw fail(400, 'Choose a supported voice and language.');
  if (input.preview === true) {
    // A public preview can only synthesize a fixed sample, never caller text.
    const key = voice + languageCode;
    if (!previews.has(key)) {
      const pending = engine.synthesize({ voice, languageCode, text: samples[languageCode], speed: 1 });
      previews.set(key, { at: Date.now(), pending });
      pending.catch(() => previews.delete(key));
    }
    const entry = previews.get(key);
    const result = await entry.pending;
    if (!result.audioBase64) { previews.delete(key); throw fail(503, 'Voice preview is unavailable. Please try again.'); }
    if (Date.now() - entry.at > 3600000) previews.delete(key);
    return json(res, 200, { ...result, creditsCharged: 0 });
  }
  const text = String(input.text || '').trim();
  if (!text) throw fail(400, 'Write your script first.');
  const account = await accounts.requireAccount(req);
  const validate = a => {
    if (a.plan === 'Free' && !engine.FREE_SPEAKERS.has(voice)) throw fail(402, 'This voice requires Pro or Business. Please select a Free voice or upgrade.');
    const limit = a.plan === 'Free' ? 1000 : 4000;
    if (text.length > limit) throw fail(400, `Your plan allows up to ${limit.toLocaleString('en-IN')} characters per generation.`);
  };
  validate(account);
  const charge = await accounts.charge(account.id, accounts.cost(text), validate);
  let result;
  try {
    result = await engine.synthesize({ text, voice, languageCode, speed: input.speed, emotion: input.emotion });
    if (!result.audioBase64) throw new Error('Synthesis unavailable');
  } catch {
    await accounts.refund(account.id, charge.requestId);
    throw fail(503, 'Voice generation failed. Your credits were refunded. Please try again.');
  }
  json(res, 200, { ...result, creditsCharged: accounts.cost(text), creditsRemaining: charge.account.credits });
});
