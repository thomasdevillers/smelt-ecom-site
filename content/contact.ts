import { SOCIAL_LINKS } from "./social";

export const CONTACT = {
  eyebrow: "Say hello",
  title: "Questions, orders, or just want to talk sauna?",
  intro:
    "We're a two-person operation in Cape Town, so you'll always reach an actual founder. Drop us a line and we'll get back to you within a day or two.",
  methods: [
    { label: "General enquiries", value: "hello@saunahat.co.za", href: "mailto:hello@saunahat.co.za" },
    { label: "Returns", value: "returns@saunahat.co.za", href: "mailto:returns@saunahat.co.za" },
    { label: "Phone", value: "083 787 5826", href: "tel:+27837875826" },
    ...SOCIAL_LINKS,
    { label: "Based in", value: "Cape Town, South Africa", href: null },
  ],
  hours: "We read everything Monday to Friday, and most of the weekend if we're honest.",
  signoff: "Warm regards, Tom & Marc.",
};
