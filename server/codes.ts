// Consonants only, so a code reads aloud easily and can't spell a word.
const letters = 'BCDFGHJKLMNPQRSTVWXZ';
const codeLength = 4;
const pattern = new RegExp(`^[${letters}]{${codeLength}}$`);

/** A lobby code: four consonants. */
export const newCode = (random: () => number) => {
  let code = '';
  for (let index = 0; index < codeLength; index++) code += letters[Math.floor(random() * letters.length)] ?? 'B';
  return code;
};

/** A code as someone typed it, tidied: in capitals with no space around it, or `null` if it can't be one. */
export const normalizeCode = (text: string) => {
  const code = text.trim().toUpperCase();
  return pattern.test(code) ? code : null;
};
