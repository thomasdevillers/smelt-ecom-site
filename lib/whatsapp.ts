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
  const message = `Hi ${firstName}, thank you for choosing Smelt. We’d love your honest take on your order. Leave one review with photos of your hats and we’ll refund R50 for every hat you bought. Every rating counts. We’ll return the refund to your original payment method within a couple of days. Your personal review link is below:\n\n${input.reviewUrl}\n\nWarm regards, Tom & Marc`;
  return `https://wa.me/${phone}?${new URLSearchParams({ text: message })}`;
}
