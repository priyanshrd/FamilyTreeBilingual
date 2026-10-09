// Built-in transliteration between English (Latin) and Marathi (Devanagari) for names and places.
// Names are transliterated, never translated: "Rajiv" → "राजीव".
//
// Two layers: a dictionary of common Marathi names, surnames and places (exact), then phonetic
// rules for everything else. Output is a suggestion: it is stored as "auto" and can be corrected.

/** [Latin spellings..., Devanagari]. The first Latin spelling is used for Devanagari → Latin. */
const DICTIONARY: string[][] = [
  // given names
  ['Rajiv', 'Rajeev', 'राजीव'], ['Priyansh', 'प्रियांश'], ['Sunil', 'Suneel', 'सुनील'], ['Anil', 'अनिल'], ['Amit', 'अमित'],
  ['Madhuri', 'माधुरी'], ['Sushila', 'Susheela', 'सुशीला'], ['Meera', 'Mira', 'मीरा'], ['Prakash', 'प्रकाश'], ['Shankar', 'शंकर'],
  ['Vijay', 'विजय'], ['Ajay', 'अजय'], ['Sanjay', 'संजय'], ['Suresh', 'सुरेश'], ['Ramesh', 'रमेश'], ['Mahesh', 'महेश'],
  ['Ganesh', 'गणेश'], ['Dinesh', 'दिनेश'], ['Rajesh', 'राजेश'], ['Sachin', 'सचिन'], ['Rahul', 'राहुल'], ['Rohit', 'रोहित'],
  ['Kiran', 'किरण'], ['Arun', 'अरुण'], ['Varun', 'वरुण'], ['Tarun', 'तरुण'], ['Pravin', 'Praveen', 'प्रवीण'], ['Nitin', 'नितीन'],
  ['Sneha', 'स्नेहा'], ['Pooja', 'Puja', 'पूजा'], ['Priya', 'प्रिया'], ['Anjali', 'अंजली'], ['Kavita', 'Kavitha', 'कविता'],
  ['Sunita', 'Suneeta', 'सुनीता'], ['Anita', 'अनिता'], ['Vandana', 'वंदना'], ['Lata', 'लता'], ['Asha', 'आशा'], ['Usha', 'उषा'],
  ['Nirmala', 'निर्मला'], ['Shobha', 'शोभा'], ['Mangala', 'मंगला'], ['Sharada', 'Sharda', 'शारदा'], ['Laxmi', 'Lakshmi', 'लक्ष्मी'],
  ['Savitri', 'सावित्री'], ['Vasant', 'वसंत'], ['Prabhakar', 'प्रभाकर'], ['Madhukar', 'मधुकर'], ['Sudhakar', 'सुधाकर'],
  ['Dattatray', 'Dattatraya', 'दत्तात्रय'], ['Vishnu', 'विष्णू'], ['Krishna', 'कृष्ण'], ['Ram', 'राम'], ['Shivaji', 'शिवाजी'],
  ['Sambhaji', 'संभाजी'], ['Tukaram', 'तुकाराम'], ['Dnyaneshwar', 'Gyaneshwar', 'ज्ञानेश्वर'], ['Vitthal', 'विठ्ठल'],
  ['Pandurang', 'पांडुरंग'], ['Narayan', 'नारायण'], ['Raghunath', 'रघुनाथ'], ['Balasaheb', 'बाळासाहेब'], ['Aditya', 'आदित्य'],
  ['Akash', 'Aakash', 'आकाश'], ['Aarti', 'Arti', 'आरती'], ['Archana', 'अर्चना'], ['Ashwini', 'अश्विनी'], ['Deepak', 'Dipak', 'दीपक'],
  ['Govind', 'गोविंद'], ['Hari', 'हरी'], ['Jayant', 'जयंत'], ['Kamal', 'कमल'], ['Kamala', 'Kamla', 'कमला'], ['Leela', 'Lila', 'लीला'],
  ['Mohan', 'मोहन'], ['Manohar', 'मनोहर'], ['Nanda', 'नंदा'], ['Neha', 'नेहा'], ['Omkar', 'ओंकार'], ['Pallavi', 'पल्लवी'],
  ['Pratibha', 'प्रतिभा'], ['Rekha', 'रेखा'], ['Revati', 'रेवती'], ['Sakharam', 'सखाराम'], ['Shalini', 'शालिनी'], ['Shubham', 'शुभम'],
  ['Swati', 'स्वाती'], ['Raju', 'राजू'], ['Ganpat', 'Ganapat', 'गणपत'], ['Sita', 'Seeta', 'सीता'], ['Ratna', 'रत्ना'], ['Sujata', 'सुजाता'], ['Bhushan', 'भूषण'], ['Ravi', 'रवी'], ['Sagar', 'सागर'], ['Rani', 'राणी'], ['Uday', 'उदय'], ['Vaishali', 'वैशाली'], ['Vinod', 'विनोद'], ['Yashwant', 'यशवंत'], ['Yogesh', 'योगेश'],
  ['Deepali', 'Dipali', 'दीपाली'], ['Rajendra', 'राजेंद्र'], ['Shridhar', 'Shreedhar', 'श्रीधर'], ['Pushpakala', 'पुष्पकला'],
  ['Dadgonda', 'Dadagonda', 'दादगोंडा'], ['Ellappa', 'एलप्पा'], ['Tavanappa', 'तवनप्पा'], ['Tatya', 'तात्या'], ['Appa', 'आप्पा'],
  ['Anna', 'अण्णा'], ['Nana', 'नाना'], ['Bapu', 'बापू'], ['Shrikant', 'श्रीकांत'], ['Shrinivas', 'Shriniwas', 'श्रीनिवास'],
  ['Shriram', 'श्रीराम'], ['Gangappa', 'गंगाप्पा'], ['Sangappa', 'संगप्पा'], ['Basappa', 'बसप्पा'], ['Mallappa', 'मल्लप्पा'],
  // honorifics and kinship words used in names
  ['Rao', 'राव'], ['Bai', 'बाई'], ['Saheb', 'साहेब'], ['Bhau', 'भाऊ'], ['Tai', 'ताई'], ['Aai', 'आई'], ['Baba', 'बाबा'], ['Kaka', 'काका'],
  ['Mama', 'मामा'], ['Mavshi', 'मावशी'], ['Aatya', 'Atya', 'आत्या'], ['Aaji', 'Aji', 'आजी'], ['Ajoba', 'Aajoba', 'आजोबा'],
  // surnames
  ['Dhotar', 'धोतर'], ['Patil', 'पाटील'], ['Deshmukh', 'देशमुख'], ['Kulkarni', 'कुलकर्णी'], ['Joshi', 'जोशी'], ['Pawar', 'पवार'],
  ['Shinde', 'शिंदे'], ['Jadhav', 'जाधव'], ['Gaikwad', 'गायकवाड'], ['More', 'मोरे'], ['Kale', 'काळे'], ['Deshpande', 'देशपांडे'],
  ['Bhosale', 'Bhosle', 'भोसले'], ['Chavan', 'Chavhan', 'चव्हाण'], ['Kadam', 'कदम'], ['Salunkhe', 'साळुंखे'], ['Thakur', 'ठाकूर'],
  ['Mane', 'माने'], ['Sawant', 'सावंत'], ['Patwardhan', 'पटवर्धन'], ['Gokhale', 'गोखले'], ['Apte', 'आपटे'], ['Bapat', 'बापट'],
  ['Kelkar', 'केळकर'], ['Ranade', 'रानडे'], ['Tilak', 'टिळक'], ['Kamble', 'कांबळे'], ['Pathak', 'पाठक'], ['Naik', 'नाईक'],
  ['Gadgil', 'गाडगीळ'], ['Wagh', 'वाघ'], ['Mhatre', 'म्हात्रे'], ['Shirke', 'शिर्के'], ['Ghorpade', 'घोरपडे'], ['Nimbalkar', 'निंबाळकर'],
  // places
  ['Pune', 'Poona', 'पुणे'], ['Mumbai', 'Bombay', 'मुंबई'], ['Satara', 'सातारा'], ['Nagpur', 'नागपूर'], ['Nashik', 'Nasik', 'नाशिक'],
  ['Kolhapur', 'कोल्हापूर'], ['Sangli', 'सांगली'], ['Solapur', 'Sholapur', 'सोलापूर'], ['Aurangabad', 'औरंगाबाद'], ['Thane', 'ठाणे'],
  ['Ratnagiri', 'रत्नागिरी'], ['Amravati', 'अमरावती'], ['Ahmednagar', 'अहमदनगर'], ['Latur', 'लातूर'], ['Jalgaon', 'जळगाव'],
  ['Nanded', 'नांदेड'], ['Beed', 'बीड'], ['Dhule', 'धुळे'], ['Akola', 'अकोला'], ['Wardha', 'वर्धा'], ['Baramati', 'बारामती'],
  ['Karad', 'कराड'], ['Wai', 'वाई'], ['Alibag', 'Alibaug', 'अलिबाग'], ['Panvel', 'पनवेल'], ['Lonavala', 'लोणावळा'],
  ['Delhi', 'दिल्ली'], ['Bangalore', 'Bengaluru', 'बंगळूरु'], ['Hyderabad', 'हैदराबाद'], ['Goa', 'गोवा'], ['India', 'भारत'],
  // gotra / deities
  ['Kashyap', 'कश्यप'], ['Bharadwaj', 'भारद्वाज'], ['Vashishtha', 'Vashisth', 'वसिष्ठ'], ['Khandoba', 'खंडोबा'],
  ['Tuljabhavani', 'Tulja Bhavani', 'तुळजाभवानी'], ['Ambabai', 'अंबाबाई'], ['Jyotiba', 'ज्योतिबा'], ['Ganpati', 'Ganapati', 'गणपती'],
];

const LATIN_TO_DEVA = new Map<string, string>();
const DEVA_TO_LATIN = new Map<string, string>();
for (const entry of DICTIONARY) {
  const deva = entry[entry.length - 1]!;
  for (const latin of entry.slice(0, -1)) LATIN_TO_DEVA.set(latin.toLowerCase(), deva);
  DEVA_TO_LATIN.set(deva, entry[0]!);
}

// ---------------------------------------------------------------------------
// Latin → Devanagari rules
// ---------------------------------------------------------------------------
const CONSONANTS: [string, string][] = [
  ['ksh', 'क्ष'], ['chh', 'छ'], ['dny', 'ज्ञ'], ['kh', 'ख'], ['gh', 'घ'], ['ch', 'च'], ['jh', 'झ'], ['th', 'थ'], ['dh', 'ध'],
  ['ph', 'फ'], ['bh', 'भ'], ['sh', 'श'], ['k', 'क'], ['g', 'ग'], ['c', 'क'], ['j', 'ज'], ['t', 'त'], ['d', 'द'], ['n', 'न'],
  ['p', 'प'], ['b', 'ब'], ['m', 'म'], ['y', 'य'], ['r', 'र'], ['l', 'ल'], ['v', 'व'], ['w', 'व'], ['s', 'स'], ['h', 'ह'],
  ['z', 'झ'], ['f', 'फ'], ['q', 'क'], ['x', 'क्स'],
];
// [latin, independent vowel, vowel sign]
const VOWELS: [string, string, string][] = [
  ['aa', 'आ', 'ा'], ['ai', 'ऐ', 'ै'], ['au', 'औ', 'ौ'], ['ou', 'औ', 'ौ'], ['ee', 'ई', 'ी'], ['ii', 'ई', 'ी'], ['oo', 'ऊ', 'ू'],
  ['uu', 'ऊ', 'ू'], ['a', 'अ', ''], ['i', 'इ', 'ि'], ['u', 'उ', 'ु'], ['e', 'ए', 'े'], ['o', 'ओ', 'ो'],
];
const VIRAMA = '्';
const ANUSVARA = 'ं';

type Unit = { kind: 'c'; latin: string; deva: string } | { kind: 'v'; latin: string; ind: string; sign: string };

function tokenizeLatin(word: string): Unit[] {
  const units: Unit[] = [];
  let i = 0;
  outer: while (i < word.length) {
    for (const [l, ind, sign] of VOWELS) {
      if (word.startsWith(l, i)) {
        units.push({ kind: 'v', latin: l, ind, sign });
        i += l.length;
        continue outer;
      }
    }
    for (const [l, d] of CONSONANTS) {
      if (word.startsWith(l, i)) {
        units.push({ kind: 'c', latin: l, deva: d });
        i += l.length;
        continue outer;
      }
    }
    i++; // unknown character: skip
  }
  return units;
}

/** Name endings written as separate words in Marathi: Ratnabai → रत्ना + बाई, Ganpatrao → गणपत + राव. */
const SUFFIXES: [string, string][] = [
  ['bai', 'बाई'], ['rao', 'राव'], ['saheb', 'साहेब'], ['tai', 'ताई'], ['kaka', 'काका'], ['bhau', 'भाऊ'], ['dada', 'दादा'],
];

function latinWordToDeva(word: string): string {
  const lower = word.toLowerCase();
  const known = LATIN_TO_DEVA.get(lower);
  if (known) return known;
  if (lower.startsWith('shri') && lower.length > 5) return 'श्री' + latinWordToDeva(lower.slice(4));
  if (lower.startsWith('shree') && lower.length > 6) return 'श्री' + latinWordToDeva(lower.slice(5));
  for (const [suffix, deva] of SUFFIXES) {
    if (lower.endsWith(suffix) && lower.length - suffix.length >= 3) return latinWordToDeva(lower.slice(0, -suffix.length)) + deva;
  }
  const units = tokenizeLatin(lower);
  let out = '';
  for (let i = 0; i < units.length; i++) {
    const u = units[i]!;
    const next = units[i + 1];
    const isLast = (k: number) => k === units.length - 1;
    if (u.kind === 'v') {
      out += finalLong(u, isLast(i)) ?? u.ind;
      continue;
    }
    // n / m before another consonant (after a vowel) is written as anusvara: Shankar → शंकर, Mumbai → मुंबई
    if ((u.latin === 'n' || u.latin === 'm') && next?.kind === 'c' && i > 0 && units[i - 1]!.kind === 'v' && next.latin !== 'y' && next.latin !== 'h') {
      out += ANUSVARA;
      continue;
    }
    if (next?.kind === 'v') {
      // word-final short a / i / u are usually long in names and places: Satara, Joshi, Raju
      const sign = isLast(i + 1) && units.length > 2 ? (finalLongSign(next) ?? next.sign) : next.sign;
      out += u.deva + sign;
      i++;
    } else if (next?.kind === 'c') {
      out += u.deva + VIRAMA;
    } else {
      out += u.deva; // final consonant: no virama in Marathi writing
    }
  }
  return out;
}

function finalLongSign(v: Extract<Unit, { kind: 'v' }>): string | null {
  return v.latin === 'a' ? 'ा' : v.latin === 'i' ? 'ी' : v.latin === 'u' ? 'ू' : null;
}
function finalLong(v: Extract<Unit, { kind: 'v' }>, last: boolean): string | null {
  if (!last) return null;
  return v.latin === 'i' ? 'ई' : v.latin === 'u' ? 'ऊ' : null;
}

// ---------------------------------------------------------------------------
// Devanagari → Latin rules
// ---------------------------------------------------------------------------
const DEVA_CONS: Record<string, string> = {
  क: 'k', ख: 'kh', ग: 'g', घ: 'gh', ङ: 'n', च: 'ch', छ: 'chh', ज: 'j', झ: 'jh', ञ: 'n', ट: 't', ठ: 'th', ड: 'd', ढ: 'dh',
  ण: 'n', त: 't', थ: 'th', द: 'd', ध: 'dh', न: 'n', प: 'p', फ: 'ph', ब: 'b', भ: 'bh', म: 'm', य: 'y', र: 'r', ल: 'l', व: 'v',
  श: 'sh', ष: 'sh', स: 's', ह: 'h', ळ: 'l',
};
const DEVA_IND: Record<string, string> = { अ: 'a', आ: 'a', इ: 'i', ई: 'i', उ: 'u', ऊ: 'u', ए: 'e', ऐ: 'ai', ओ: 'o', औ: 'au', ऋ: 'ru' };
const DEVA_SIGN: Record<string, string> = { 'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ृ': 'ru' };

type Syl = { cons: string; vowel: string | null; inherent: boolean; cluster?: boolean };

function devaWordToLatin(word: string): string {
  const known = DEVA_TO_LATIN.get(word);
  if (known) return known;
  // ज्ञ is pronounced "dny" in Marathi; क्ष is "ksh"
  const w = word.replace(/ज्ञ/g, '\u0001').replace(/क्ष/g, '\u0002');
  const syls: Syl[] = [];
  let pending = '';
  const chars = [...w];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    const cons = ch === '\u0001' ? 'dny' : ch === '\u0002' ? 'ksh' : DEVA_CONS[ch];
    if (cons != null) {
      const nextCh = chars[i + 1];
      if (nextCh === VIRAMA) {
        // in a conjunct, व after a consonant sounds like w: श्व → shw
        pending += cons;
        i++;
        continue;
      }
      const sign = nextCh ? DEVA_SIGN[nextCh] : undefined;
      const consText = pending && cons === 'v' ? `${pending}w` : pending + cons;
      const cluster = pending !== '';
      pending = '';
      if (sign != null) {
        syls.push({ cons: consText, vowel: sign, inherent: false, cluster });
        i++;
      } else {
        syls.push({ cons: consText, vowel: 'a', inherent: true, cluster });
      }
    } else if (DEVA_IND[ch] != null) {
      syls.push({ cons: pending, vowel: DEVA_IND[ch]!, inherent: false });
      pending = '';
    } else if (ch === ANUSVARA || ch === 'ँ') {
      const nextCons = chars[i + 1] ? DEVA_CONS[chars[i + 1]!] : undefined;
      const last = syls[syls.length - 1];
      if (last) last.vowel = (last.vowel ?? '') + (nextCons && /^[pbm]/.test(nextCons) ? 'm' : 'n');
    } else if (ch === 'ः') {
      const last = syls[syls.length - 1];
      if (last) last.vowel = (last.vowel ?? '') + 'h';
    }
  }
  if (pending) syls.push({ cons: pending, vowel: null, inherent: false });

  // Schwa deletion: drop the final inherent a, and a medial inherent a between two pronounced syllables.
  const last = syls[syls.length - 1];
  if (last?.inherent && syls.length > 1) last.vowel = null;
  for (let i = 1; i < syls.length - 1; i++) {
    const s = syls[i]!;
    const next = syls[i + 1]!;
    const prev = syls[i - 1]!;
    // never after a consonant cluster: चंद्रकांत → Chandrakant
    if (s.inherent && s.vowel === 'a' && !s.cluster && prev.vowel && !next.inherent && next.vowel) s.vowel = null;
  }
  const text = syls.map((s) => s.cons + (s.vowel ?? '')).join('');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ---------------------------------------------------------------------------
const capitalize = (w: string) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w);

/** English → Marathi for names and places. Word by word; punctuation and spaces are kept. */
export function toMarathi(text: string): string {
  // multi-word dictionary entries first (e.g. "Tulja Bhavani")
  const whole = LATIN_TO_DEVA.get(text.trim().toLowerCase());
  if (whole) return whole;
  return text.replace(/[A-Za-z]+/g, (w) => latinWordToDeva(w));
}

/** Marathi → English for names and places. */
export function toEnglish(text: string): string {
  return text
    .replace(/[ऀ-ॿ]+/g, (w) => devaWordToLatin(w))
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export function transliterate(text: string, to: 'mr' | 'en'): string {
  return to === 'mr' ? toMarathi(text) : toEnglish(text);
}

/**
 * Version of the transliteration rules, stored with every automatic name. Bump it whenever the rules
 * change: a device only rewrites an automatic name made by an OLDER version, so a device still running
 * an older copy of the app can never undo the work of a newer one (the database enforces this too).
 */
export const TRANSLITERATION_VERSION = 2;
export const TRANSLITERATION_PROVIDER = `builtin-rules-v${TRANSLITERATION_VERSION}`;

/** Rules version of a stored provider label ("builtin-rules-v2" → 2); 0 when unknown. */
export function providerVersion(provider: string | null | undefined): number {
  const m = /^builtin-rules-v(\d+)$/.exec(provider ?? '');
  return m ? Number(m[1]) : 0;
}
export { capitalize };
