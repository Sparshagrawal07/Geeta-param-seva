/**
 * Built-in Aarti lyrics (EN + HI). Replaceable later via Firestore practice_content/aarti.
 *
 * `itemKey` must stay `aarti`: it is the key stored on every standing assignment and
 * on every completion log, so changing it would orphan all existing history.
 *
 * Text: "Jai Bhagavad Gite" (Shri Bhagavad Gita Aarti).
 * `bodyHi` is authoritative; `bodyEn` is a transliteration of it. The `en` display
 * body is romanised rather than translated so the two always line up line for line.
 */

export const AARTI_CONTENT = {
  itemKey: 'aarti' as const,
  titleEn: 'Bhagavad Gita Aarti',
  titleHi: 'भगवद्गीता आरती',
  bodyEn: `Jai Bhagavad Gite, Jai Bhagavad Gite.
Hari Hiy Kamal Viharani, Sundar Supunite. Jai Bhagavad Gite

Karm Sumarm Prakashini, Kamasaktihara.
Tattvagyan Vikashini, Vidya Brahm Para. Jai Bhagavad Gite

Nishchal Bhakti Vidhayini, Nirmal Malahari.
Sharan Sahasy Pradayini, Sab Vidhi Sukhkari. Jai Bhagavad Gite

Rag Dvesh Vidarini, Karini Mod Sada.
Bhav Bhay Harini, Tarini Paramanandaprada. Jai Bhagavad Gite

Aasur Bhav Vinashini, Nashini Tam Rajani.
Daivi Sad Gunadayini, Hari Rasika Sajani. Jai Bhagavad Gite

Samata Tyag Sikhavani, Hari Mukh Ki Baani.
Sakal Shastra Ki Svamini, Shrutiyon Ki Rani. Jai Bhagavad Gite

Daya Sudha Barasavani, Maatu! Kripa Keejai.
Haripad Prem Daan Kar, Apano Kar Leejai. Jai Bhagavad Gite

Jai Bhagavad Gite.
Hari Hiy Kamal Viharani, Sundar Supunite.`,
  bodyHi: `जय भगवद् गीते, जय भगवद् गीते।
हरि हिय कमल विहारिणि, सुन्दर सुपुनीते।। जय भगवद् गीते।।

कर्म सुमर्म प्रकाशिनि, कामासक्तिहरा।
तत्त्वज्ञान विकाशिनि, विद्या ब्रह्म परा।। जय भगवद् गीते।।

निश्चल भक्ति विधायिनि, निर्मल मलहारी।
शरण सहस्य प्रदायिनि, सब विधि सुखकारी।। जय भगवद् गीते।।

राग द्वेष विदारिणि, करिणि मोद सदा।
भव भय हारिणि, तारिणि परमानन्दप्रदा।। जय भगवद् गीते।।

आसुर भाव विनाशिनि, नाशिनि तम रजनी।
दैवी सद् गुणदायिनि, हरि रसिका सजनी।। जय भगवद् गीते।।

समता त्याग सिखावनि, हरि मुख की बानी।
सकल शास्त्र की स्वामिनी, श्रुतियों की रानी।। जय भगवद् गीते।।

दया सुधा बरसावनि, मातु! कृपा कीजै।
हरिपद प्रेम दान कर, अपनो कर लीजै।। जय भगवद् गीते।।

जय भगवद् गीते।
हरि हिय कमल विहारिणि, सुन्दर सुपुनीते।।`,
} as const;
