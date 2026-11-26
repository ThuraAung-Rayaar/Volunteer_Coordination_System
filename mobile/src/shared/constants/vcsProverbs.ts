/**
 * @format
 */

export interface VcsProverb {
  text: string;
  author: string;
}

export const VCS_PROVERBS: readonly VcsProverb[] = [
  {
    text: 'Alone we can do so little; together we can do so much.',
    author: 'Helen Keller',
  },
  {
    text: 'Service to others is the rent you pay for your room here on earth.',
    author: 'Muhammad Ali',
  },
  {
    text: 'A single thread of hemp cannot hold, yet woven together they bind even an elephant.',
    author: 'Myanmar Proverb',
  },
  {
    text: 'The best way to find yourself is to lose yourself in the service of others.',
    author: 'Mahatma Gandhi',
  },
  {
    text: 'Small acts, when multiplied by millions of people, can transform the world.',
    author: 'Howard Zinn',
  },
  {
    text: 'Many hands make heavy burdens light.',
    author: 'Traditional Proverb',
  },
  {
    text: 'We make a living by what we get, but we make a life by what we give.',
    author: 'Winston Churchill',
  },
  {
    text: 'Kindness is a language the deaf can hear and the blind can see.',
    author: 'Mark Twain',
  },
];

export function getProverbForIndex(index: number): VcsProverb {
  const safeIndex =
    ((index % VCS_PROVERBS.length) + VCS_PROVERBS.length) % VCS_PROVERBS.length;
  return VCS_PROVERBS[safeIndex];
}
