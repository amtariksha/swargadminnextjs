// Whole-message ack matcher. isAckOnly answers one question: "is this message nothing but a
// thank-you or an okay?". It is a whole-message match against closed lists and never looks at
// context (a question before the resolution, a human message after it): that is decideInbound's
// job. There is no prefix or substring matching anywhere: "ok send 2 tomorrow" is an order.
// The lists are a contract, not a starting point; changing one needs a vector and a review.

import { isQuestionText } from './decide';

export const ACK_MAX_LENGTH = 40;
export const ACK_MAX_TOKENS = 8;

export const ACK_EMOJI: readonly number[] = [
    0x1F64F, 0x1F44D, 0x1F44C, 0x1F60A, 0x1F642, 0x1F600, 0x1F603, 0x1F604, 0x1F601, 0x263A,
    0x2764, 0x2665, 0x1F490, 0x1F91D, 0x2705, 0x2714, 0x1F44F, 0x1F64C, 0x1F607, 0x1F917,
    0x1F4AF, 0x1F339, 0x270C, 0x1FAE1, 0x1F49A, 0x1F499, 0x1F9E1, 0x1F49B, 0x1F49C,
];

export const ACK_CORE: readonly string[] = [
    // English
    'ok', 'okay', 'okey', 'okie', 'oki', 'okk', 'k', 'kk', 'thanks', 'thank', 'thanku', 'thankyou',
    'thanx', 'thnx', 'thnks', 'thx', 'tnx', 'tq', 'tqsm', 'ty', 'tysm', 'welcome', 'fine', 'good',
    'great', 'nice', 'super', 'superb', 'perfect', 'cool', 'awesome', 'excellent', 'noted', 'done',
    'received', 'bye',
    // Hindi, Latin transliteration
    'theek', 'thik', 'teek', 'tik', 'accha', 'acha', 'achha', 'acchha', 'shukriya', 'dhanyavad',
    'dhanyawad', 'dhanyavaad', 'dhanyawaad', 'badhiya', 'sahi',
    // Kannada, Latin transliteration
    'sari', 'aytu', 'aaytu', 'aitu', 'ayitu', 'aythu', 'aaythu', 'dhanyavada', 'dhanyavadagalu',
    'vandanegalu', 'chennagide',
];

/** Allowed beside a core token, never enough alone. */
export const ACK_FILLER: readonly string[] = [
    'you', 'u', 'so', 'much', 'very', 'a', 'lot', 'lots', 'many', 'and', 'with', 'sir', 'madam',
    'mam', 'maam', 'medam', 'ji', 'bhai', 'bhaiya', 'bhaiyya', 'anna', 'akka', 'dear', 'bro',
    'team', 'swarg', 'all', 'hai', 'h', 'hain', 'tumba', 'thumba', 'bahut', 'bohot',
];

/** Word sequences, matched as a unit. */
export const ACK_PHRASES: readonly string[] = [
    'no problem', 'no problems', 'no issue', 'no issues', 'no worries', 'got it', 'its ok',
    'its okay', 'its fine', 'it is ok', 'it is okay', 'it is fine', 'thats ok', 'thats okay',
    'thats fine', 'that is ok', 'that is fine', 'all good', 'well noted', 'you are welcome',
    'youre welcome', 'ur welcome', 'most welcome',
];

/** A subset of ACK_CORE. */
export const ACK_THANKS: readonly string[] = [
    'thanks', 'thank', 'thanku', 'thankyou', 'thanx', 'thnx', 'thnks', 'thx', 'tnx', 'tq', 'tqsm',
    'ty', 'tysm', 'shukriya', 'dhanyavad', 'dhanyawad', 'dhanyavaad', 'dhanyawaad', 'dhanyavada',
    'dhanyavadagalu', 'vandanegalu',
];

export const ACK_TAIL_NOUNS: readonly string[] = [
    'update', 'help', 'support', 'info', 'information', 'reply', 'response', 'refund', 'refunding',
];

export const ACK_TAIL_REGEX = new RegExp(
    `^(.+) for(?: the| your| ur)?(?: quick| prompt| kind)? (?:${ACK_TAIL_NOUNS.join('|')})$`,
);

/** Guard list: answers and requests that must never read as an ack. Not read by isAckOnly. */
export const ACK_NEVER: readonly string[] = [
    'yes', 'yeah', 'yep', 'ya', 'y', 'haan', 'han', 'ha', 'howdu', 'haudu', 'no', 'not', 'nope',
    'nahi', 'nahin', 'illa', 'beda', 'beku', 'but', 'still', 'when', 'where', 'why', 'what', 'how',
    'who', 'please', 'pls', 'plz', 'send', 'want', 'need', 'cancel', 'stop', 'pause', 'add',
    'extra', 'tomorrow', 'kal', 'naale', 'refund', 'call', 'paid', 'payment', 'hi', 'hello', 'hey',
    'sure', 'hmm',
];

const EMOJI_SET: ReadonlySet<number> = new Set(ACK_EMOJI);
const CORE_SET: ReadonlySet<string> = new Set(ACK_CORE);
const FILLER_SET: ReadonlySet<string> = new Set(ACK_FILLER);
const THANKS_SET: ReadonlySet<string> = new Set(ACK_THANKS);
const PHRASE_WORDS: ReadonlyArray<readonly string[]> = ACK_PHRASES.map((phrase) => phrase.split(' '));

const DECIMAL_DIGIT = /\p{Nd}/u;
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const EMOJI_MODIFIERS = /[\uFE0E\uFE0F\u200D\u{1F3FB}-\u{1F3FF}]/gu;
const APOSTROPHES = /['\u2018\u2019\u02BC`\u00B4]/g;
const FOREIGN_CHARACTER = /[^\p{Script=Latin}\p{P}\p{S}\p{Z}\p{Cc}]/u;
const NON_LETTER_RUN = /[^\p{L}]+/gu;
const ELONGATION = /(\p{L})\1{2,}/gu;

interface EmojiScan {
    rest: string;
    ackEmojiCount: number;
}

/** Steps 7-8: strip modifiers, replace ack emoji by a space, reject any other pictograph. */
function scanEmoji(text: string): EmojiScan | null {
    let rest = '';
    let ackEmojiCount = 0;
    for (const character of text.replace(EMOJI_MODIFIERS, '')) {
        if (EMOJI_SET.has(character.codePointAt(0) ?? -1)) {
            ackEmojiCount += 1;
            rest += ' ';
        } else if (PICTOGRAPHIC.test(character)) {
            return null;
        } else {
            rest += character;
        }
    }
    return { rest, ackEmojiCount };
}

/** Step 14: split "<head> for the <noun>"; null when the tail exists but the head holds no thanks word. */
function stripThanksTail(tokens: readonly string[]): readonly string[] | null {
    const match = ACK_TAIL_REGEX.exec(tokens.join(' '));
    if (!match) return tokens;
    const head = match[1].split(' ');
    return head.some((token) => THANKS_SET.has(token)) ? head : null;
}

function longestPhraseAt(tokens: readonly string[], position: number): number {
    let longest = 0;
    for (const words of PHRASE_WORDS) {
        const fits = words.length > longest && words.every((word, offset) => tokens[position + offset] === word);
        if (fits) longest = words.length;
    }
    return longest;
}

/** Step 15: every token is a phrase, a core word or a filler, with at least one core hit. */
function matchesTokens(tokens: readonly string[]): boolean {
    if (tokens.length > ACK_MAX_TOKENS) return false;
    let coreHits = 0;
    let position = 0;
    while (position < tokens.length) {
        const phraseLength = longestPhraseAt(tokens, position);
        if (phraseLength > 0) {
            coreHits += 1;
            position += phraseLength;
            continue;
        }
        const token = tokens[position];
        if (CORE_SET.has(token)) coreHits += 1;
        else if (!FILLER_SET.has(token)) return false;
        position += 1;
    }
    return coreHits > 0;
}

/** Steps 13-15 for one elongation setting. */
function matchesWithKeep(cleaned: string, keep: number): boolean {
    const squeezed = cleaned.replace(ELONGATION, (_run, letter: string) => letter.repeat(keep));
    const tokens = stripThanksTail(squeezed.split(' '));
    return tokens !== null && matchesTokens(tokens);
}

export function isAckOnly(
    text: string | null | undefined,
    contentType: string | null | undefined,
    hasMedia?: boolean,
): boolean {
    const kind = String(contentType ?? 'text').trim().toLowerCase() || 'text';
    if (kind !== 'text' || hasMedia === true || typeof text !== 'string') return false;
    const raw = text.normalize('NFKC').trim();
    if (raw.length === 0 || raw.length > ACK_MAX_LENGTH) return false;
    if (DECIMAL_DIGIT.test(raw) || isQuestionText(raw)) return false;
    const scan = scanEmoji(raw);
    if (scan === null) return false;
    const letters = scan.rest.toLowerCase().replace(APOSTROPHES, '');
    if (FOREIGN_CHARACTER.test(letters)) return false;
    const cleaned = letters.replace(NON_LETTER_RUN, ' ').trim();
    if (cleaned.length === 0) return scan.ackEmojiCount > 0;
    return matchesWithKeep(cleaned, 1) || matchesWithKeep(cleaned, 2);
}
