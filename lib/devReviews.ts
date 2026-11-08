import { reviewSummary, type PublicReview } from "./reviews";

// Read-only fixtures for `next dev`. Never inserted into the review store.
const reviews: PublicReview[] = [
  {
    id: "dev-review-long",
    displayName: "Alex · sample review",
    rating: 5,
    body: "I wasn’t sure what to expect from a sauna hat, but the loose fit is really comfortable. It packs easily into my gym bag and there’s plenty of room for my hair.\n\nThe felt was a little stiff when it arrived, then settled into shape after a few sessions. I leave it out to air-dry when I get home. The embroidery is a lovely detail too.\n\nThis is a sample review for checking longer text, paragraph spacing and photos in local development.",
    colours: ["cream"],
    photos: [{ url: "/images/cream-hat-sauna-portrait.webp", pathname: "dev/sample-portrait" }],
    verifiedPurchase: true,
    incentivized: false,
    publishedAt: "2026-11-07T12:00:00.000Z",
  },
  {
    id: "dev-review-short",
    displayName: "Sam · sample review",
    rating: 5,
    body: "Lovely deep green colour and a comfortable, roomy fit. A simple addition to my sauna bag.",
    colours: ["green"],
    photos: [],
    verifiedPurchase: true,
    incentivized: false,
    publishedAt: "2026-11-06T12:00:00.000Z",
  },
  {
    id: "dev-review-bundle",
    displayName: "Jamie · sample review",
    rating: 4,
    body: "We ordered one of each colour. Both look great, although the hat sits more loosely than I expected. The care instructions were helpful.\n\nThese are placeholder photos from the site, not customer uploads.",
    colours: ["green", "cream"],
    photos: [
      { url: "/images/hat-green-front-nobg.png", pathname: "dev/sample-green" },
      { url: "/images/hat-cream-front-nobg.png", pathname: "dev/sample-cream" },
    ],
    verifiedPurchase: true,
    incentivized: false,
    publishedAt: "2026-11-05T12:00:00.000Z",
  },
];

export function developmentReviews() {
  return { reviews, summary: reviewSummary(reviews) };
}
