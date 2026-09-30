/**
 * DetheAI Developer API — GET /api/v1/voices
 * Public catalogue of the 37 studio voices + 11 supported languages.
 * No auth required — helps developers pick voice & language before calling /api/v1/tts.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

const FEMALE = ['priya', 'ritu', 'neha', 'pooja', 'simran', 'kavya', 'ishita', 'shreya', 'roopa', 'tanya', 'shruti', 'suhani', 'kavitha', 'rupali'];
const MALE = ['shubh', 'aditya', 'rahul', 'rohan', 'amit', 'dev', 'ratan', 'varun', 'manan', 'sumit', 'kabir', 'aayan', 'ashutosh', 'advait', 'anand', 'tarun', 'sunny', 'mani', 'gokul', 'vijay', 'mohit', 'rehan', 'soham'];

const LANGUAGES = [
  { code: 'hi-IN', name: 'Hindi' },
  { code: 'en-IN', name: 'English (Indian)' },
  { code: 'ta-IN', name: 'Tamil' },
  { code: 'te-IN', name: 'Telugu' },
  { code: 'mr-IN', name: 'Marathi' },
  { code: 'bn-IN', name: 'Bengali' },
  { code: 'gu-IN', name: 'Gujarati' },
  { code: 'pa-IN', name: 'Punjabi' },
  { code: 'kn-IN', name: 'Kannada' },
  { code: 'ml-IN', name: 'Malayalam' },
  { code: 'od-IN', name: 'Odia' },
];

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({
    ok: true,
    total: FEMALE.length + MALE.length,
    voices: [
      ...FEMALE.map((id) => ({ id, gender: 'female' })),
      ...MALE.map((id) => ({ id, gender: 'male' })),
    ],
    languages: LANGUAGES,
    defaultVoice: 'shubh',
    defaultLanguage: 'hi-IN',
    docs: 'https://www.dethe.in/api',
  }));
};
