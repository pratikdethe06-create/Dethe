import { premiumSpeakerFor } from "@/lib/premium-tts";

export interface Language {
  name: string;
  native: string;
  locale: string;
  ttsCode: string;
  /** Natural neural voices (fallback engine) — female / male */
  neural?: { female: string; male: string };
  /** Native-script sample line used for "Listen" previews */
  sample: string;
}

export const LANGUAGES: Language[] = [
  {
    name: "Hindi",
    native: "हिंदी",
    locale: "hi-IN",
    ttsCode: "hi",
    neural: { female: "hi-IN-SwaraNeural", male: "hi-IN-MadhurNeural" },
    sample: "नमस्ते! मैं {name} हूँ। अपनी कहानी को एक ऐसी आवाज़ दें जो सीधे दिल तक पहुँचे।",
  },
  {
    name: "English",
    native: "English",
    locale: "en-IN",
    ttsCode: "en",
    neural: { female: "en-IN-NeerjaNeural", male: "en-IN-PrabhatNeural" },
    sample: "Hi, I'm {name}. Give your words a voice that feels warm, natural and truly human.",
  },
  {
    name: "Odia",
    native: "ଓଡ଼ିଆ",
    locale: "od-IN",
    ttsCode: "or",
    sample: "ନମସ୍କାର! ମୁଁ {name}। ଆପଣଙ୍କ କାହାଣୀକୁ ଏକ ସ୍ୱାଭାବିକ, ହୃଦୟସ୍ପର୍ଶୀ ସ୍ୱର ଦିଅନ୍ତୁ।",
  },
  {
    name: "Tamil",
    native: "தமிழ்",
    locale: "ta-IN",
    ttsCode: "ta",
    neural: { female: "ta-IN-PallaviNeural", male: "ta-IN-ValluvarNeural" },
    sample: "வணக்கம்! நான் {name}. உங்கள் கதைக்கு இயற்கையான, உண்மையான குரலைக் கொடுங்கள்.",
  },
  {
    name: "Telugu",
    native: "తెలుగు",
    locale: "te-IN",
    ttsCode: "te",
    neural: { female: "te-IN-ShrutiNeural", male: "te-IN-MohanNeural" },
    sample: "నమస్కారం! నేను {name}. మీ కథకు సహజమైన, హృదయాన్ని తాకే గొంతును ఇవ్వండి.",
  },
  {
    name: "Marathi",
    native: "मराठी",
    locale: "mr-IN",
    ttsCode: "mr",
    neural: { female: "mr-IN-AarohiNeural", male: "mr-IN-ManoharNeural" },
    sample: "नमस्कार! मी {name}. तुमच्या गोष्टीला एक नैसर्गिक, मनाला भिडणारा आवाज द्या.",
  },
  {
    name: "Bengali",
    native: "বাংলা",
    locale: "bn-IN",
    ttsCode: "bn",
    neural: { female: "bn-IN-TanishaaNeural", male: "bn-IN-BashkarNeural" },
    sample: "নমস্কার! আমি {name}। আপনার গল্পকে দিন এক স্বাভাবিক, মন ছুঁয়ে যাওয়া কণ্ঠ।",
  },
  {
    name: "Gujarati",
    native: "ગુજરાતી",
    locale: "gu-IN",
    ttsCode: "gu",
    neural: { female: "gu-IN-DhwaniNeural", male: "gu-IN-NiranjanNeural" },
    sample: "નમસ્તે! હું {name} છું. તમારી વાર્તાને એક કુદરતી, દિલને સ્પર્શતો અવાજ આપો.",
  },
  {
    name: "Punjabi",
    native: "ਪੰਜਾਬੀ",
    locale: "pa-IN",
    ttsCode: "pa",
    sample: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ {name} ਹਾਂ। ਆਪਣੀ ਕਹਾਣੀ ਨੂੰ ਇੱਕ ਕੁਦਰਤੀ, ਦਿਲ ਨੂੰ ਛੂਹਣ ਵਾਲੀ ਆਵਾਜ਼ ਦਿਓ।",
  },
  {
    name: "Kannada",
    native: "ಕನ್ನಡ",
    locale: "kn-IN",
    ttsCode: "kn",
    neural: { female: "kn-IN-SapnaNeural", male: "kn-IN-GaganNeural" },
    sample: "ನಮಸ್ಕಾರ! ನಾನು {name}. ನಿಮ್ಮ ಕಥೆಗೆ ಸಹಜವಾದ, ಹೃದಯ ಮುಟ್ಟುವ ಧ್ವನಿಯನ್ನು ನೀಡಿ.",
  },
  {
    name: "Malayalam",
    native: "മലയാളം",
    locale: "ml-IN",
    ttsCode: "ml",
    neural: { female: "ml-IN-SobhanaNeural", male: "ml-IN-MidhunNeural" },
    sample: "നമസ്കാരം! ഞാൻ {name}. നിങ്ങളുടെ കഥയ്ക്ക് സ്വാഭാവികവും ഹൃദയസ്പർശിയുമായ ഒരു ശബ്ദം നൽകൂ.",
  },
];

export const LANGUAGE_COUNT = LANGUAGES.length;

export const STYLES = [
  "Warm & Conversational",
  "Clear & Professional",
  "Bright & Energetic",
  "Calm & Reassuring",
  "Storytelling",
  "News / Anchor",
  "Narrator",
  "Friendly",
  "Deep",
  "Soft",
  "Emotional",
  "Motivational",
  "Educational",
  "Devotional",
  "Corporate",
];

/** Delivery tuning per style: rate (%) / pitch (Hz) / volume (%) / expressiveness */
const STYLE_PROSODY: Record<
  string,
  { rate: number; pitch: number; volume: number; temperature: number }
> = {
  "Warm & Conversational": { rate: -2, pitch: 0, volume: 0, temperature: 0.65 },
  "Clear & Professional": { rate: 2, pitch: -2, volume: 0, temperature: 0.45 },
  "Bright & Energetic": { rate: 12, pitch: 12, volume: 6, temperature: 0.85 },
  "Calm & Reassuring": { rate: -10, pitch: -4, volume: -4, temperature: 0.4 },
  Storytelling: { rate: -6, pitch: 4, volume: 0, temperature: 0.8 },
  "News / Anchor": { rate: 6, pitch: -6, volume: 4, temperature: 0.35 },
  Narrator: { rate: -4, pitch: -8, volume: 0, temperature: 0.55 },
  Friendly: { rate: 4, pitch: 8, volume: 2, temperature: 0.75 },
  Deep: { rate: -6, pitch: -22, volume: 2, temperature: 0.5 },
  Soft: { rate: -8, pitch: 2, volume: -12, temperature: 0.5 },
  Emotional: { rate: -8, pitch: 6, volume: -2, temperature: 0.95 },
  Motivational: { rate: 8, pitch: 4, volume: 8, temperature: 0.85 },
  Educational: { rate: -3, pitch: 0, volume: 0, temperature: 0.45 },
  Devotional: { rate: -12, pitch: -4, volume: -4, temperature: 0.6 },
  Corporate: { rate: 0, pitch: -6, volume: 0, temperature: 0.4 },
};

const AGE_GROUPS = ["Young adult", "Adult", "Mature"];
const AGE_PITCH: Record<string, number> = { "Young adult": 10, Adult: 0, Mature: -12 };

const BASE_NAMES: { name: string; gender: "Female" | "Male" }[] = [
  { name: "Anaya", gender: "Female" },
  { name: "Arjun", gender: "Male" },
  { name: "Ishita", gender: "Female" },
  { name: "Rohan", gender: "Male" },
  { name: "Nisha", gender: "Female" },
  { name: "Karthik", gender: "Male" },
  { name: "Diya", gender: "Female" },
  { name: "Aditya", gender: "Male" },
  { name: "Maya", gender: "Female" },
  { name: "Ravi", gender: "Male" },
  { name: "Tara", gender: "Female" },
  { name: "Dev", gender: "Male" },
  { name: "Saanvi", gender: "Female" },
  { name: "Neel", gender: "Male" },
  { name: "Kavya", gender: "Female" },
  { name: "Vikram", gender: "Male" },
  { name: "Riya", gender: "Female" },
  { name: "Aman", gender: "Male" },
  { name: "Anika", gender: "Female" },
  { name: "Yash", gender: "Male" },
  { name: "Pihu", gender: "Female" },
  { name: "Raj", gender: "Male" },
  { name: "Mira", gender: "Female" },
  { name: "Arnav", gender: "Male" },
  { name: "Sia", gender: "Female" },
  { name: "Kunal", gender: "Male" },
  { name: "Ira", gender: "Female" },
  { name: "Manav", gender: "Male" },
  { name: "Avni", gender: "Female" },
  { name: "Dhruv", gender: "Male" },
  { name: "Navya", gender: "Female" },
  { name: "Samar", gender: "Male" },
  { name: "Kiara", gender: "Female" },
  { name: "Reyansh", gender: "Male" },
  { name: "Aditi", gender: "Female" },
  { name: "Ved", gender: "Male" },
  { name: "Myra", gender: "Female" },
  { name: "Nikhil", gender: "Male" },
  { name: "Ishaan", gender: "Male" },
  { name: "Tanishka", gender: "Female" },
  { name: "Rahul", gender: "Male" },
  { name: "Priya", gender: "Female" },
  { name: "Kabir", gender: "Male" },
  { name: "Zara", gender: "Female" },
  { name: "Vihaan", gender: "Male" },
  { name: "Aanya", gender: "Female" },
  { name: "Krish", gender: "Male" },
  { name: "Naina", gender: "Female" },
  { name: "Advait", gender: "Male" },
  { name: "Shreya", gender: "Female" },
];

export interface VoiceProfile {
  id: string;
  name: string;
  firstName: string;
  language: string;
  native: string;
  locale: string;
  gender: "Female" | "Male";
  ageGroup: string;
  style: string;
  description: string;
  /** Premium natural speaker id (DetheAi Studio voice) */
  providerVoice: string;
  /** Neural fallback voice name */
  neuralVoice: string | null;
  /** Delivery tuning */
  prosody: { rate: number; pitch: number; volume: number; temperature: number };
  providerStatus: string;
  /** Deterministic accent hue for avatars */
  hue: number;
}

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

function buildVoices(): VoiceProfile[] {
  const voices: VoiceProfile[] = [];
  for (const lang of LANGUAGES) {
    const slug = lang.name.toLowerCase();
    let femaleIdx = 0;
    let maleIdx = 0;
    BASE_NAMES.forEach((base, i) => {
      const num = String(i + 1).padStart(2, "0");
      const style = STYLES[i % STYLES.length];
      const ageGroup = AGE_GROUPS[i % AGE_GROUPS.length];
      const genderWord = base.gender === "Female" ? "female" : "male";
      const sp = STYLE_PROSODY[style] ?? { rate: 0, pitch: 0, volume: 0, temperature: 0.6 };
      const neuralVoice = lang.neural
        ? base.gender === "Female"
          ? lang.neural.female
          : lang.neural.male
        : null;
      const speakerIdx = base.gender === "Female" ? femaleIdx++ : maleIdx++;
      voices.push({
        id: `${slug}-${num}`,
        name: `${base.name} ${num}`,
        firstName: base.name,
        language: lang.name,
        native: lang.native,
        locale: lang.locale,
        gender: base.gender,
        ageGroup,
        style,
        description: `${ageGroup} ${genderWord} profile with a ${style.toLowerCase()} delivery.`,
        providerVoice: premiumSpeakerFor(base.gender, speakerIdx),
        neuralVoice,
        prosody: {
          rate: sp.rate,
          pitch: sp.pitch + (AGE_PITCH[ageGroup] ?? 0),
          volume: sp.volume,
          temperature: sp.temperature,
        },
        providerStatus: "DetheAi natural voice",
        hue: hashHue(`${slug}-${base.name}`),
      });
    });
  }
  return voices;
}

export const VOICES: VoiceProfile[] = buildVoices();

export const VOICE_COUNT = VOICES.length;

export const DEFAULT_VOICE_ID = "hindi-01";

export function getVoiceById(id: string): VoiceProfile {
  return VOICES.find((v) => v.id === id) ?? VOICES[0];
}

export function initialsOf(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function languageOf(name: string): Language {
  return LANGUAGES.find((l) => l.name === name) ?? LANGUAGES[0];
}

/** Native-language sample sentence for a voice preview. */
export function previewLine(v: VoiceProfile): string {
  return languageOf(v.language).sample.replace("{name}", v.firstName);
}

export type BillingCycle = "monthly" | "yearly";

export interface Plan {
  title: string;
  /** Price per month when billed monthly */
  price: string;
  /** Effective price per month when billed yearly (Save 20%) */
  yearlyPrice: string;
  /** Muted note shown under the yearly price, e.g. "Billed ₹7,990 annually" */
  yearlyNote: string | null;
  copy: string;
  items: string[];
}

export const PLANS: Plan[] = [
  {
    title: "Free",
    price: "₹0",
    yearlyPrice: "₹0",
    yearlyNote: null,
    copy: "For trying your next idea",
    items: ["10,000 credits / month", `All ${LANGUAGE_COUNT} languages · 50 voices`, "1,000 characters / generation", "Community support"],
  },
  {
    title: "Pro",
    price: "₹799",
    yearlyPrice: "₹665",
    yearlyNote: "Billed ₹7,990 annually",
    copy: "For creators who ship often",
    items: ["50,000 credits / month", "250+ voices · style selection", "Download MP3 / WAV", "Priority email support"],
  },
  {
    title: "Business",
    price: "₹2,499",
    yearlyPrice: "₹1,999",
    yearlyNote: "Billed ₹23,988 annually",
    copy: "For teams and agencies",
    items: ["200,000 credits / month", "550+ voices · unlimited characters", "API access · team workspace (5 seats)", "24/7 dedicated manager"],
  },
];

export function planPrice(plan: Plan, cycle: BillingCycle): string {
  return cycle === "yearly" ? plan.yearlyPrice : plan.price;
}

export const MAX_CHARACTERS = 4000;
