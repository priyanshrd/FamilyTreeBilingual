import { describe, expect, it } from 'vitest';
import { learnFromNames, setLearnedWords, toEnglish, toMarathi, transliterate } from './transliterate';

describe('English → Marathi', () => {
  it.each([
    // dictionary
    ['Rajiv Dhotar', 'राजीव धोतर'],
    ['Priyansh Rajiv Dhotar', 'प्रियांश राजीव धोतर'],
    ['Madhuri Patil', 'माधुरी पाटील'],
    ['Kulkarni', 'कुलकर्णी'],
    ['Pune', 'पुणे'],
    ['tulja bhavani', 'तुळजाभवानी'],
    // rules
    ['Nikhil', 'निखिल'],
    ['Ketan', 'केतन'],
    ['Manoj', 'मनोज'],
    ['Hemant', 'हेमंत'],
    ['Kishor', 'किशोर'],
    ['Sujata', 'सुजाता'],
    ['Raju', 'राजू'],
    ['Smita', 'स्मिता'],
    ['Ashok', 'अशोक'],
    ['Bhushan', 'भूषण'],
    ['Gautam', 'गौतम'],
    ['Ratnabai Patil', 'रत्नाबाई पाटील'],
    ['Ganpatrao', 'गणपतराव'],
    ['Dadgonda Patil (Tatya)', 'दादगोंडा पाटील (तात्या)'],
    ['Shrimant', 'श्रीमंत'],
    ['Sitabai', 'सीताबाई'],
  ])('%s → %s', (en, mr) => {
    expect(toMarathi(en)).toBe(mr);
  });

  it('keeps spaces and punctuation', () => {
    expect(toMarathi('Amit, Sneha')).toBe('अमित, स्नेहा');
  });
});

describe('Marathi → English', () => {
  it.each([
    // dictionary
    ['राजीव धोतर', 'Rajiv Dhotar'],
    ['ज्ञानेश्वर', 'Dnyaneshwar'],
    ['पुणे', 'Pune'],
    // rules
    ['मनोहर', 'Manohar'],
    ['हेमंत', 'Hemant'],
    ['निखिल', 'Nikhil'],
    ['केतन', 'Ketan'],
    ['सुजाता', 'Sujata'],
    ['स्मिता', 'Smita'],
    ['नंदिनी', 'Nandini'],
    ['अशोक', 'Ashok'],
    ['विश्वास', 'Vishwas'],
    ['चंद्रकांत', 'Chandrakant'],
  ])('%s → %s', (mr, en) => {
    expect(toEnglish(mr)).toBe(en);
  });
});

describe('reported names and family corrections', () => {
  it('knows Parmaj and the -bai names whose long vowels English cannot show', () => {
    expect(transliterate('Parmaj', 'mr')).toBe('पर्माज');
    expect(transliterate('Shantabai', 'mr')).toBe('शांताबाई');
    expect(transliterate('Shantabai Patil', 'mr')).toBe('शांताबाई पाटील');
    expect(transliterate('Kashibai', 'mr')).toBe('काशीबाई');
    expect(transliterate('Anandibai', 'mr')).toBe('आनंदीबाई');
    expect(transliterate('शांताबाई', 'en')).toBe('Shantabai');
  });

  it('keeps -rao as its own part when going to English', () => {
    expect(transliterate('गणपतराव', 'en')).toBe('Ganpatrao');
    expect(transliterate('यशवंतराव', 'en')).toBe('Yashwantrao');
  });

  it('learns spellings the family typed or corrected, and uses them for similar names', () => {
    const { enToMr, mrToEn } = learnFromNames([
      { en: { full_name: 'Sonubai Patil', source: 'manual' }, mr: { full_name: 'सोनूबाई पाटील', source: 'corrected' } },
      { en: { full_name: 'Babu Rao', source: 'manual' }, mr: { full_name: 'बाबूराव', source: 'manual' } }, // word counts differ: skipped
      { en: { full_name: 'Xyz', source: 'manual' }, mr: { full_name: 'क्ष', source: 'auto' } }, // nobody wrote the Marathi: not learned
    ]);
    expect(enToMr.get('sonubai')).toBe('सोनूबाई');
    expect(enToMr.has('xyz')).toBe(false);
    setLearnedWords(enToMr, mrToEn);
    try {
      expect(transliterate('Sonubai Jadhav', 'mr')).toBe('सोनूबाई जाधव');
      expect(transliterate('सोनूबाई', 'en')).toBe('Sonubai');
    } finally {
      setLearnedWords(new Map(), new Map());
    }
  });
});
