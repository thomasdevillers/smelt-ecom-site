export function normalizeWhatsAppPhone(phone: string): string | null {
  let digits = phone.trim().replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `27${digits.slice(1)}`;
  else if (digits.length === 9) digits = `27${digits}`;
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

export function reviewWhatsAppUrl(input: { phone: string; customerName: string; reviewUrl: string }): string | null {
  const phone = normalizeWhatsAppPhone(input.phone);
  if (!phone) return null;
  const firstName = input.customerName.trim().split(/\s+/)[0] || "there";
  const message = `Hi ${firstName}, thank you for choosing Smelt. We’d love to hear how you’re enjoying your sauna hat. You can leave a verified review and add photos here:\n\n${input.reviewUrl}\n\nThank you!`;
  return `https://wa.me/${phone}?${new URLSearchParams({ text: message })}`;
}
