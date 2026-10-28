export function normalizeWhatsAppPhone(phone: string): string | null {
  let digits = phone.trim().replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `27${digits.slice(1)}`;
  else if (digits.length === 9) digits = `27${digits}`;
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

export function reviewWhatsAppUrl(input: { phone: string; customerName: string; reviewUrl: string; photosRequired?: boolean }): string | null {
  const phone = normalizeWhatsAppPhone(input.phone);
  if (!phone) return null;
  const firstName = input.customerName.trim().split(/\s+/)[0] || "there";
  const reviewRequest = input.photosRequired === false
    ? "an honest review. Photos are completely optional."
    : "an honest review with photos of your hats.";
  const message = `Hey ${firstName}, hope you’ve been enjoying your Smelt! 🙂\n\nIf you have a minute, we’d really appreciate ${reviewRequest} We’ll refund you R50 per hat you bought in that order as a thank you, whatever rating you give.\n\nHere’s your personal review link:\n${input.reviewUrl}\n\nWe’ll send the refund back to your original payment method within a couple of days of your review.\n\nThanks so much! Tom & Marc`;
  return `https://wa.me/${phone}?${new URLSearchParams({ text: message })}`;
}
