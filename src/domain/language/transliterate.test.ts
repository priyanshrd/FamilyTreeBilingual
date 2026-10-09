import { describe, expect, it } from 'vitest';
import { toEnglish, toMarathi } from './transliterate';

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
