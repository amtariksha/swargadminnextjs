// Phone normalisation for Desk. app_db.users.phone is 10 digits, public.contacts.phone is
// normally 91 + 10 digits, and other stores hold a mix; every lookup there is an exact match,
// so the same person must be asked for under every form. Pure: no I/O, never throws.

type PhoneInput = string | number | null | undefined;

const ALLOWED_CHARACTERS = /^[\d+\-().\s]+$/;
const NATIONAL_TEN = /^[1-9][0-9]{9}$/;

/** Digits of the input, or null when it is empty or holds anything but digits and phone punctuation. */
function cleanDigits(phone: PhoneInput): string | null {
    if (phone === null || phone === undefined) return null;
    const raw = String(phone).trim();
    if (raw.length === 0 || !ALLOWED_CHARACTERS.test(raw)) return null;
    return raw.replace(/\D/g, '');
}

function nationalPart(digits: string): string | null {
    if (digits.length === 10) return digits;
    if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
    if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
    if (digits.length === 13 && digits.startsWith('091')) return digits.slice(3);
    if (digits.length === 14 && digits.startsWith('0091')) return digits.slice(4);
    return null;
}

function nationalTen(phone: PhoneInput): string | null {
    const digits = cleanDigits(phone);
    if (digits === null) return null;
    const national = nationalPart(digits);
    return national !== null && NATIONAL_TEN.test(national) ? national : null;
}

export function toBackendPhone(phone: string | number | null | undefined): string | null {
    return nationalTen(phone);
}

export function toWhatsAppPhone(phone: string | number | null | undefined): string | null {
    const national = nationalTen(phone);
    return national === null ? null : `91${national}`;
}

export function phoneVariants(phone: string | number | null | undefined): string[] {
    const national = nationalTen(phone);
    if (national !== null) return [national, `91${national}`];
    const digits = cleanDigits(phone);
    if (digits !== null && digits.length >= 11 && digits.length <= 15 && !digits.startsWith('0')) {
        return [digits];
    }
    return [];
}
